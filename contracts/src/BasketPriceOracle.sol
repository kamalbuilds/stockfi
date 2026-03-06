// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title BasketPriceOracle
/// @notice AggregatorV3-compatible oracle that reads basket token prices from BasketFactory.
///
///         This enables composability between BasketFactory and StopLossVault:
///         users can create a stock basket (e.g., 40% TSLA + 30% AMZN + 20% PLTR + 10% AMD)
///         and then set a stop-loss on the ENTIRE basket using StopLossVault.
///
///         One premium, total portfolio protection. This doesn't exist anywhere.
///
///         Architecture:
///         [BasketToken ERC-20] --deposit--> [StopLossVault]
///              |                                  |
///              v                                  v
///         [BasketFactory.getBasketPrice()] <-- [BasketPriceOracle (this)]
///              |                                  ^
///              v                                  |
///         [PriceOracle x5] ---- weighted sum ----+
contract BasketPriceOracle is IAggregatorV3 {

    address public immutable factory;
    address public immutable basketToken;

    string public override description;
    uint8 public constant override decimals = 8;

    uint80 private _roundId;
    uint256 private _lastUpdated;

    constructor(address _factory, address _basketToken, string memory _description) {
        require(_factory != address(0), "BasketPriceOracle: zero factory");
        require(_basketToken != address(0), "BasketPriceOracle: zero basket");
        factory = _factory;
        basketToken = _basketToken;
        description = _description;
    }

    /// @notice Returns the weighted basket price from BasketFactory in AggregatorV3 format.
    ///         The price is computed in real-time from underlying stock oracles.
    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        // Call BasketFactory.getBasketPrice(basketToken)
        (bool ok, bytes memory data) = factory.staticcall(
            abi.encodeWithSignature("getBasketPrice(address)", basketToken)
        );
        require(ok && data.length >= 32, "BasketPriceOracle: getBasketPrice failed");
        answer = abi.decode(data, (int256));
        require(answer > 0, "BasketPriceOracle: invalid basket price");

        // Use current timestamp since price is computed in real-time from underlying oracles
        roundId = _roundId + 1;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = roundId;
    }
}
