// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BasketFactory.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract DemoBasket is Script {
    address constant FACTORY  = 0x4A6Fe41eb6fCEf9314dd3E3DFf8D66D100917D02;
    address constant TSLA     = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN     = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant PLTR     = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address constant AMD      = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address constant DEPLOYER = 0x83F9d93ddfbaB266bf7c69110dC2F15e8fF3Ad4a;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // --- Basket 1: AMZN+PLTR+AMD diversified tech (will mint) ---
        address[] memory tokens3  = new address[](3);
        uint256[] memory weights3 = new uint256[](3);
        tokens3[0] = AMZN; weights3[0] = 5000; // 50% AMZN
        tokens3[1] = PLTR; weights3[1] = 3000; // 30% PLTR
        tokens3[2] = AMD;  weights3[2] = 2000; // 20% AMD

        (uint256 id2, address basket2) = BasketFactory(FACTORY).createBasket(
            "Diversified Tech", "DTECH", tokens3, weights3
        );
        console.log("DTECH BasketToken:", basket2);
        console.log("Basket ID:", id2);

        // Approve + Mint 1 DTECH basket token
        IERC20(AMZN).approve(FACTORY, type(uint256).max);
        IERC20(PLTR).approve(FACTORY, type(uint256).max);
        IERC20(AMD).approve(FACTORY, type(uint256).max);
        BasketFactory(FACTORY).mint(basket2, 1e18);
        console.log("Minted 1 DTECH basket token successfully");

        vm.stopBroadcast();
    }
}
