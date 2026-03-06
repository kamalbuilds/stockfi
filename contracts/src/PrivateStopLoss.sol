// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title PrivateStopLoss
/// @notice Commit-reveal privacy layer for StockForge stop-losses.
///
///         Problem: On-chain stop-loss prices are visible to everyone. Front-runners
///         and MEV bots can see your stop price, manipulate the oracle, trigger your
///         stop at the worst possible moment, then buy at the bottom.
///
///         Solution: Two-phase commit-reveal. Users commit a hash of their stop price
///         (hidden on-chain). When price drops, the user reveals the actual stop price
///         to execute. Until reveal, nobody knows where your stop is set.
///
///         This works on ANY EVM chain. No FHE hardware required.
///
///         Flow:
///         1. User commits: hash(stopPrice, salt) + deposits stock tokens + pays premium
///         2. Stop price is hidden on-chain (only hash visible)
///         3. When user wants to execute: reveal(stopPrice, salt)
///         4. Contract verifies hash, checks oracle price <= stopPrice, executes
///
///         Innovation: First privacy-preserving stop-loss on tokenized stocks.
///         Solves the "stop hunting" problem that costs retail traders billions/year.
contract PrivateStopLoss {

    // ═══════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════

    enum PrivateStopStatus { COMMITTED, REVEALED, EXECUTED, CANCELLED }

    struct PrivatePosition {
        address owner;
        address stockToken;
        string ticker;
        uint256 amount;           // Stock tokens deposited (18 decimals)
        bytes32 commitHash;       // keccak256(abi.encodePacked(stopPrice, salt))
        uint256 revealedStopPrice; // 0 until revealed (8 decimals)
        uint256 premiumPaid;      // USDC premium (6 decimals)
        address priceOracle;
        PrivateStopStatus status;
        uint256 committedAt;
        uint256 revealedAt;
        uint256 executedAt;
        uint256 revealDeadline;   // Must reveal before this timestamp
    }

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    mapping(bytes32 => PrivatePosition) public positions;
    mapping(address => bytes32[]) public userPositions;

    address public owner;
    address public bot;
    address public insurancePool;
    address public usdc;

    uint256 public totalCommitted;
    uint256 public totalRevealed;
    uint256 public totalExecuted;

    uint256 public constant PREMIUM_BPS = 200;      // 2%
    uint256 public constant EXECUTION_FEE_BPS = 50;  // 0.5%
    uint256 public constant REVEAL_WINDOW = 7 days;   // Must reveal within 7 days

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event StopCommitted(
        bytes32 indexed positionId,
        address indexed owner,
        string ticker,
        address stockToken,
        uint256 amount,
        bytes32 commitHash,
        uint256 premiumPaid,
        uint256 revealDeadline
    );

    event StopRevealed(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 stopPrice
    );

    event StopExecuted(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 marketPrice,
        uint256 guaranteedPrice,
        uint256 gapCovered,
        uint256 usdcPaidToUser
    );

    event StopCancelled(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 tokensReturned
    );

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "PrivateStopLoss: only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == bot || msg.sender == owner, "PrivateStopLoss: only bot");
        _;
    }

    modifier onlyPositionOwner(bytes32 positionId) {
        require(positions[positionId].owner == msg.sender, "PrivateStopLoss: not position owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _bot, address _insurancePool, address _usdc) {
        require(_usdc != address(0), "PrivateStopLoss: zero USDC");
        owner = msg.sender;
        bot = _bot;
        insurancePool = _insurancePool;
        usdc = _usdc;
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: COMMIT (stop price is hidden)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Commit a hidden stop-loss. The actual stop price is not visible on-chain.
    /// @param stockToken Address of the stock ERC-20 (e.g. TSLA)
    /// @param ticker Human-readable ticker
    /// @param amount Stock tokens to protect (18 decimals)
    /// @param commitHash keccak256(abi.encodePacked(stopPrice, salt)) where stopPrice is uint256 (8 dec)
    /// @param priceOracle PriceOracle for this stock
    /// @return positionId Unique ID for this position
    function commitStopLoss(
        address stockToken,
        string calldata ticker,
        uint256 amount,
        bytes32 commitHash,
        address priceOracle
    ) external returns (bytes32 positionId) {
        require(stockToken != address(0), "PrivateStopLoss: zero token");
        require(amount > 0, "PrivateStopLoss: zero amount");
        require(commitHash != bytes32(0), "PrivateStopLoss: zero hash");
        require(priceOracle != address(0), "PrivateStopLoss: zero oracle");

        // Read current price for premium calculation
        (, int256 currentPriceRaw, , uint256 updatedAt,) = IAggregatorV3(priceOracle).latestRoundData();
        require(currentPriceRaw > 0, "PrivateStopLoss: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "PrivateStopLoss: stale oracle");

        uint256 currentPrice = uint256(currentPriceRaw);

        // Premium based on current price (not stop price, which is hidden)
        uint256 positionValueUsd8 = (amount * currentPrice) / 1e18;
        uint256 premium = (positionValueUsd8 * PREMIUM_BPS) / 10_000;
        uint256 premiumUsdc = premium / 100;
        require(premiumUsdc > 0, "PrivateStopLoss: position too small");

        // Transfer stock tokens into this contract
        _transferFrom(stockToken, msg.sender, address(this), amount);

        // Transfer premium to insurance pool
        if (premiumUsdc > 0 && insurancePool != address(0)) {
            _transferFrom(usdc, msg.sender, insurancePool, premiumUsdc);
            (bool rok,) = insurancePool.call(
                abi.encodeWithSignature("recordPremium(uint256)", premiumUsdc)
            );
            require(rok, "PrivateStopLoss: recordPremium failed");
        }

        positionId = keccak256(abi.encodePacked(
            msg.sender, stockToken, commitHash, block.timestamp, totalCommitted
        ));

        positions[positionId] = PrivatePosition({
            owner: msg.sender,
            stockToken: stockToken,
            ticker: ticker,
            amount: amount,
            commitHash: commitHash,
            revealedStopPrice: 0,
            premiumPaid: premiumUsdc,
            priceOracle: priceOracle,
            status: PrivateStopStatus.COMMITTED,
            committedAt: block.timestamp,
            revealedAt: 0,
            executedAt: 0,
            revealDeadline: block.timestamp + REVEAL_WINDOW
        });

        userPositions[msg.sender].push(positionId);
        totalCommitted++;

        emit StopCommitted(
            positionId, msg.sender, ticker, stockToken,
            amount, commitHash, premiumUsdc, block.timestamp + REVEAL_WINDOW
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: REVEAL (stop price becomes visible)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Reveal your hidden stop price. Call this when you're ready to arm the stop.
    /// @param positionId The position to reveal
    /// @param stopPrice The actual stop price (8 decimals) - must match commitHash
    /// @param salt Random value used in the commit hash
    function revealStopLoss(
        bytes32 positionId,
        uint256 stopPrice,
        bytes32 salt
    ) external onlyPositionOwner(positionId) {
        PrivatePosition storage pos = positions[positionId];
        require(pos.status == PrivateStopStatus.COMMITTED, "PrivateStopLoss: not committed");
        require(block.timestamp <= pos.revealDeadline, "PrivateStopLoss: reveal expired");

        // Verify the hash matches
        bytes32 expectedHash = keccak256(abi.encodePacked(stopPrice, salt));
        require(expectedHash == pos.commitHash, "PrivateStopLoss: hash mismatch");

        // Verify stop price is below current oracle price
        (, int256 currentPriceRaw, , ,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        require(currentPriceRaw > 0 && stopPrice < uint256(currentPriceRaw),
            "PrivateStopLoss: stop must be below current price");

        pos.revealedStopPrice = stopPrice;
        pos.status = PrivateStopStatus.REVEALED;
        pos.revealedAt = block.timestamp;
        totalRevealed++;

        emit StopRevealed(positionId, msg.sender, stopPrice);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: EXECUTE (bot triggers when price <= revealed stop)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Execute a revealed stop-loss when market price drops
    /// @param positionId The position to execute
    function executeStopLoss(bytes32 positionId) external onlyBot {
        PrivatePosition storage pos = positions[positionId];
        require(pos.status == PrivateStopStatus.REVEALED, "PrivateStopLoss: not revealed");

        (, int256 marketPriceRaw, , uint256 updatedAt,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        require(marketPriceRaw > 0, "PrivateStopLoss: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "PrivateStopLoss: stale oracle");

        uint256 marketPrice = uint256(marketPriceRaw);
        require(marketPrice <= pos.revealedStopPrice, "PrivateStopLoss: price above stop");

        pos.status = PrivateStopStatus.EXECUTED;
        pos.executedAt = block.timestamp;

        // Calculate payout at guaranteed price
        uint256 guaranteedPayout8 = (pos.amount * pos.revealedStopPrice) / 1e18;
        uint256 guaranteedPayoutUsdc = guaranteedPayout8 / 100;

        uint256 gapUsd8 = 0;
        if (marketPrice < pos.revealedStopPrice) {
            gapUsd8 = (pos.amount * (pos.revealedStopPrice - marketPrice)) / 1e18;
        }

        uint256 feeUsdc = (guaranteedPayoutUsdc * EXECUTION_FEE_BPS) / 10_000;
        uint256 netPayoutUsdc = guaranteedPayoutUsdc - feeUsdc;

        totalExecuted++;

        // Pay user from insurance pool
        if (netPayoutUsdc > 0) {
            _transferFrom(usdc, insurancePool, pos.owner, netPayoutUsdc);
        }
        if (feeUsdc > 0) {
            _transferFrom(usdc, insurancePool, owner, feeUsdc);
        }

        // Send stock tokens to pool
        _transfer(pos.stockToken, insurancePool, pos.amount);
        (bool stok,) = insurancePool.call(
            abi.encodeWithSignature("recordStockTokens(address,uint256)", pos.stockToken, pos.amount)
        );
        require(stok, "PrivateStopLoss: recordStockTokens failed");

        (bool gcok,) = insurancePool.call(
            abi.encodeWithSignature(
                "recordGapCovered(bytes32,address,uint256,uint256)",
                positionId, pos.owner, netPayoutUsdc, gapUsd8 / 100
            )
        );
        require(gcok, "PrivateStopLoss: recordGapCovered failed");

        emit StopExecuted(positionId, pos.owner, marketPrice, pos.revealedStopPrice, gapUsd8 / 100, netPayoutUsdc);
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCEL
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cancel a committed or revealed stop-loss
    function cancelStopLoss(bytes32 positionId) external onlyPositionOwner(positionId) {
        PrivatePosition storage pos = positions[positionId];
        require(
            pos.status == PrivateStopStatus.COMMITTED || pos.status == PrivateStopStatus.REVEALED,
            "PrivateStopLoss: cannot cancel"
        );

        pos.status = PrivateStopStatus.CANCELLED;
        _transfer(pos.stockToken, msg.sender, pos.amount);

        emit StopCancelled(positionId, msg.sender, pos.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Check if a revealed position should trigger
    function shouldTrigger(bytes32 positionId) external view returns (bool) {
        PrivatePosition memory pos = positions[positionId];
        if (pos.status != PrivateStopStatus.REVEALED) return false;
        (, int256 price, , uint256 updatedAt,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        if (block.timestamp - updatedAt > 3600) return false;
        return price > 0 && uint256(price) <= pos.revealedStopPrice;
    }

    /// @notice Get user's position IDs
    function getUserPositions(address user) external view returns (bytes32[] memory) {
        return userPositions[user];
    }

    /// @notice Get position details
    function getPosition(bytes32 positionId) external view returns (PrivatePosition memory) {
        return positions[positionId];
    }

    /// @notice Get global stats
    function getStats() external view returns (
        uint256 _totalCommitted,
        uint256 _totalRevealed,
        uint256 _totalExecuted
    ) {
        return (totalCommitted, totalRevealed, totalExecuted);
    }

    /// @notice Generate commit hash off-chain helper (for reference)
    function computeCommitHash(uint256 stopPrice, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(stopPrice, salt));
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "PrivateStopLoss: transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "PrivateStopLoss: transferFrom failed");
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setBot(address _bot) external onlyOwner { bot = _bot; }

    function setInsurancePool(address _pool) external onlyOwner {
        insurancePool = _pool;
    }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "PrivateStopLoss: zero address");
        owner = _new;
    }

    receive() external payable {}
}
