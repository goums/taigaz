// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WeddingCollection
 * @notice Private-event NFT collection with a fixed pool of unique designs.
 *
 * Design summary (see project brief):
 *  - A guest can mint as many times as they like until they own one of every
 *    pool design ("collection completed"), after which minting is blocked for
 *    that wallet. Designs are per-wallet editions: a wallet holds at most one
 *    of each design, and the global supply per design is not scarce.
 *  - A wallet must wait at least MINT_COOLDOWN (15s) between two mints.
 *  - Minting is only open inside a fixed time window (~48h).
 *  - Rarity + anti-duplicate: each roll is a weighted random pick over all pool
 *    designs, where a design's weight is its rarity weight scaled by
 *    100/(copies+1)^2. Unowned designs (x100) dominate owned ones, so the set
 *    completes quickly with few duplicates while rarity still applies.
 *  - Golden NFT: discovered on every GOLDEN_INTERVAL-th global mint, but only by
 *    a wallet holding >= GOLDEN_MIN_BALANCE NFTs. If the triggering wallet is
 *    ineligible, the discovery becomes "pending" and passes to the next eligible
 *    wallet. Additionally, once a wallet completes the whole set it can mint a
 *    one-time golden-queen reward. The FIRST golden minted by any path registers
 *    the immutable finder (goldenFinder / goldenFinderPseudo); later goldens mint
 *    the token but never replace that "found it first" title.
 *  - Gasless UX (ERC-4337): guests sign in with a social/embedded wallet and
 *    transact through an ERC-4337 smart account. A paymaster (Coinbase CDP)
 *    sponsors gas, so the guest pays nothing. The smart account IS msg.sender,
 *    so this contract needs no meta-transaction / forwarder plumbing: all
 *    per-wallet logic keys off the stable smart-account address.
 *
 * Randomness note: selection uses on-chain pseudo-randomness (keccak of block
 * data + minter + nonce). This is theoretically manipulable by a block proposer,
 * which is an acceptable tradeoff for a private wedding event. Do NOT reuse this
 * contract for a value-bearing public drop without a VRF.
 */
contract WeddingCollection is ERC721, Ownable {
    // --- Constants ---------------------------------------------------------

    /// @notice Number of unique pool designs (design ids 0..POOL_SIZE-1).
    uint256 public immutable POOL_SIZE;

    /// @notice Minimum delay between two mints from the same wallet.
    uint256 public constant MINT_COOLDOWN = 10 seconds;

    /// @notice The (single) golden becomes due on every GOLDEN_INTERVAL-th mint
    ///         until it has been found.
    uint256 public constant GOLDEN_INTERVAL = 50;

    /// @notice A wallet needs at least this many NFTs to claim the golden.
    uint256 public constant GOLDEN_MIN_BALANCE = 2;

    /// @notice Sentinel design id used for golden tokens.
    uint256 public constant GOLDEN_DESIGN = type(uint256).max;

    // --- Mint window -------------------------------------------------------

    uint64 public mintStart;
    uint64 public mintEnd;

    // --- Counters & bookkeeping -------------------------------------------

    /// @notice Total number of successful mints (pool + golden).
    uint256 public totalMints;

    /// @notice Total golden-queen tokens minted (discovery + completion rewards).
    uint256 public goldenMintedCount;

    /// @notice Number of distinct wallets that currently hold >= 1 Taigaz.
    ///         Maintained in {_update}: exact and transfer-aware.
    uint256 public holders;

    /// @notice Global count of each pool design minted, packed 16 x 16 bits into
    ///         one slot (design d => (_packedMinted >> d*16) & 0xFFFF). Powers a
    ///         public "how many of each design" summary in a single read.
    uint256 internal _packedMinted;

    /// @notice Next tokenId to assign (tokens are 1-indexed; 0 is unused).
    uint256 private _nextTokenId = 1;

    /// @notice True when the golden was triggered but not yet awarded.
    bool public goldenPending;

    // --- The one golden ----------------------------------------------------

    /// @notice Whether the single golden NFT has been found/claimed.
    bool public goldenFound;

    /// @notice Wallet that found the golden (address(0) until found).
    address public goldenFinder;

    /// @notice Pseudo of the finder, snapshotted at claim time.
    string public goldenFinderPseudo;

    /// @notice tokenId of the golden (0 until found).
    uint256 public goldenTokenId;

    /// @notice Timestamp the golden was found (0 until found).
    uint256 public goldenFoundAt;

    /// @notice Optional display name per wallet, snapshotted when they mint.
    mapping(address => string) public pseudoOf;

    /// @notice Whether a wallet has already claimed its completion-reward golden.
    mapping(address => bool) public goldenClaimed;

    /// @notice tokenId => designId (GOLDEN_DESIGN for golden tokens).
    mapping(uint256 => uint256) public designOf;

    /// @notice Per-wallet copy counts, packed 16 designs x 16 bits into one slot.
    /// @dev design d's count = (_packedCopies[to] >> (d*16)) & 0xFFFF. Reading all
    ///      16 counts is a single SLOAD, which keeps mint gas low (the previous
    ///      per-design mapping cost ~16 cold SLOADs per selection and caused
    ///      intermittent out-of-gas reverts under the bundler's gas estimate).
    ///      `internal` so a test harness can seed it; reads go through {copiesOf}.
    mapping(address => uint256) internal _packedCopies;

    /// @notice Last mint timestamp per wallet (cooldown enforcement).
    mapping(address => uint256) public lastMintAt;

    // --- Design config -----------------------------------------------------

    /// @notice Selection weights packed 16 designs x 16 bits into one slot, so
    ///         the whole rarity table is one SLOAD during selection.
    uint256 internal _packedWeights;

    /// @notice Metadata URI per design id (pool ids and GOLDEN_DESIGN).
    mapping(uint256 => string) private _designURI;

    // --- Events ------------------------------------------------------------

    event Minted(address indexed to, uint256 indexed tokenId, uint256 designId);
    event GoldenFound(address indexed finder, uint256 indexed tokenId, string pseudo);
    event GoldenRewardClaimed(address indexed wallet, uint256 indexed tokenId);
    event GoldenDeferred(address indexed triggeredBy);
    event CollectionCompleted(address indexed wallet);
    event MintWindowUpdated(uint64 start, uint64 end);
    event DesignConfigured(uint256 indexed designId, uint256 weight, string uri);
    event PseudoSet(address indexed wallet, string pseudo);

    // --- Errors ------------------------------------------------------------

    error MintNotOpen();
    error CooldownActive(uint256 availableAt);
    error CollectionAlreadyComplete();
    error PoolExhaustedUnexpectedly();
    error InvalidWindow();
    error InvalidDesign();
    error ZeroWeight();

    /**
     * @param name_     ERC721 name.
     * @param symbol_   ERC721 symbol.
     * @param poolSize_ Number of unique pool designs (e.g. 16).
     * @param owner_    Admin able to configure designs and the window.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 poolSize_,
        address owner_
    ) ERC721(name_, symbol_) Ownable(owner_) {
        require(poolSize_ > 0 && poolSize_ <= 16, "poolSize 1..16"); // packed 16x16 bits
        POOL_SIZE = poolSize_;
    }

    // =======================================================================
    //                              Minting
    // =======================================================================

    /// @notice Mint one NFT for the calling guest.
    function mint() external returns (uint256 tokenId) {
        return _mintFor(_msgSender());
    }

    /// @notice Mint while (re)setting your pseudo — used so that whoever finds
    ///         the golden is registered under a human-readable name.
    function mintAs(string calldata pseudo) external returns (uint256 tokenId) {
        address to = _msgSender();
        _setPseudo(to, pseudo);
        return _mintFor(to);
    }

    /// @notice Set the display name associated with your wallet.
    function setPseudo(string calldata pseudo) external {
        _setPseudo(_msgSender(), pseudo);
    }

    /// @notice Transfer every token you pass to `to` in a single call.
    /// @dev    Pass the tokenIds you currently own (enumerate off-chain with
    ///         {tokensOfOwner}). Each transfer runs the standard ERC721
    ///         ownership/approval checks, so any id you don't own reverts the
    ///         whole batch. Uses transferFrom (not safe) to stay compatible with
    ///         ERC-7579 smart accounts that don't implement onERC721Received —
    ///         same rationale as _mint in {_mintGolden}.
    function transferAll(address to, uint256[] calldata tokenIds) external {
        address from = _msgSender();
        for (uint256 i = 0; i < tokenIds.length; i++) {
            transferFrom(from, to, tokenIds[i]);
        }
    }

    function _setPseudo(address who, string calldata pseudo) internal {
        // Skip the SSTORE when unchanged — mintAs(pseudo) is called on every mint
        // with the same value, so this saves gas on all but the first.
        if (keccak256(bytes(pseudoOf[who])) == keccak256(bytes(pseudo))) return;
        pseudoOf[who] = pseudo;
        emit PseudoSet(who, pseudo);
    }

    function _mintFor(address to) internal returns (uint256 tokenId) {
        // 1. Window
        if (block.timestamp < mintStart || block.timestamp > mintEnd) {
            revert MintNotOpen();
        }

        // 2. Cooldown
        uint256 last = lastMintAt[to];
        if (last != 0 && block.timestamp < last + MINT_COOLDOWN) {
            revert CooldownActive(last + MINT_COOLDOWN);
        }

        // Effects that always happen before minting.
        lastMintAt[to] = block.timestamp;
        uint256 mintIndex = ++totalMints;

        // 3. Is the (single, not-yet-found) golden due this turn?
        if (!goldenFound) {
            bool goldenDue = goldenPending || (mintIndex % GOLDEN_INTERVAL == 0);
            bool eligible = balanceOf(to) >= GOLDEN_MIN_BALANCE;

            if (goldenDue && eligible) {
                goldenPending = false;
                return _mintGolden(to);
            }
            if (goldenDue && !eligible) {
                // Defer: golden waits for the next eligible wallet.
                goldenPending = true;
                emit GoldenDeferred(to);
            }
        }

        // 4. If the wallet's set is complete, mint its one-time golden-queen
        //    reward; otherwise do a normal pool mint.
        if (_distinctOwned(_packedCopies[to]) >= POOL_SIZE) {
            if (goldenClaimed[to]) revert CollectionAlreadyComplete();
            goldenClaimed[to] = true;
            tokenId = _mintGolden(to);
            emit GoldenRewardClaimed(to, tokenId);
            return tokenId;
        }
        tokenId = _mintPool(to);
    }

    /// @dev Mints a golden-queen token. The FIRST golden minted by any path
    ///      (50th-mint discovery or first completion reward) registers the
    ///      immutable finder; later goldens mint the token but never replace it.
    function _mintGolden(address to) internal returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        if (!goldenFound) {
            goldenFound = true;
            goldenFinder = to;
            goldenFinderPseudo = pseudoOf[to];
            goldenTokenId = tokenId;
            goldenFoundAt = block.timestamp;
            emit GoldenFound(to, tokenId, pseudoOf[to]);
        }

        goldenMintedCount += 1;
        designOf[tokenId] = GOLDEN_DESIGN;
        // _mint (not _safeMint): the recipient is always the caller's own
        // smart account (ERC-7579 accounts like Kernel don't implement
        // onERC721Received, which would make _safeMint revert during paymaster
        // simulation). The receiver check adds no safety here.
        _mint(to, tokenId);
        emit Minted(to, tokenId, GOLDEN_DESIGN);
    }

    function _mintPool(address to) internal returns (uint256 tokenId) {
        uint256 packed = _packedCopies[to];               // one SLOAD
        uint256 designId = _selectDesign(packed, _random(to));

        uint256 shift = designId * 16;
        uint256 prev = (packed >> shift) & 0xFFFF;
        bool newDistinct = prev == 0;
        // Write the incremented count back into the packed slot (one SSTORE).
        _packedCopies[to] = (packed & ~(uint256(0xFFFF) << shift)) | ((prev + 1) << shift);

        // Bump the global per-design tally (packed, one SSTORE) for the summary.
        uint256 gm = _packedMinted;
        _packedMinted = (gm & ~(uint256(0xFFFF) << shift)) | ((((gm >> shift) & 0xFFFF) + 1) << shift);

        tokenId = _nextTokenId++;
        designOf[tokenId] = designId;
        _mint(to, tokenId); // see _mintGolden: _mint, not _safeMint, for AA accounts
        emit Minted(to, tokenId, designId);

        if (newDistinct && _distinctOwned(_packedCopies[to]) == POOL_SIZE) {
            emit CollectionCompleted(to);
        }
    }

    /**
     * @dev Weighted random pick across ALL pool designs. A design's effective
     *      weight is rarityWeight * copyMultiplier(copies), where the multiplier
     *      drops sharply once you own a design (0 copies → x1000, 1 → x10,
     *      2 → x4, 3 → x2, else x1). An UNOWNED design therefore outweighs every
     *      owned one combined, so the set — including rare/epic designs —
     *      completes quickly with few duplicates, while rarity still orders which
     *      designs you discover first and how duplicates are distributed.
     *
     *      Reads the packed weights (one SLOAD) and takes the already-loaded
     *      packed copies, so selection does zero per-design storage reads.
     */
    function _selectDesign(uint256 packedCopies, uint256 rand) internal view returns (uint256) {
        uint256 pw = _packedWeights;
        uint256 total;
        for (uint256 i = 0; i < POOL_SIZE; i++) {
            total += _effWeight(pw, packedCopies, i);
        }
        if (total == 0) revert PoolExhaustedUnexpectedly();

        uint256 point = rand % total;
        uint256 cumulative;
        for (uint256 i = 0; i < POOL_SIZE; i++) {
            cumulative += _effWeight(pw, packedCopies, i);
            if (point < cumulative) return i;
        }
        return POOL_SIZE - 1; // Unreachable given the total accounting.
    }

    /// @dev rarityWeight(design) * copyMultiplier(copies), all from packed words.
    function _effWeight(uint256 packedWeights, uint256 packedCopies, uint256 designId)
        internal
        pure
        returns (uint256)
    {
        uint256 shift = designId * 16;
        uint256 w = (packedWeights >> shift) & 0xFFFF;
        if (w == 0) w = 1;
        uint256 c = (packedCopies >> shift) & 0xFFFF;
        return w * _copyMultiplier(c);
    }

    /// @dev Strong "own less, draw less" curve so unowned designs dominate:
    ///      0 copies -> x1000, 1 -> x10, 2 -> x4, 3 -> x2, else x1.
    function _copyMultiplier(uint256 copies) internal pure returns (uint256) {
        if (copies == 0) return 1000;
        if (copies == 1) return 10;
        if (copies == 2) return 4;
        if (copies == 3) return 2;
        return 1;
    }

    /// @dev Number of distinct designs owned, from the packed copy word.
    function _distinctOwned(uint256 packedCopies) internal view returns (uint256 n) {
        for (uint256 i = 0; i < POOL_SIZE; i++) {
            if ((packedCopies >> (i * 16)) & 0xFFFF != 0) n++;
        }
    }

    /// @dev Rarity weight for a design (>=1), decoded from the packed word.
    function _weight(uint256 designId) internal view returns (uint256) {
        uint256 w = (_packedWeights >> (designId * 16)) & 0xFFFF;
        return w == 0 ? 1 : w;
    }

    /// @dev On-chain pseudo-randomness. Acceptable for a private event only.
    function _random(address to) internal view returns (uint256) {
        return uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    to,
                    _nextTokenId,
                    totalMints
                )
            )
        );
    }

    // =======================================================================
    //                              Views
    // =======================================================================

    /// @notice Whether a wallet owns every pool design.
    function isComplete(address wallet) external view returns (bool) {
        return _distinctOwned(_packedCopies[wallet]) >= POOL_SIZE;
    }

    /// @notice Number of distinct pool designs a wallet owns (>=1 copy).
    function poolOwnedCount(address wallet) external view returns (uint256) {
        return _distinctOwned(_packedCopies[wallet]);
    }

    /// @notice All 16 packed copy counts for a wallet in one word (frontend
    ///         decodes locally instead of 16 separate reads).
    function packedCopies(address wallet) external view returns (uint256) {
        return _packedCopies[wallet];
    }


    /// @notice Rarity/selection weight configured for a design.
    function designWeight(uint256 designId) external view returns (uint256) {
        if (designId >= POOL_SIZE) revert InvalidDesign();
        return _weight(designId);
    }

    /// @notice One-shot read of the golden's status and its finder.
    /// @return found   Whether the golden has been found.
    /// @return finder  Address of the finder (address(0) if not found).
    /// @return pseudo  Finder's registered pseudo at claim time.
    /// @return tokenId The golden's tokenId (0 if not found).
    /// @return foundAt Timestamp it was found (0 if not found).
    function goldenInfo()
        external
        view
        returns (bool found, address finder, string memory pseudo, uint256 tokenId, uint256 foundAt)
    {
        return (goldenFound, goldenFinder, goldenFinderPseudo, goldenTokenId, goldenFoundAt);
    }

    /// @notice Whether a wallet already owns a given pool design.
    function ownsDesign(address wallet, uint256 designId) external view returns (bool) {
        if (designId >= POOL_SIZE) revert InvalidDesign();
        return ((_packedCopies[wallet] >> (designId * 16)) & 0xFFFF) != 0;
    }

    /// @notice Number of copies of `designId` held by `wallet`.
    function copiesOf(address wallet, uint256 designId) external view returns (uint256) {
        if (designId >= POOL_SIZE) revert InvalidDesign();
        return (_packedCopies[wallet] >> (designId * 16)) & 0xFFFF;
    }

    /// @notice Every tokenId currently owned by `wallet`.
    /// @dev    O(totalSupply) scan — intended for off-chain reads (eth_call),
    ///         which is how the app builds the {transferAll} tokenId list. Not
    ///         gas-safe to call from another contract on a large collection.
    function tokensOfOwner(address wallet) external view returns (uint256[] memory ids) {
        uint256 bal = balanceOf(wallet);
        ids = new uint256[](bal);
        if (bal == 0) return ids;
        uint256 n;
        uint256 max = _nextTokenId;
        for (uint256 id = 1; id < max && n < bal; id++) {
            if (_ownerOf(id) == wallet) ids[n++] = id;
        }
    }

    /// @notice Timestamp when `wallet` may mint again (0 if never minted).
    function nextMintAvailableAt(address wallet) external view returns (uint256) {
        uint256 last = lastMintAt[wallet];
        return last == 0 ? 0 : last + MINT_COOLDOWN;
    }

    /// @notice Whether the mint window is currently open.
    function isMintOpen() external view returns (bool) {
        return block.timestamp >= mintStart && block.timestamp <= mintEnd;
    }

    // --- Public collection stats (for an external dashboard) --------------

    /// @notice Global mint count for a single pool design.
    function mintedOf(uint256 designId) external view returns (uint256) {
        if (designId >= POOL_SIZE) revert InvalidDesign();
        return (_packedMinted >> (designId * 16)) & 0xFFFF;
    }

    /// @notice Global mint count for every pool design, as a plain array
    ///         (index = designId). Simple to consume client-side — no bit
    ///         unpacking needed.
    function mintedCounts() external view returns (uint256[] memory arr) {
        arr = new uint256[](POOL_SIZE);
        uint256 packed = _packedMinted;
        for (uint256 i = 0; i < POOL_SIZE; i++) {
            arr[i] = (packed >> (i * 16)) & 0xFFFF;
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _designURI[designOf[tokenId]];
    }

    /// @dev Maintain the distinct-holder count on every mint / transfer / burn.
    ///      `from` = previous owner (0 on mint), `to` = new owner (0 on burn).
    ///      After super._update, balances reflect the change: a receiver now at 1
    ///      is a new holder; a sender now at 0 has left.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        if (from != to) {
            if (to != address(0) && balanceOf(to) == 1) holders += 1;
            if (from != address(0) && balanceOf(from) == 0) holders -= 1;
        }
    }

    // =======================================================================
    //                          Owner configuration
    // =======================================================================

    /// @notice Open the mint window. `end` should be ~48h after `start`.
    function setMintWindow(uint64 start, uint64 end) external onlyOwner {
        if (end <= start) revert InvalidWindow();
        mintStart = start;
        mintEnd = end;
        emit MintWindowUpdated(start, end);
    }

    /// @notice Configure a pool design's selection weight and metadata URI.
    function setDesign(uint256 designId, uint256 weight, string calldata uri)
        external
        onlyOwner
    {
        if (designId >= POOL_SIZE) revert InvalidDesign();
        if (weight == 0 || weight > 0xFFFF) revert ZeroWeight();
        _setWeight(designId, weight);
        _designURI[designId] = uri;
        emit DesignConfigured(designId, weight, uri);
    }

    /// @dev Write a design's weight into the packed weights word.
    function _setWeight(uint256 designId, uint256 weight) private {
        uint256 shift = designId * 16;
        _packedWeights = (_packedWeights & ~(uint256(0xFFFF) << shift)) | (weight << shift);
    }

    /// @notice Batch-configure designs. Arrays must be equal length.
    function setDesigns(
        uint256[] calldata designIds,
        uint256[] calldata weights,
        string[] calldata uris
    ) external onlyOwner {
        require(
            designIds.length == weights.length && weights.length == uris.length,
            "length mismatch"
        );
        for (uint256 i = 0; i < designIds.length; i++) {
            uint256 designId = designIds[i];
            if (designId >= POOL_SIZE) revert InvalidDesign();
            if (weights[i] == 0 || weights[i] > 0xFFFF) revert ZeroWeight();
            _setWeight(designId, weights[i]);
            _designURI[designId] = uris[i];
            emit DesignConfigured(designId, weights[i], uris[i]);
        }
    }

    /// @notice Set the golden token metadata URI (shared by all goldens).
    function setGoldenURI(string calldata uri) external onlyOwner {
        _designURI[GOLDEN_DESIGN] = uri;
        emit DesignConfigured(GOLDEN_DESIGN, 0, uri);
    }

    /// @notice Read the configured URI for a design id (or GOLDEN_DESIGN).
    function designURI(uint256 designId) external view returns (string memory) {
        return _designURI[designId];
    }
}
