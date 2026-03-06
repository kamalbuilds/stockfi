// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/StopLossVault.sol";
import "../src/GapInsurancePool.sol";

/// @notice Redeploy vault + pool with our own mintable USDC.
///         Reuses existing PriceOracle deployments.
contract Redeploy is Script {

    // Existing oracle addresses (already deployed and working)
    address constant TSLA_ORACLE = 0x3f7FC08150709C22F1741A230351B59c36bCCc8a;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== StockForge Redeploy (MockUSDC) ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy MockUSDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:", address(usdc));

        // 2. Deploy GapInsurancePool with MockUSDC
        GapInsurancePool pool = new GapInsurancePool(address(usdc));
        console.log("GapInsurancePool:", address(pool));

        // 3. Deploy StopLossVault with MockUSDC
        StopLossVault vault = new StopLossVault(deployer, address(pool), address(usdc));
        console.log("StopLossVault:", address(vault));

        // 4. Wire pool -> vault
        pool.setVault(address(vault));

        // 5. Mint USDC: 100,000 to deployer, 500,000 to pool (for insurance backing)
        usdc.mint(deployer, 100_000 * 1e6);    // 100K USDC for creating stop-losses
        usdc.mint(address(pool), 500_000 * 1e6); // 500K USDC pool liquidity

        // 6. Also deposit into pool as LP to track shares properly
        usdc.mint(deployer, 500_000 * 1e6);     // Extra 500K for LP deposit
        usdc.approve(address(pool), 500_000 * 1e6);
        pool.deposit(500_000 * 1e6);

        vm.stopBroadcast();

        console.log("");
        console.log("=== New Addresses ===");
        console.log("MockUSDC:         ", address(usdc));
        console.log("GapInsurancePool: ", address(pool));
        console.log("StopLossVault:    ", address(vault));
        console.log("");
        console.log("Deployer USDC balance: 100,000");
        console.log("Pool USDC backing:     500,000 (direct) + 500,000 (LP deposit)");
    }
}
