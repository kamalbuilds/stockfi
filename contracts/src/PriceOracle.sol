// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title PriceOracle
/// @notice Chainlink AggregatorV3-compatible price feed for Robinhood Chain stock tokens.
///         Updated by the StockForge price bot every 30 seconds.
contract PriceOracle is IAggregatorV3 {
    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    string public override description;
    uint8 public override decimals;

    address public owner;
    address public updater; // price bot or CRE workflow

    uint80 private _latestRoundId;
    int256 private _latestAnswer;
    uint256 private _latestUpdatedAt;

    uint256 public constant MAX_STALENESS = 3600; // 1 hour

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event PriceUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt);
    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyUpdater() {
        require(msg.sender == updater || msg.sender == owner, "PriceOracle: unauthorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "PriceOracle: not owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /// @param _description e.g. "TSLA / USD"
    /// @param _decimals 8 (Chainlink standard)
    /// @param _updater address of bot/CRE allowed to push prices
    constructor(string memory _description, uint8 _decimals, address _updater) {
        description = _description;
        decimals = _decimals;
        owner = msg.sender;
        updater = _updater;
    }

    // ═══════════════════════════════════════════════════════════════
    // PRICE UPDATE (called by bot/CRE every 30s)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Push a new price. Price must be > 0 and change by <50% from last price.
    function updatePrice(int256 _answer) external onlyUpdater {
        require(_answer > 0, "PriceOracle: price must be positive");

        // Sanity check: price cannot jump >50% in one update (prevents fat-finger errors)
        if (_latestAnswer > 0) {
            int256 diff = _answer > _latestAnswer
                ? _answer - _latestAnswer
                : _latestAnswer - _answer;
            require(diff * 100 / _latestAnswer < 50, "PriceOracle: price jump too large");
        }

        _latestRoundId++;
        _latestAnswer = _answer;
        _latestUpdatedAt = block.timestamp;

        emit PriceUpdated(_latestRoundId, _answer, block.timestamp);
    }

    /// @notice Force update (bypasses sanity check, owner only — for initial seed)
    function forceUpdatePrice(int256 _answer) external onlyOwner {
        require(_answer > 0, "PriceOracle: price must be positive");
        _latestRoundId++;
        _latestAnswer = _answer;
        _latestUpdatedAt = block.timestamp;
        emit PriceUpdated(_latestRoundId, _answer, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    // CHAINLINK AggregatorV3 INTERFACE
    // ═══════════════════════════════════════════════════════════════

    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        require(_latestAnswer > 0, "PriceOracle: no price set");
        return (
            _latestRoundId,
            _latestAnswer,
            _latestUpdatedAt,
            _latestUpdatedAt,
            _latestRoundId
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    function isStale() external view returns (bool) {
        return _latestUpdatedAt == 0 || block.timestamp - _latestUpdatedAt > MAX_STALENESS;
    }

    function latestPrice() external view returns (int256) {
        return _latestAnswer;
    }

    function lastUpdated() external view returns (uint256) {
        return _latestUpdatedAt;
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setUpdater(address _updater) external onlyOwner {
        emit UpdaterChanged(updater, _updater);
        updater = _updater;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "PriceOracle: zero address");
        owner = _newOwner;
    }
}
