// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PriceOracle.sol";
import "../src/StopLossVault.sol";
import "../src/GapInsurancePool.sol";

/// @notice Deploy all StockFi contracts to Robinhood Chain testnet (chain 46630)
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url https://rpc.testnet.chain.robinhood.com \
///     --broadcast \
///     --private-key $PRIVATE_KEY
///
///   To verify on Blockscout:
///   forge verify-contract <ADDR> src/StopLossVault.sol:StopLossVault \
///     --chain-id 46630 \
///     --verifier blockscout \
///     --verifier-url https://explorer.testnet.chain.robinhood.com/api/
contract Deploy is Script {

    // ─── Robinhood Chain Testnet (chain 46630) token addresses ───
    // NOTE: MockUSDC deployed at this address. Verify on explorer before re-deploying.
    // If the official RH Chain USDC becomes available, update this address.

    address constant USDC = 0xb3485Da6BB50843a20F321653869556Dc1E2F3c2; // MockUSDC (deployed)
    address constant WETH = 0x33e4191705c386532ba27cBF171Db86919200B94;
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant PLTR = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address constant NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
    address constant AMD  = 0x71178BAc73cBeb415514eB542a8995b82669778d;

    // ─── Seed prices (8 decimals — Chainlink standard) ───
    // These will be overwritten by the price bot within 30s of startup.
    int256 constant TSLA_SEED = 350_00000000; // $350.00
    int256 constant AMZN_SEED = 225_00000000; // $225.00
    int256 constant PLTR_SEED = 110_00000000; // $110.00
    int256 constant NFLX_SEED = 1050_00000000; // $1050.00
    int256 constant AMD_SEED  = 125_00000000;  // $125.00

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== StockFi Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain:", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. Deploy PriceOracles (one per stock)
        PriceOracle tslaPriceOracle = new PriceOracle("TSLA / USD", 8, deployer);
        PriceOracle amznPriceOracle = new PriceOracle("AMZN / USD", 8, deployer);
        PriceOracle pltrPriceOracle = new PriceOracle("PLTR / USD", 8, deployer);
        PriceOracle nflxPriceOracle = new PriceOracle("NFLX / USD", 8, deployer);
        PriceOracle amdPriceOracle  = new PriceOracle("AMD / USD", 8, deployer);

        // 2. Seed oracle prices (bot will override every 30s)
        tslaPriceOracle.forceUpdatePrice(TSLA_SEED);
        amznPriceOracle.forceUpdatePrice(AMZN_SEED);
        pltrPriceOracle.forceUpdatePrice(PLTR_SEED);
        nflxPriceOracle.forceUpdatePrice(NFLX_SEED);
        amdPriceOracle.forceUpdatePrice(AMD_SEED);

        // 3. Deploy GapInsurancePool
        GapInsurancePool insurancePool = new GapInsurancePool(USDC);

        // 4. Deploy StopLossVault
        StopLossVault vault = new StopLossVault(
            deployer,                    // bot = deployer initially, update to bot address
            address(insurancePool),
            USDC
        );

        // 5. Wire up: insurance pool recognizes vault (grants USDC approval)
        insurancePool.setVault(address(vault));

        vm.stopBroadcast();

        // ─── Output deployed addresses ───
        console.log("");
        console.log("=== Deployed Addresses ===");
        console.log("StopLossVault:     ", address(vault));
        console.log("GapInsurancePool:  ", address(insurancePool));
        console.log("TSLA PriceOracle:  ", address(tslaPriceOracle));
        console.log("AMZN PriceOracle:  ", address(amznPriceOracle));
        console.log("PLTR PriceOracle:  ", address(pltrPriceOracle));
        console.log("NFLX PriceOracle:  ", address(nflxPriceOracle));
        console.log("AMD  PriceOracle:  ", address(amdPriceOracle));
        console.log("");
        console.log("=== Stock Token Addresses (verify on explorer) ===");
        console.log("USDC:", USDC);
        console.log("TSLA:", TSLA);
        console.log("AMZN:", AMZN);
        console.log("PLTR:", PLTR);
        console.log("NFLX:", NFLX);
        console.log("AMD: ", AMD);
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Copy addresses to bot/.env and frontend/src/config/contracts.ts");
        console.log("2. Update bot address: vault.setBot(<BOT_ADDR>)");
        console.log("3. Deposit USDC into insurance pool to back stop-losses");
        console.log("4. Start price bot: cd bot && npm start");
        console.log("5. Verify contracts on: https://explorer.testnet.chain.robinhood.com");
    }
}
