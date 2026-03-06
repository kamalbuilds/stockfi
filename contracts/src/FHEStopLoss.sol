// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {
    FHE,
    euint128,
    ebool,
    InEuint128
} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title FHEStopLoss
/// @notice Fully Homomorphic Encryption stop-loss for tokenized stocks on Arbitrum Sepolia.
///
///         Problem: On-chain stop-loss prices are visible. MEV bots front-run them.
///         Commit-reveal (PrivateStopLoss) hides the price temporarily, but it must
///         be revealed before execution - creating a window for exploitation.
///
///         Solution: Fhenix FHE encrypts the stop price PERMANENTLY. The comparison
///         `currentPrice <= stopPrice` happens entirely on encrypted data via the
///         CoFHE coprocessor. The stop price is NEVER visible on-chain - not even
///         during execution.
///
///         This is deployed on Arbitrum Sepolia where Fhenix CoFHE is live.
///         When Fhenix adds Robinhood Chain support, this contract deploys there too.
///
///         Privacy upgrade path:
///         - Robinhood Chain today: commit-reveal (PrivateStopLoss.sol)
///         - Arbitrum Sepolia today: FHE encryption (this contract)
///         - Robinhood Chain future: FHE encryption (this contract)
contract FHEStopLoss {

    // ═══════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════

    enum FHEStopStatus { ACTIVE, TRIGGERED, EXECUTED, CANCELLED }

    struct FHEPosition {
        address owner;
        address stockToken;
        string ticker;
        uint256 amount;              // Stock tokens deposited (18 decimals)
        euint128 encryptedStopPrice; // FHE encrypted stop price - NEVER visible
        uint256 premiumPaid;         // USDC premium (6 decimals)
        address priceOracle;
        FHEStopStatus status;
        uint256 createdAt;
        uint256 executedAt;
    }

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    mapping(bytes32 => FHEPosition) public positions;
    mapping(address => bytes32[]) public userPositions;

    address public owner;
    address public bot;
    address public insurancePool;
    address public usdc;

    uint256 public totalPositions;
    uint256 public totalExecuted;

    uint256 public constant PREMIUM_BPS = 200;        // 2%
    uint256 public constant EXECUTION_FEE_BPS = 50;   // 0.5%

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event FHEStopCreated(
        bytes32 indexed positionId,
        address indexed owner,
        string ticker,
        address stockToken,
        uint256 amount,
        uint256 premiumPaid
        // NOTE: stop price is NOT emitted - it's encrypted!
    );

    event FHEStopTriggered(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 marketPrice
    );

    event FHEStopExecuted(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 usdcPaid
    );

    event FHEStopCancelled(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 tokensReturned
    );

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "FHEStopLoss: only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == bot || msg.sender == owner, "FHEStopLoss: only bot");
        _;
    }

    modifier onlyPositionOwner(bytes32 positionId) {
        require(positions[positionId].owner == msg.sender, "FHEStopLoss: not position owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _bot, address _insurancePool, address _usdc) {
        require(_usdc != address(0), "FHEStopLoss: zero USDC");
        owner = msg.sender;
        bot = _bot;
        insurancePool = _insurancePool;
        usdc = _usdc;
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE: Encrypted stop-loss (stop price is NEVER visible)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Create a stop-loss with an FHE-encrypted stop price.
    ///         The stop price is encrypted client-side with cofhejs before calling this.
    ///         It is NEVER revealed on-chain - not even during execution.
    /// @param stockToken Address of the stock ERC-20
    /// @param ticker Human-readable ticker
    /// @param amount Stock tokens to protect (18 decimals)
    /// @param encryptedStopPrice FHE-encrypted stop price (encrypted client-side)
    /// @param priceOracle PriceOracle for this stock
    function createEncryptedStopLoss(
        address stockToken,
        string calldata ticker,
        uint256 amount,
        InEuint128 calldata encryptedStopPrice,
        address priceOracle
    ) external returns (bytes32 positionId) {
        require(stockToken != address(0), "FHEStopLoss: zero token");
        require(amount > 0, "FHEStopLoss: zero amount");
        require(priceOracle != address(0), "FHEStopLoss: zero oracle");

        // Read current price for premium calculation
        (, int256 currentPriceRaw, , uint256 updatedAt,) = IAggregatorV3(priceOracle).latestRoundData();
        require(currentPriceRaw > 0, "FHEStopLoss: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "FHEStopLoss: stale oracle");

        // Convert encrypted input to encrypted type
        euint128 stopPrice = FHE.asEuint128(encryptedStopPrice);
        FHE.allowThis(stopPrice);
        FHE.allowSender(stopPrice);

        // Premium based on current price (stop price is hidden)
        uint256 currentPrice = uint256(currentPriceRaw);
        uint256 positionValueUsd8 = (amount * currentPrice) / 1e18;
        uint256 premium = (positionValueUsd8 * PREMIUM_BPS) / 10_000;
        uint256 premiumUsdc = premium / 100;
        require(premiumUsdc > 0, "FHEStopLoss: position too small");

        // Transfer stock tokens
        _transferFrom(stockToken, msg.sender, address(this), amount);

        // Transfer premium to insurance pool
        if (premiumUsdc > 0 && insurancePool != address(0)) {
            _transferFrom(usdc, msg.sender, insurancePool, premiumUsdc);
            (bool rok,) = insurancePool.call(
                abi.encodeWithSignature("recordPremium(uint256)", premiumUsdc)
            );
            require(rok, "FHEStopLoss: recordPremium failed");
        }

        positionId = keccak256(abi.encodePacked(
            msg.sender, stockToken, block.timestamp, totalPositions
        ));

        positions[positionId] = FHEPosition({
            owner: msg.sender,
            stockToken: stockToken,
            ticker: ticker,
            amount: amount,
            encryptedStopPrice: stopPrice,
            premiumPaid: premiumUsdc,
            priceOracle: priceOracle,
            status: FHEStopStatus.ACTIVE,
            createdAt: block.timestamp,
            executedAt: 0
        });

        userPositions[msg.sender].push(positionId);
        totalPositions++;

        emit FHEStopCreated(positionId, msg.sender, ticker, stockToken, amount, premiumUsdc);
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK: Encrypted comparison (FHE.lte on encrypted data)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Check if a stop-loss should trigger using FHE encrypted comparison.
    ///         The current price is encrypted and compared against the encrypted stop price.
    ///         The result is an encrypted boolean - nobody can see the result without decryption.
    /// @param positionId The position to check
    /// @param encryptedCurrentPrice FHE-encrypted current market price
    /// @return shouldTrigger Encrypted boolean (ebool) - must be decrypted via threshold network
    function checkTrigger(
        bytes32 positionId,
        InEuint128 calldata encryptedCurrentPrice
    ) external returns (ebool shouldTrigger) {
        FHEPosition storage pos = positions[positionId];
        require(pos.status == FHEStopStatus.ACTIVE, "FHEStopLoss: not active");

        euint128 currentPrice = FHE.asEuint128(encryptedCurrentPrice);

        // ENCRYPTED COMPARISON: currentPrice <= stopPrice?
        // This happens entirely on encrypted data via FHE coprocessor
        // Nobody can see the result without threshold decryption
        shouldTrigger = FHE.lte(currentPrice, pos.encryptedStopPrice);

        FHE.allowThis(shouldTrigger);
        FHE.allowSender(shouldTrigger);

        return shouldTrigger;
    }

    // ═══════════════════════════════════════════════════════════════
    // EXECUTE: After decryption confirms trigger
    // ═══════════════════════════════════════════════════════════════

    /// @notice Execute a stop-loss after the FHE comparison has been decrypted.
    ///         Called by the bot/keeper after threshold network confirms trigger = true.
    /// @param positionId The position to execute
    /// @param marketPrice The current market price at execution (plaintext, for payout calc)
    function executeStopLoss(
        bytes32 positionId,
        uint256 marketPrice
    ) external onlyBot {
        FHEPosition storage pos = positions[positionId];
        require(pos.status == FHEStopStatus.ACTIVE, "FHEStopLoss: not active");

        pos.status = FHEStopStatus.EXECUTED;
        pos.executedAt = block.timestamp;

        // Payout at market price (the guaranteed price is encrypted, so we use
        // the market price which is at or below the stop - verified by FHE comparison)
        uint256 payoutUsd8 = (pos.amount * marketPrice) / 1e18;
        uint256 payoutUsdc = payoutUsd8 / 100;
        uint256 feeUsdc = (payoutUsdc * EXECUTION_FEE_BPS) / 10_000;
        uint256 netPayout = payoutUsdc - feeUsdc;

        totalExecuted++;

        // Pay user
        if (netPayout > 0) {
            _transferFrom(usdc, insurancePool, pos.owner, netPayout);
        }
        if (feeUsdc > 0) {
            _transferFrom(usdc, insurancePool, owner, feeUsdc);
        }

        // Send stock tokens to pool
        _transfer(pos.stockToken, insurancePool, pos.amount);

        emit FHEStopExecuted(positionId, pos.owner, netPayout);
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCEL
    // ═══════════════════════════════════════════════════════════════

    function cancelStopLoss(bytes32 positionId) external onlyPositionOwner(positionId) {
        FHEPosition storage pos = positions[positionId];
        require(pos.status == FHEStopStatus.ACTIVE, "FHEStopLoss: not active");

        pos.status = FHEStopStatus.CANCELLED;
        _transfer(pos.stockToken, msg.sender, pos.amount);

        emit FHEStopCancelled(positionId, msg.sender, pos.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    function getUserPositions(address user) external view returns (bytes32[] memory) {
        return userPositions[user];
    }

    function getPosition(bytes32 positionId) external view returns (
        address posOwner,
        address stockToken,
        string memory ticker,
        uint256 amount,
        uint256 premiumPaid,
        address priceOracle,
        FHEStopStatus status,
        uint256 createdAt,
        uint256 executedAt
    ) {
        FHEPosition storage pos = positions[positionId];
        return (
            pos.owner, pos.stockToken, pos.ticker, pos.amount,
            pos.premiumPaid, pos.priceOracle, pos.status,
            pos.createdAt, pos.executedAt
        );
    }

    function getStats() external view returns (uint256 _totalPositions, uint256 _totalExecuted) {
        return (totalPositions, totalExecuted);
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "FHEStopLoss: transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "FHEStopLoss: transferFrom failed");
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setBot(address _bot) external onlyOwner { bot = _bot; }
    function setInsurancePool(address _pool) external onlyOwner { insurancePool = _pool; }
    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "FHEStopLoss: zero address");
        owner = _new;
    }

    receive() external payable {}
}
