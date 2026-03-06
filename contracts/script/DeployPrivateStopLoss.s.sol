// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PrivateStopLoss.sol";

/// @notice Deploy PrivateStopLoss to Robinhood Chain testnet
/// Usage:
///   PRIVATE_KEY=0x... forge script script/DeployPrivateStopLoss.s.sol \
///     --rpc-url https://rpc.testnet.chain.robinhood.com \
///     --broadcast
contract DeployPrivateStopLoss is Script {
    // Existing addresses from primary deployment
    address constant BOT     = 0x83F9d93ddfbaB266bf7c69110dC2F15e8fF3Ad4a;
    address constant POOL    = 0xaC7681429000c66657a4c8e042f8A0C4a5f9C040;
    address constant USDC    = 0xb3485Da6BB50843a20F321653869556Dc1E2F3c2;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== PrivateStopLoss Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain:", block.chainid);

        vm.startBroadcast(deployerKey);

        PrivateStopLoss psl = new PrivateStopLoss(BOT, POOL, USDC);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PrivateStopLoss:", address(psl));
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Add address to frontend/src/config/contracts.ts as PRIVATE_STOP_LOSS_ADDRESS");
        console.log("2. Call pool.setVault(address(psl)) to wire up pool -> PSL");
        console.log("   Note: pool already has vault set to StopLossVault");
        console.log("   For hackathon demo, PSL uses same pool - LPs back both products");
    }
}
