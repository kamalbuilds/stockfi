// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title CoveredCallVault
/// @notice Permissionless covered call options for Robinhood Chain tokenized stocks.
///
///         Writers deposit stock tokens (TSLA, AMZN, etc.) and set a strike price,
///         expiry, and premium. Buyers pay the premium in USDC to purchase the option.
///         If the stock price exceeds the strike before expiry, the buyer can exercise
///         and receive the stock tokens at the strike price. If not exercised by expiry,
///         the writer reclaims their tokens (and keeps the premium).
///
///         This creates a yield source for stock token holders: earn premiums by
///         selling upside exposure. Combined with StopLossVault's downside protection,
///         StockForge provides complete risk management for tokenized equities.
///
///         Why this matters:
///         - Covered calls require a brokerage account + options approval in TradFi
///         - Here: permissionless, 24/7, instant settlement, any ERC-20 stock token
///         - First on-chain options market for tokenized real stocks
contract CoveredCallVault {

    // ═══════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════

    enum OptionStatus { OPEN, BOUGHT, EXERCISED, EXPIRED, CANCELLED }

    struct CallOption {
        address writer;        // Deposited stock tokens, earns premium
        address buyer;         // Paid premium, has right to exercise
        address stockToken;    // TSLA/AMZN/PLTR/NFLX/AMD ERC-20
        string ticker;         // "TSLA", "AMZN", etc.
        uint256 amount;        // Stock tokens locked (18 decimals)
        uint256 strikePrice;   // Strike price, USD (8 decimals)
        uint256 premium;       // USDC premium required (6 decimals)
        uint256 expiry;        // Unix timestamp when option expires
        address priceOracle;   // PriceOracle for this stock
        OptionStatus status;
        uint256 createdAt;
        uint256 exercisedAt;
    }

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    mapping(bytes32 => CallOption) public options;
    mapping(address => bytes32[]) public writerOptions;
    mapping(address => bytes32[]) public buyerOptions;

    address public owner;
    address public usdc;

    uint256 public totalOptionsWritten;
    uint256 public totalOptionsBought;
    uint256 public totalOptionsExercised;
    uint256 public totalOptionsExpired;
    uint256 public totalPremiumsEarned;   // USDC (6 dec)
    uint256 public totalExerciseVolume;   // USD (8 dec)

    /// @dev Protocol fee on premiums: 1%
    uint256 public constant PROTOCOL_FEE_BPS = 100;
    address public feeRecipient;

    /// @dev Minimum option duration: 1 hour
    uint256 public constant MIN_DURATION = 1 hours;

    /// @dev Maximum option duration: 30 days
    uint256 public constant MAX_DURATION = 30 days;

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event CallWritten(
        bytes32 indexed optionId,
        address indexed writer,
        string ticker,
        address stockToken,
        uint256 amount,
        uint256 strikePrice,
        uint256 premium,
        uint256 expiry
    );

    event CallBought(
        bytes32 indexed optionId,
        address indexed buyer,
        uint256 premiumPaid
    );

    event CallExercised(
        bytes32 indexed optionId,
        address indexed buyer,
        uint256 strikePrice,
        uint256 marketPrice,
        uint256 usdcPaid,
        uint256 stockTokensReceived
    );

    event CallExpired(
        bytes32 indexed optionId,
        address indexed writer,
        uint256 tokensReturned
    );

    event CallCancelled(
        bytes32 indexed optionId,
        address indexed writer,
        uint256 tokensReturned
    );

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "CoveredCallVault: only owner");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _usdc) {
        require(_usdc != address(0), "CoveredCallVault: zero USDC");
        owner = msg.sender;
        usdc = _usdc;
        feeRecipient = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════
    // WRITER: WRITE A COVERED CALL
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deposit stock tokens and create a covered call option for sale.
    /// @param stockToken Address of the stock ERC-20 (e.g., TSLA on RH Chain)
    /// @param ticker Human-readable ticker ("TSLA")
    /// @param amount Number of stock tokens to lock (18 decimals)
    /// @param strikePrice Price at which buyer can exercise, USD (8 decimals)
    /// @param premium USDC premium the buyer must pay (6 decimals)
    /// @param expiry Unix timestamp when the option expires
    /// @param priceOracle PriceOracle contract for this stock
    /// @return optionId Unique ID for this option
    function writeCall(
        address stockToken,
        string calldata ticker,
        uint256 amount,
        uint256 strikePrice,
        uint256 premium,
        uint256 expiry,
        address priceOracle
    ) external returns (bytes32 optionId) {
        require(stockToken != address(0), "CoveredCallVault: zero token");
        require(amount > 0, "CoveredCallVault: zero amount");
        require(strikePrice > 0, "CoveredCallVault: zero strike");
        require(premium > 0, "CoveredCallVault: zero premium");
        require(priceOracle != address(0), "CoveredCallVault: zero oracle");
        require(expiry > block.timestamp + MIN_DURATION, "CoveredCallVault: expiry too soon");
        require(expiry <= block.timestamp + MAX_DURATION, "CoveredCallVault: expiry too far");

        // Strike must be above current price (out-of-the-money call)
        (, int256 currentPriceRaw, , uint256 updatedAt,) = IAggregatorV3(priceOracle).latestRoundData();
        require(currentPriceRaw > 0, "CoveredCallVault: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "CoveredCallVault: stale oracle");
        require(strikePrice > uint256(currentPriceRaw), "CoveredCallVault: strike must be above current price");

        // Lock stock tokens in this vault
        _transferFrom(stockToken, msg.sender, address(this), amount);

        // Generate option ID
        optionId = keccak256(abi.encodePacked(
            msg.sender, stockToken, strikePrice, expiry, block.timestamp, totalOptionsWritten
        ));

        options[optionId] = CallOption({
            writer: msg.sender,
            buyer: address(0),
            stockToken: stockToken,
            ticker: ticker,
            amount: amount,
            strikePrice: strikePrice,
            premium: premium,
            expiry: expiry,
            priceOracle: priceOracle,
            status: OptionStatus.OPEN,
            createdAt: block.timestamp,
            exercisedAt: 0
        });

        writerOptions[msg.sender].push(optionId);
        totalOptionsWritten++;

        emit CallWritten(optionId, msg.sender, ticker, stockToken, amount, strikePrice, premium, expiry);
    }

    // ═══════════════════════════════════════════════════════════════
    // BUYER: BUY A CALL OPTION
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy an open call option by paying the premium in USDC.
    /// @param optionId ID of the option to buy
    function buyCall(bytes32 optionId) external {
        CallOption storage opt = options[optionId];
        require(opt.status == OptionStatus.OPEN, "CoveredCallVault: not open");
        require(block.timestamp < opt.expiry, "CoveredCallVault: expired");
        require(msg.sender != opt.writer, "CoveredCallVault: writer cannot buy own call");

        opt.status = OptionStatus.BOUGHT;
        opt.buyer = msg.sender;

        // Calculate protocol fee
        uint256 fee = (opt.premium * PROTOCOL_FEE_BPS) / 10_000;
        uint256 writerPayment = opt.premium - fee;

        // Transfer premium: buyer -> writer (minus fee)
        _transferFrom(usdc, msg.sender, opt.writer, writerPayment);

        // Transfer fee to protocol
        if (fee > 0) {
            _transferFrom(usdc, msg.sender, feeRecipient, fee);
        }

        buyerOptions[msg.sender].push(optionId);
        totalOptionsBought++;
        totalPremiumsEarned += opt.premium;

        emit CallBought(optionId, msg.sender, opt.premium);
    }

    // ═══════════════════════════════════════════════════════════════
    // BUYER: EXERCISE THE CALL
    // ═══════════════════════════════════════════════════════════════

    /// @notice Exercise a bought call option. Buyer pays strikePrice in USDC
    ///         and receives the locked stock tokens.
    /// @param optionId ID of the option to exercise
    function exerciseCall(bytes32 optionId) external {
        CallOption storage opt = options[optionId];
        require(opt.status == OptionStatus.BOUGHT, "CoveredCallVault: not bought");
        require(msg.sender == opt.buyer, "CoveredCallVault: not buyer");
        require(block.timestamp <= opt.expiry, "CoveredCallVault: expired");

        // Verify price is at or above strike (American-style: can exercise anytime before expiry)
        (, int256 currentPriceRaw, , uint256 updatedAt,) = IAggregatorV3(opt.priceOracle).latestRoundData();
        require(currentPriceRaw > 0, "CoveredCallVault: no oracle price");
        require(block.timestamp - updatedAt <= 3600, "CoveredCallVault: stale oracle");
        require(uint256(currentPriceRaw) >= opt.strikePrice, "CoveredCallVault: price below strike");

        opt.status = OptionStatus.EXERCISED;
        opt.exercisedAt = block.timestamp;

        // Calculate USDC payment: amount (18 dec) * strikePrice (8 dec) / 1e18 -> 8 dec, / 100 -> 6 dec
        uint256 exercisePayment8 = (opt.amount * opt.strikePrice) / 1e18;
        uint256 exercisePaymentUsdc = exercisePayment8 / 100;

        // Buyer pays strike price in USDC to writer
        _transferFrom(usdc, msg.sender, opt.writer, exercisePaymentUsdc);

        // Buyer receives stock tokens
        _transfer(opt.stockToken, msg.sender, opt.amount);

        totalOptionsExercised++;
        totalExerciseVolume += exercisePayment8;

        emit CallExercised(
            optionId,
            msg.sender,
            opt.strikePrice,
            uint256(currentPriceRaw),
            exercisePaymentUsdc,
            opt.amount
        );
    }

    // ═══════════════════════════════════════════════════════════════
    // WRITER: EXPIRE / RECLAIM
    // ═══════════════════════════════════════════════════════════════

    /// @notice Reclaim stock tokens after option expires unexercised.
    ///         Writer already earned the premium from the buyer.
    /// @param optionId ID of the expired option
    function expireCall(bytes32 optionId) external {
        CallOption storage opt = options[optionId];
        require(
            opt.status == OptionStatus.BOUGHT || opt.status == OptionStatus.OPEN,
            "CoveredCallVault: not active"
        );
        require(block.timestamp > opt.expiry, "CoveredCallVault: not expired yet");

        opt.status = OptionStatus.EXPIRED;

        // Return stock tokens to writer
        _transfer(opt.stockToken, opt.writer, opt.amount);

        totalOptionsExpired++;

        emit CallExpired(optionId, opt.writer, opt.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // WRITER: CANCEL (only if no buyer yet)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cancel an unsold call option and reclaim stock tokens.
    /// @param optionId ID of the option to cancel
    function cancelCall(bytes32 optionId) external {
        CallOption storage opt = options[optionId];
        require(opt.status == OptionStatus.OPEN, "CoveredCallVault: not open");
        require(msg.sender == opt.writer, "CoveredCallVault: not writer");

        opt.status = OptionStatus.CANCELLED;

        // Return stock tokens to writer
        _transfer(opt.stockToken, msg.sender, opt.amount);

        emit CallCancelled(optionId, msg.sender, opt.amount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Get option details
    function getOption(bytes32 optionId) external view returns (CallOption memory) {
        return options[optionId];
    }

    /// @notice Get all option IDs written by an address
    function getWriterOptions(address writer) external view returns (bytes32[] memory) {
        return writerOptions[writer];
    }

    /// @notice Get all option IDs bought by an address
    function getBuyerOptions(address buyer) external view returns (bytes32[] memory) {
        return buyerOptions[buyer];
    }

    /// @notice Check if an option is in-the-money (market price >= strike)
    function isInTheMoney(bytes32 optionId) external view returns (bool) {
        CallOption memory opt = options[optionId];
        if (opt.status != OptionStatus.BOUGHT) return false;
        if (block.timestamp > opt.expiry) return false;
        (, int256 price, , uint256 updatedAt,) = IAggregatorV3(opt.priceOracle).latestRoundData();
        if (block.timestamp - updatedAt > 3600) return false;
        return price > 0 && uint256(price) >= opt.strikePrice;
    }

    /// @notice Time remaining until expiry (0 if expired)
    function timeToExpiry(bytes32 optionId) external view returns (uint256) {
        CallOption memory opt = options[optionId];
        if (block.timestamp >= opt.expiry) return 0;
        return opt.expiry - block.timestamp;
    }

    /// @notice Get global stats
    function getStats() external view returns (
        uint256 _totalWritten,
        uint256 _totalBought,
        uint256 _totalExercised,
        uint256 _totalExpired,
        uint256 _totalPremiums,
        uint256 _totalVolume
    ) {
        return (
            totalOptionsWritten,
            totalOptionsBought,
            totalOptionsExercised,
            totalOptionsExpired,
            totalPremiumsEarned,
            totalExerciseVolume
        );
    }

    /// @notice Intrinsic value of the option in USD (8 decimals)
    ///         For calls: max(0, currentPrice - strikePrice) * amount
    function intrinsicValue(bytes32 optionId) external view returns (uint256) {
        CallOption memory opt = options[optionId];
        if (opt.priceOracle == address(0)) return 0;
        (, int256 price, , ,) = IAggregatorV3(opt.priceOracle).latestRoundData();
        if (price <= 0 || uint256(price) <= opt.strikePrice) return 0;
        return ((uint256(price) - opt.strikePrice) * opt.amount) / 1e18;
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL TOKEN HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "CoveredCallVault: transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "CoveredCallVault: transferFrom failed");
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setFeeRecipient(address _r) external onlyOwner { feeRecipient = _r; }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "CoveredCallVault: zero address");
        owner = _new;
    }

    receive() external payable {}
}
