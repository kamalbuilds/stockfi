// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title StopLossVault
/// @notice Gap-proof stop-loss for Robinhood Chain tokenized stock tokens.
///         Users deposit stock tokens (TSLA, AMZN, etc.) and set a guaranteed stop-loss price.
///         When market price drops to the trigger, vault executes at the EXACT guaranteed price
///         using USDC pre-funded by the GapInsurancePool — even if the market gapped through.
///
///         This is impossible in TradFi because markets close and prices gap at open.
///         On Robinhood Chain, DeFi markets never close. The gap that destroys retail traders
///         structurally cannot happen here.
contract StopLossVault {

    // ═══════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════

    enum StopLossStatus { ACTIVE, EXECUTED, CANCELLED }

    struct StopLossPosition {
        address owner;
        address stockToken;     // TSLA/AMZN/PLTR/NFLX/AMD ERC-20 on Robinhood Chain
        string ticker;          // "TSLA", "AMZN", etc.
        uint256 amount;         // Stock tokens deposited (18 decimals)
        uint256 stopPrice;      // Guaranteed execution price, USD (8 decimals — Chainlink standard)
        uint256 premiumPaid;    // USDC premium paid to insurance pool
        address priceOracle;    // PriceOracle for this stock
        StopLossStatus status;
        uint256 createdAt;
        uint256 executedAt;
        uint256 marketPriceAtExecution; // Actual price when stop triggered (may be below stopPrice)
    }

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    mapping(bytes32 => StopLossPosition) public positions;
    mapping(address => bytes32[]) public userPositions;

    address public owner;
    address public bot;              // Price bot / CRE that calls executeStopLoss
    address public insurancePool;    // GapInsurancePool — source of USDC payout
    address public usdc;             // USDC on Robinhood Chain
    address public feeRecipient;

    uint256 public totalPositions;
    uint256 public totalExecuted;
    uint256 public totalProtectedUsd; // Cumulative USD value protected (8 dec)

    /// @dev 2% premium on position value paid to insurance pool at creation
    uint256 public constant PREMIUM_BPS = 200;

    /// @dev 0.5% execution fee taken from payout — same as Guardian rescue fee
    uint256 public constant EXECUTION_FEE_BPS = 50;

    /// @dev Cooldown prevents duplicate execution attempts during bot retry loops
    uint256 public constant EXECUTION_COOLDOWN = 120; // 2 minutes
    mapping(bytes32 => uint256) public lastExecutionAttempt;

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event StopLossCreated(
        bytes32 indexed positionId,
        address indexed owner,
        string ticker,
        address stockToken,
        uint256 amount,
        uint256 stopPrice,
        uint256 premiumPaid
    );

    event StopLossExecuted(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 marketPrice,      // Actual market price (may be < stopPrice — the gap)
        uint256 guaranteedPrice,  // Stop-loss price (guaranteed payout)
        uint256 gapCovered,       // Amount the insurance pool covered (guaranteedPrice - marketPrice)
        uint256 usdcPaidToUser,   // Net USDC after fee
        uint256 stockTokensToPool // Stock tokens transferred to insurance pool
    );

    event StopLossCancelled(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 tokensReturned
    );

    event InsurancePoolUpdated(address indexed oldPool, address indexed newPool);

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "StopLossVault: only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == bot || msg.sender == owner, "StopLossVault: only bot");
        _;
    }

    modifier onlyPositionOwner(bytes32 positionId) {
        require(positions[positionId].owner == msg.sender, "StopLossVault: not position owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _bot, address _insurancePool, address _usdc) {
        require(_usdc != address(0), "StopLossVault: zero USDC");
        owner = msg.sender;
        bot = _bot;
        insurancePool = _insurancePool;
        usdc = _usdc;
        feeRecipient = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════
    // USER: CREATE STOP-LOSS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deposit stock tokens and register a guaranteed stop-loss price.
    /// @param stockToken Address of the stock ERC-20 (e.g. TSLA on RH Chain)
    /// @param ticker Human-readable ticker ("TSLA")
    /// @param amount Number of stock tokens to protect (18 decimals)
    /// @param stopPrice Guaranteed execution price in USD (8 decimals, e.g. 27000000000 = $270.00)
    /// @param priceOracle PriceOracle contract for this stock
    /// @return positionId Unique ID for this stop-loss position
    function createStopLoss(
        address stockToken,
        string calldata ticker,
        uint256 amount,
        uint256 stopPrice,
        address priceOracle
    ) external returns (bytes32 positionId) {
        require(stockToken != address(0), "StopLossVault: zero token");
        require(amount > 0, "StopLossVault: zero amount");
        require(stopPrice > 0, "StopLossVault: zero stop price");
        require(priceOracle != address(0), "StopLossVault: zero oracle");

        // Read current price — stop must be below current price
        (, int256 currentPriceRaw, , uint256 updatedAt,) = IAggregatorV3(priceOracle).latestRoundData();
        require(currentPriceRaw > 0, "StopLossVault: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "StopLossVault: stale oracle");

        uint256 currentPrice = uint256(currentPriceRaw);
        require(stopPrice < currentPrice, "StopLossVault: stop must be below current price");

        // Calculate USDC premium: 2% of position value
        // positionValue = amount (18 dec) * currentPrice (8 dec) / 1e18 -> gives 8 dec result
        uint256 positionValueUsd8 = (amount * currentPrice) / 1e18;
        uint256 premium = (positionValueUsd8 * PREMIUM_BPS) / 10_000;
        // Convert from 8-dec to 6-dec USDC
        uint256 premiumUsdc = premium / 100; // 8 dec -> 6 dec

        // Transfer stock tokens into this vault
        _transferFrom(stockToken, msg.sender, address(this), amount);

        // Transfer USDC premium to insurance pool and record it
        if (premiumUsdc > 0 && insurancePool != address(0)) {
            _transferFrom(usdc, msg.sender, insurancePool, premiumUsdc);
            // Track premium in pool accounting
            (bool rok,) = insurancePool.call(
                abi.encodeWithSignature("recordPremium(uint256)", premiumUsdc)
            );
            require(rok, "StopLossVault: recordPremium failed");
        }

        // Generate position ID (keccak256 of user + token + stopPrice + timestamp)
        positionId = keccak256(abi.encodePacked(
            msg.sender, stockToken, stopPrice, block.timestamp, totalPositions
        ));

        positions[positionId] = StopLossPosition({
            owner: msg.sender,
            stockToken: stockToken,
            ticker: ticker,
            amount: amount,
            stopPrice: stopPrice,
            premiumPaid: premiumUsdc,
            priceOracle: priceOracle,
            status: StopLossStatus.ACTIVE,
            createdAt: block.timestamp,
            executedAt: 0,
            marketPriceAtExecution: 0
        });

        userPositions[msg.sender].push(positionId);
        totalPositions++;

        emit StopLossCreated(positionId, msg.sender, ticker, stockToken, amount, stopPrice, premiumUsdc);
    }

    // ═══════════════════════════════════════════════════════════════
    // BOT: EXECUTE STOP-LOSS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Execute a stop-loss when market price has dropped to or below stopPrice.
    ///         Called by the price bot (or CRE) when oracle price <= stopPrice.
    ///         Pays user USDC at the guaranteed stopPrice regardless of where market is.
    ///         Insurance pool covers the gap between stopPrice and actual market price.
    /// @param positionId ID of the position to execute
    function executeStopLoss(bytes32 positionId) external onlyBot {
        StopLossPosition storage pos = positions[positionId];
        require(pos.status == StopLossStatus.ACTIVE, "StopLossVault: not active");
        require(
            lastExecutionAttempt[positionId] == 0 ||
            block.timestamp - lastExecutionAttempt[positionId] > EXECUTION_COOLDOWN,
            "StopLossVault: cooldown active"
        );

        lastExecutionAttempt[positionId] = block.timestamp;

        // Read current oracle price
        (, int256 marketPriceRaw, , uint256 updatedAt,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        require(marketPriceRaw > 0, "StopLossVault: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "StopLossVault: stale oracle");

        uint256 marketPrice = uint256(marketPriceRaw);
        require(marketPrice <= pos.stopPrice, "StopLossVault: price above stop");

        // Mark executed
        pos.status = StopLossStatus.EXECUTED;
        pos.executedAt = block.timestamp;
        pos.marketPriceAtExecution = marketPrice;

        // Calculate guaranteed payout in USDC (6 decimals)
        // guaranteedPayout = amount (18 dec) * stopPrice (8 dec) / 1e18 -> 8 dec, /100 -> 6 dec USDC
        uint256 guaranteedPayout8 = (pos.amount * pos.stopPrice) / 1e18;
        uint256 guaranteedPayoutUsdc = guaranteedPayout8 / 100;

        // Calculate gap: how much the insurance pool needs to cover beyond market price
        uint256 gapUsd8 = 0;
        if (marketPrice < pos.stopPrice) {
            gapUsd8 = (pos.amount * (pos.stopPrice - marketPrice)) / 1e18;
        }

        // Deduct 0.5% execution fee
        uint256 feeUsdc = (guaranteedPayoutUsdc * EXECUTION_FEE_BPS) / 10_000;
        uint256 netPayoutUsdc = guaranteedPayoutUsdc - feeUsdc;

        totalExecuted++;
        totalProtectedUsd += guaranteedPayout8;

        // Send USDC from insurance pool to user (pool pre-approved this contract)
        if (netPayoutUsdc > 0) {
            _transferFrom(usdc, insurancePool, pos.owner, netPayoutUsdc);
        }

        // Send fee to feeRecipient
        if (feeUsdc > 0) {
            _transferFrom(usdc, insurancePool, feeRecipient, feeUsdc);
        }

        // Send stock tokens from vault to insurance pool and record it
        _transfer(pos.stockToken, insurancePool, pos.amount);
        (bool stok,) = insurancePool.call(
            abi.encodeWithSignature("recordStockTokens(address,uint256)", pos.stockToken, pos.amount)
        );
        require(stok, "StopLossVault: recordStockTokens failed");

        // Record gap covered — updates totalGapsPaid and emits GapCovered event
        (bool gcok,) = insurancePool.call(
            abi.encodeWithSignature(
                "recordGapCovered(bytes32,address,uint256,uint256)",
                positionId, pos.owner, netPayoutUsdc, gapUsd8 / 100
            )
        );
        require(gcok, "StopLossVault: recordGapCovered failed");

        emit StopLossExecuted(
            positionId,
            pos.owner,
            marketPrice,
            pos.stopPrice,
            gapUsd8 / 100, // gap in USDC 6 dec
            netPayoutUsdc,
            pos.amount
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // USER: CANCEL
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cancel stop-loss and withdraw stock tokens (only if not yet executed)
    function cancelStopLoss(bytes32 positionId) external onlyPositionOwner(positionId) {
        StopLossPosition storage pos = positions[positionId];
        require(pos.status == StopLossStatus.ACTIVE, "StopLossVault: not active");

        pos.status = StopLossStatus.CANCELLED;
        _transfer(pos.stockToken, msg.sender, pos.amount);

        emit StopLossCancelled(positionId, msg.sender, pos.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS (for the price bot)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Check if a position should be triggered right now
    function shouldTrigger(bytes32 positionId) external view returns (bool) {
        StopLossPosition memory pos = positions[positionId];
        if (pos.status != StopLossStatus.ACTIVE) return false;
        if (pos.priceOracle == address(0)) return false;
        (, int256 price, , uint256 updatedAt,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        if (block.timestamp - updatedAt > 3600) return false; // stale
        return price > 0 && uint256(price) <= pos.stopPrice;
    }

    /// @notice Get all position IDs for a user
    function getUserPositions(address user) external view returns (bytes32[] memory) {
        return userPositions[user];
    }

    /// @notice Get position details
    function getPosition(bytes32 positionId) external view returns (StopLossPosition memory) {
        return positions[positionId];
    }

    /// @notice Get global stats
    function getStats() external view returns (
        uint256 _totalPositions,
        uint256 _totalExecuted,
        uint256 _totalProtectedUsd
    ) {
        return (totalPositions, totalExecuted, totalProtectedUsd);
    }

    /// @notice Get distance to stop as percentage (100 = at stop, 120 = 20% above stop)
    function getDistanceToStop(bytes32 positionId) external view returns (uint256 pct) {
        StopLossPosition memory pos = positions[positionId];
        if (pos.status != StopLossStatus.ACTIVE) return 0;
        (, int256 price, , ,) = IAggregatorV3(pos.priceOracle).latestRoundData();
        if (price <= 0) return 0;
        // e.g. current $300, stop $270 -> 300/270 * 100 = 111 (11% above stop)
        pct = (uint256(price) * 100) / pos.stopPrice;
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL TOKEN HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "StopLossVault: transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "StopLossVault: transferFrom failed");
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setBot(address _bot) external onlyOwner { bot = _bot; }
    function setFeeRecipient(address _r) external onlyOwner { feeRecipient = _r; }

    function setInsurancePool(address _pool) external onlyOwner {
        emit InsurancePoolUpdated(insurancePool, _pool);
        insurancePool = _pool;
    }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "StopLossVault: zero address");
        owner = _new;
    }

    receive() external payable {}
}
