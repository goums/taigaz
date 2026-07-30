// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WeddingCollection} from "../src/WeddingCollection.sol";

/**
 * @notice Deploys WeddingCollection to Base and (optionally) configures it.
 *
 * Gasless UX is handled off-chain via ERC-4337 smart accounts + a paymaster
 * (Coinbase CDP), so the contract itself needs no forwarder: guests' smart
 * accounts call mint() directly and the paymaster sponsors gas.
 *
 * Usage (env private key):
 *   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
 *
 * Usage (encrypted keystore, no key in any file):
 *   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify \
 *     --account taigazDeployer --sender <deployer-address>
 *
 * Env:
 *   PRIVATE_KEY optional; if unset, the CLI --account/--sender broadcaster is used
 *   OWNER       optional admin address (defaults to the deployer/broadcaster)
 */
contract Deploy is Script {
    uint256 constant POOL_SIZE = 16; // designs 02..17 (golden is separate)

    function run() external returns (WeddingCollection nft) {
        // Detect the key via a string read (vm.envUint parses hex; vm.envOr with
        // a uint default silently returns 0 on a 0x-string in this Foundry build).
        string memory pkStr = vm.envOr("PRIVATE_KEY", string(""));
        address deployer;
        if (bytes(pkStr).length > 0) {
            uint256 pk = _toPk(pkStr);
            deployer = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            deployer = msg.sender; // keystore / --sender path
            vm.startBroadcast();
        }
        address owner = vm.envOr("OWNER", deployer);
        nft = new WeddingCollection(
            "Taigaz",
            "TAIGAZ",
            POOL_SIZE,
            owner
        );
        vm.stopBroadcast();

        console2.log("WeddingCollection:", address(nft));
        console2.log("owner:", owner);
        console2.log("Next: setDesigns(), setGoldenURI(), setMintWindow(start, start+48h)");
    }

    /// @dev Parse a private key from env, tolerating a missing 0x prefix.
    function _toPk(string memory s) internal view returns (uint256) {
        bytes memory b = bytes(s);
        bool has0x = b.length >= 2 && b[0] == 0x30 && (b[1] == 0x78 || b[1] == 0x58);
        return uint256(vm.parseBytes32(has0x ? s : string.concat("0x", s)));
    }
}
