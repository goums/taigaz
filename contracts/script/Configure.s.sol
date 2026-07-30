// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WeddingCollection} from "../src/WeddingCollection.sol";

/**
 * @notice Configures rarity weights and metadata URIs for the 16 pool designs
 *         plus the golden token, then (optionally) opens the 48h mint window.
 *
 * Rarity tiers -> selection weights (higher = more common on each draw):
 *   common = 100, rare = 60, epic = 30.
 * The golden queen is "legendary" but is NOT weighted here — it is awarded by
 * the every-50th-mint mechanism and shares a single metadata URI.
 *
 * Metadata URIs are built as `${BASE_URI}/${designId}.json` (golden.json for
 * the golden). Set BASE_URI to your hosting root, e.g.
 *   https://taigaz.vercel.app/metadata
 *
 * Usage:
 *   NFT=0x... BASE_URI=https://taigaz.vercel.app/metadata \
 *   forge script script/Configure.s.sol --rpc-url base --broadcast
 *
 * Env:
 *   NFT        deployed WeddingCollection address
 *   BASE_URI   metadata root (no trailing slash)
 *   PRIVATE_KEY owner key
 *   OPEN_WINDOW (optional "true") -> also set a 48h window starting now
 */
contract Configure is Script {
    uint256 constant COMMON = 100;
    uint256 constant RARE = 60;
    uint256 constant EPIC = 30;

    function run() external {
        WeddingCollection nft = WeddingCollection(vm.envAddress("NFT"));
        string memory baseURI = vm.envString("BASE_URI");
        string memory pkStr = vm.envOr("PRIVATE_KEY", string(""));
        bool hasPk = bytes(pkStr).length > 0;

        uint256[] memory ids = new uint256[](16);
        uint256[] memory weights = new uint256[](16);
        string[] memory uris = new string[](16);

        // designId => weight (see table in project notes).
        uint256[16] memory w = [
            EPIC,   //  0 samurai
            COMMON, //  1 martial_art
            RARE,   //  2 cheerleader
            RARE,   //  3 baby
            COMMON, //  4 books
            COMMON, //  5 bretonne
            COMMON, //  6 lyon
            RARE,   //  7 karaoke_kpop
            COMMON, //  8 cooking
            EPIC,   //  9 kimono
            RARE,   // 10 hacker
            RARE,   // 11 aviator
            RARE,   // 12 blueprint
            COMMON, // 13 gaming
            COMMON, // 14 ramen
            COMMON  // 15 fitness
        ];

        for (uint256 i = 0; i < 16; i++) {
            ids[i] = i;
            weights[i] = w[i];
            uris[i] = string.concat(baseURI, "/", vm.toString(i), ".json");
        }

        if (hasPk) {
            bytes memory b = bytes(pkStr);
            bool has0x = b.length >= 2 && b[0] == 0x30 && (b[1] == 0x78 || b[1] == 0x58);
            vm.startBroadcast(uint256(vm.parseBytes32(has0x ? pkStr : string.concat("0x", pkStr))));
        } else {
            vm.startBroadcast(); // uses --account / --sender from the CLI
        }
        nft.setDesigns(ids, weights, uris);
        nft.setGoldenURI(string.concat(baseURI, "/golden.json"));

        if (vm.envOr("OPEN_WINDOW", false)) {
            uint64 start = uint64(block.timestamp);
            // MINT_END (unix seconds) if provided, else a 48h window.
            uint64 end = uint64(vm.envOr("MINT_END", uint256(start) + 48 hours));
            nft.setMintWindow(start, end);
            console2.log("Mint window start:", start);
            console2.log("Mint window end:", end);
        }
        vm.stopBroadcast();

        console2.log("Configured 16 designs + golden for", address(nft));
    }
}
