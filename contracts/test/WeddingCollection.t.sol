// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {WeddingCollection} from "../src/WeddingCollection.sol";

contract WeddingCollectionTest is Test {
    WeddingCollection nft;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant POOL = 16;
    uint64 start;
    uint64 end;

    function setUp() public {
        start = uint64(block.timestamp + 1 hours);
        end = uint64(start + 48 hours);

        vm.prank(owner);
        nft = new WeddingCollection("Taigaz", "TAIGAZ", POOL, owner);

        // Configure all 16 designs with default weight 1.
        uint256[] memory ids = new uint256[](POOL);
        uint256[] memory weights = new uint256[](POOL);
        string[] memory uris = new string[](POOL);
        for (uint256 i = 0; i < POOL; i++) {
            ids[i] = i;
            weights[i] = 1;
            uris[i] = string.concat("https://host/metadata/", vm.toString(i), ".json");
        }
        vm.startPrank(owner);
        nft.setDesigns(ids, weights, uris);
        nft.setGoldenURI("https://host/metadata/golden.json");
        nft.setMintWindow(start, end);
        vm.stopPrank();

        vm.warp(start);
    }

    // --- helpers ----------------------------------------------------------

    /// @dev Mint once for `user`, advancing time past the cooldown each call.
    function _mint(address user) internal returns (uint256 id) {
        vm.prank(user);
        id = nft.mint();
        vm.warp(block.timestamp + nft.MINT_COOLDOWN());
    }

    // --- window -----------------------------------------------------------

    function test_MintRevertsBeforeWindow() public {
        vm.warp(start - 1);
        vm.expectRevert(WeddingCollection.MintNotOpen.selector);
        vm.prank(alice);
        nft.mint();
    }

    function test_MintRevertsAfterWindow() public {
        vm.warp(uint256(end) + 1);
        vm.expectRevert(WeddingCollection.MintNotOpen.selector);
        vm.prank(alice);
        nft.mint();
    }

    function test_MintOpenWithinWindow() public {
        assertTrue(nft.isMintOpen());
        uint256 id = _mint(alice);
        assertEq(nft.ownerOf(id), alice);
    }

    // --- cooldown ---------------------------------------------------------

    function test_CooldownEnforced() public {
        vm.prank(alice);
        nft.mint();
        // Immediately mint again -> cooldown revert.
        vm.expectRevert(
            abi.encodeWithSelector(
                WeddingCollection.CooldownActive.selector,
                block.timestamp + nft.MINT_COOLDOWN()
            )
        );
        vm.prank(alice);
        nft.mint();
    }

    function test_CooldownPassesAfterDelay() public {
        vm.prank(alice);
        nft.mint();
        vm.warp(block.timestamp + nft.MINT_COOLDOWN());
        vm.prank(alice);
        nft.mint();
        assertEq(nft.balanceOf(alice), 2);
    }

    // --- one of each ------------------------------------------------------

    function test_CompleteCollectionThenMintGoldenReward() public {
        // Duplicates are allowed, so completion may take more than POOL mints.
        uint256 guard;
        while (!nft.isComplete(alice)) {
            _mint(alice);
            require(++guard < 1000, "did not complete");
        }
        assertTrue(nft.isComplete(alice));
        assertEq(nft.poolOwnedCount(alice), POOL);

        // Every design owned at least once.
        for (uint256 d = 0; d < POOL; d++) {
            assertTrue(nft.ownsDesign(alice, d));
            assertGe(nft.copiesOf(alice, d), 1);
        }

        // Once complete, the next mint yields the golden-queen reward.
        assertFalse(nft.goldenClaimed(alice));
        uint256 goldenId = _mint(alice);
        assertEq(nft.designOf(goldenId), nft.GOLDEN_DESIGN());
        assertTrue(nft.goldenClaimed(alice));

        // The reward is one-time: a further mint reverts.
        vm.expectRevert(WeddingCollection.CollectionAlreadyComplete.selector);
        vm.prank(alice);
        nft.mint();
    }

    /// @dev A completer who mints their golden AFTER someone already found it
    ///      does NOT replace the registered first finder.
    function test_CompletionGoldenDoesNotReplaceFinder() public {
        // bob discovers the golden first via the 50th-mint mechanic.
        vm.prank(bob);
        nft.setPseudo("bob-first");
        _mint(bob);
        _mint(bob);
        for (uint256 i = 2; i < 49; i++) {
            _mint(address(uint160(0x7000 + i)));
        }
        _mint(bob); // 50th -> bob is the finder
        assertTrue(nft.goldenFound());
        assertEq(nft.goldenFinder(), bob);
        uint256 trophyToken = nft.goldenTokenId();

        // alice later completes the set and claims her reward golden.
        vm.prank(alice);
        nft.setPseudo("alice-late");
        uint256 guard;
        while (!nft.isComplete(alice)) {
            _mint(alice);
            require(++guard < 1000, "did not complete");
        }
        uint256 aliceGolden = _mint(alice);
        assertEq(nft.designOf(aliceGolden), nft.GOLDEN_DESIGN());

        // Finder title is unchanged — still bob.
        assertEq(nft.goldenFinder(), bob);
        assertEq(nft.goldenFinderPseudo(), "bob-first");
        assertEq(nft.goldenTokenId(), trophyToken);
        assertTrue(aliceGolden != trophyToken);
    }

    function test_CopiesAndBalanceStayConsistent() public {
        uint256 guard;
        while (!nft.isComplete(alice)) {
            _mint(alice);
            require(++guard < 1000, "did not complete");
        }
        uint256 sum;
        for (uint256 d = 0; d < POOL; d++) {
            sum += nft.copiesOf(alice, d);
        }
        // Every pool token is accounted for by exactly one design copy.
        assertEq(sum, nft.balanceOf(alice));
    }

    // --- golden (single, first-finder registered) -------------------------

    /// @dev The 50th mint by an eligible wallet finds THE golden, registers the
    ///      finder + pseudo, and it is queryable on-chain.
    function test_GoldenFoundOn50thAndRegistersFinder() public {
        // bob sets a pseudo and holds 2 NFTs so he's eligible.
        vm.prank(bob);
        nft.setPseudo("bob.eth");
        _mint(bob);
        _mint(bob); // totalMints = 2

        // Push the counter to 49 with fresh wallets.
        for (uint256 i = 2; i < 49; i++) {
            _mint(address(uint160(0x1000 + i)));
        }
        assertEq(nft.totalMints(), 49);

        assertFalse(nft.goldenFound());

        // 50th mint by eligible bob -> finds the golden.
        uint256 poolBefore = nft.poolOwnedCount(bob);
        uint256 id = _mint(bob);

        assertEq(nft.designOf(id), nft.GOLDEN_DESIGN());
        assertEq(nft.poolOwnedCount(bob), poolBefore); // golden replaces the roll
        assertEq(nft.tokenURI(id), "https://host/metadata/golden.json");

        // Registration is queryable.
        assertTrue(nft.goldenFound());
        assertEq(nft.goldenFinder(), bob);
        assertEq(nft.goldenFinderPseudo(), "bob.eth");
        assertEq(nft.goldenTokenId(), id);
        assertGt(nft.goldenFoundAt(), 0);

        (bool found, address finder, string memory pseudo, uint256 tokenId,) = nft.goldenInfo();
        assertTrue(found);
        assertEq(finder, bob);
        assertEq(pseudo, "bob.eth");
        assertEq(tokenId, id);
    }

    /// @dev There is only ONE golden: once found, later 50th mints never mint
    ///      another golden and the finder registration is immutable.
    function test_OnlyOneGoldenEver() public {
        // Reach and claim the golden with bob at mint #50.
        _mint(bob);
        _mint(bob);
        for (uint256 i = 2; i < 49; i++) {
            _mint(address(uint160(0x3000 + i)));
        }
        uint256 id = _mint(bob); // 50th -> golden
        assertEq(nft.designOf(id), nft.GOLDEN_DESIGN());
        assertTrue(nft.goldenFound());

        // Drive to the 100th mint; nobody should get another golden.
        for (uint256 i = 50; i < 100; i++) {
            uint256 idN = _mint(address(uint160(0x4000 + i)));
            assertLt(nft.designOf(idN), POOL); // always a pool design now
        }
        assertEq(nft.totalMints(), 100);

        // Finder registration is unchanged.
        assertEq(nft.goldenFinder(), bob);
        assertEq(nft.goldenTokenId(), id);
    }

    /// @dev If the 50th minter is ineligible (<2 NFTs), the golden defers and
    ///      the next eligible wallet becomes the registered finder.
    function test_GoldenDefersToNextEligibleFinder() public {
        vm.prank(bob);
        nft.setPseudo("bob");
        _mint(bob);
        _mint(bob); // bob eligible

        for (uint256 i = 2; i < 49; i++) {
            _mint(address(uint160(0x2000 + i)));
        }
        assertEq(nft.totalMints(), 49);

        // 50th by a brand-new wallet (0 balance) -> ineligible, defers.
        address newbie = makeAddr("newbie");
        uint256 id50 = _mint(newbie);
        assertLt(nft.designOf(id50), POOL);
        assertTrue(nft.goldenPending());
        assertFalse(nft.goldenFound());

        // Next eligible mint (bob) becomes the finder.
        uint256 idG = _mint(bob);
        assertEq(nft.designOf(idG), nft.GOLDEN_DESIGN());
        assertFalse(nft.goldenPending());
        assertTrue(nft.goldenFound());
        assertEq(nft.goldenFinder(), bob);
        assertEq(nft.goldenFinderPseudo(), "bob");
    }

    /// @dev A contract account that does NOT implement onERC721Received (like an
    ///      ERC-7579 Kernel smart account) can still mint — proving we use _mint,
    ///      not _safeMint. With _safeMint this would revert (ERC721InvalidReceiver).
    function test_NonReceiverContractCanMint() public {
        NonReceiverAccount acct = new NonReceiverAccount();
        uint256 id = acct.doMint(nft);
        assertEq(nft.ownerOf(id), address(acct));
        assertEq(nft.balanceOf(address(acct)), 1);
    }

    /// @dev mintAs sets the pseudo used at golden-claim time in one call.
    function test_MintAsSetsPseudo() public {
        vm.prank(alice);
        nft.mintAs("alice.taiga");
        assertEq(nft.pseudoOf(alice), "alice.taiga");
    }

    // --- gasless / ERC-4337 smart account ---------------------------------

    /// @dev Under ERC-4337, a guest transacts through a smart-contract account
    ///      that IS msg.sender. Verify a contract account can mint, receive the
    ///      NFT (ERC721Receiver), and have all per-wallet logic key off its
    ///      address (cooldown enforced against the account, golden eligibility
    ///      via its balance).
    function test_SmartAccountCanMintAndCooldownApplies() public {
        MockSmartAccount account = new MockSmartAccount();

        uint256 id = account.doMint(nft);
        assertEq(nft.ownerOf(id), address(account));
        assertEq(nft.balanceOf(address(account)), 1);

        // Cooldown is keyed off the smart-account address.
        vm.expectRevert(
            abi.encodeWithSelector(
                WeddingCollection.CooldownActive.selector,
                block.timestamp + nft.MINT_COOLDOWN()
            )
        );
        account.doMint(nft);

        // After the 15s cooldown it can mint again.
        vm.warp(block.timestamp + nft.MINT_COOLDOWN());
        account.doMint(nft);
        assertEq(nft.balanceOf(address(account)), 2);
    }

    // --- config guards ----------------------------------------------------

    function test_OnlyOwnerCanSetWindow() public {
        vm.expectRevert();
        vm.prank(alice);
        nft.setMintWindow(start, end);
    }

    function test_SetDesignRejectsOutOfRange() public {
        vm.expectRevert(WeddingCollection.InvalidDesign.selector);
        vm.prank(owner);
        nft.setDesign(POOL, 1, "x");
    }

    function test_InvalidWindowReverts() public {
        vm.expectRevert(WeddingCollection.InvalidWindow.selector);
        vm.prank(owner);
        nft.setMintWindow(end, start);
    }

    // --- fuzz -------------------------------------------------------------

    /// @dev Regardless of RNG path, a wallet always eventually completes the
    ///      set (every design owned >=1), and completion blocks further mints.
    function testFuzz_CompletionInvariant(uint256 seed) public {
        vm.warp(start + (seed % 40 hours));
        uint256 guard;
        while (!nft.isComplete(alice)) {
            vm.prank(alice);
            nft.mint();
            vm.warp(block.timestamp + 31 + (uint256(keccak256(abi.encode(seed, guard))) % 100));
            require(++guard < 2000, "did not complete");
        }
        assertEq(nft.poolOwnedCount(alice), POOL);
        for (uint256 d = 0; d < POOL; d++) {
            assertTrue(nft.ownsDesign(alice, d));
        }
    }

    // --- rarity + anti-duplicate weighting --------------------------------

    /// @dev The copy multiplier: 0->1000, 1->10, 2->4, 3->2, else 1.
    function test_CopyMultiplierCurve() public {
        WeddingCollectionHarness h = new WeddingCollectionHarness(owner);
        assertEq(h.copyMultiplier(0), 1000);
        assertEq(h.copyMultiplier(1), 10);
        assertEq(h.copyMultiplier(2), 4);
        assertEq(h.copyMultiplier(3), 2);
        assertEq(h.copyMultiplier(20), 1);
    }

    /// @dev An unowned design (x1000) is drawn far more often than one already
    ///      held (x10 at 1 copy), at equal rarity.
    function test_UnownedFavoredOverOwned() public {
        WeddingCollectionHarness h = new WeddingCollectionHarness(owner);
        uint256 ownedD = 5;   // 1 copy -> multiplier 10
        uint256 unownedD = 6; // 0 copies -> multiplier 1000
        h.setCopies(alice, ownedD, 1);

        uint256 N = 6000;
        uint256 pickedOwned;
        uint256 pickedUnowned;
        for (uint256 r = 0; r < N; r++) {
            uint256 d = h.selectDesign(alice, uint256(keccak256(abi.encode(r))));
            if (d == ownedD) pickedOwned++;
            if (d == unownedD) pickedUnowned++;
        }
        // ~1000 vs ~10 -> a single unowned design dwarfs the owned one.
        assertGt(pickedUnowned, pickedOwned * 10);
    }

    /// @dev Rarity still differentiates among unowned designs (all copies 0, so
    ///      the effective weight is just the rarity weight).
    function test_WeightedDrawFavorsCommon() public {
        WeddingCollectionHarness h = new WeddingCollectionHarness(owner);
        vm.startPrank(owner);
        h.setDesign(1, 100, "common"); // martial_art
        h.setDesign(0, 30, "epic");    // samurai
        vm.stopPrank();

        uint256 N = 6000;
        uint256 common;
        uint256 epic;
        for (uint256 r = 0; r < N; r++) {
            uint256 idx = h.selectDesign(alice, uint256(keccak256(abi.encode(r))));
            if (idx == 1) common++;
            if (idx == 0) epic++;
        }
        // ~100 vs ~30 -> common dominates by roughly 3x.
        assertGt(common, epic * 2);
    }

    /// @dev The new weighting completes the set quickly with few duplicates.
    ///      Averaged over several runs, completion should take well under the
    ///      ~80 mints the old 1/X rule needed (expected ~25).
    function test_CompletesQuicklyWithFewDoubles() public {
        uint256 runs = 8;
        uint256 totalMintsAcross;
        for (uint256 s = 0; s < runs; s++) {
            address u = address(uint160(0x9000 + s));
            vm.warp(start + s * 137);
            uint256 mints;
            while (!nft.isComplete(u)) {
                vm.prank(u);
                nft.mint();
                vm.warp(block.timestamp + 11 + (uint256(keccak256(abi.encode(s, mints))) % 50));
                require(++mints < 500, "did not complete");
            }
            totalMintsAcross += mints;
        }
        uint256 avg = totalMintsAcross / runs;
        emit log_named_uint("avg mints to complete 16", avg);
        assertLt(avg, 45); // was ~80 under the old rule
    }
}

/// @dev Test-only harness exposing the internal selection and multiplier plus a
///      setter to seed per-design copy counts directly.
contract WeddingCollectionHarness is WeddingCollection {
    constructor(address owner_) WeddingCollection("H", "H", 16, owner_) {}

    function setCopies(address to, uint256 designId, uint256 count) external {
        uint256 shift = designId * 16;
        _packedCopies[to] = (_packedCopies[to] & ~(uint256(0xFFFF) << shift)) | (count << shift);
    }

    function selectDesign(address to, uint256 rand) external view returns (uint256) {
        return _selectDesign(_packedCopies[to], rand);
    }

    function copyMultiplier(uint256 copies) external pure returns (uint256) {
        return _copyMultiplier(copies);
    }
}

/// @dev A contract account that does NOT implement onERC721Received — mirrors an
///      ERC-7579 Kernel account. Used to prove _mint (not _safeMint) is used.
contract NonReceiverAccount {
    function doMint(WeddingCollection nft) external returns (uint256) {
        return nft.mint();
    }
}

/// @dev Minimal stand-in for an ERC-4337 smart account: a contract that can
///      call mint() (becoming msg.sender) and safely receive ERC-721 tokens.
contract MockSmartAccount is IERC721Receiver {
    function doMint(WeddingCollection nft) external returns (uint256) {
        return nft.mint();
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}
