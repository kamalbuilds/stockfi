// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BasketFactory.sol";

contract DeployBasket is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        BasketFactory factory = new BasketFactory();
        console.log("BasketFactory:", address(factory));

        vm.stopBroadcast();
    }
}
