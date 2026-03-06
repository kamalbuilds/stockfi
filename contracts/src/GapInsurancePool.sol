// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GapInsurancePool
/// @notice Two-sided market backing StopLossVault guarantees.
///         Insurance providers (LPs) deposit USDC and earn premiums from stop-loss users.
///         When a price gap occurs (market price < stop price), this pool covers the difference
///         so users receive their guaranteed stop-loss price in full.
///
///         Mechanics:
///         - Premiums flow IN  when stop-losses are created (2% of position value)
///         - USDC flows OUT    when stop-losses execute (at guaranteed price to user)
///         - Stock tokens flow IN when stops execute (pool takes the downside)
///         - LPs earn yield from premiums proportional to their share
contract GapInsurancePool {

    // ═══════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════

    struct ProviderInfo {
        uint256 usdcDeposited;   // Total USDC deposited by this LP
        uint256 sharesHeld;      // Pool shares (scaled 1e18)
        uint256 premiumsClaimed; // Cumulative USDC premiums claimed
        uint256 depositedAt;
    }

    // ═══════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════

    address public owner;
    address public vault;  // StopLossVault — the only address that can pull USDC
    address public usdc;   // USDC on Robinhood Chain

    mapping(address => ProviderInfo) public providers;
    address[] public providerList;

    uint256 public totalShares;
    uint256 public totalUsdcDeposited;
    uint256 public totalPremiumsReceived;
    uint256 public totalGapsPaid;           // Total USDC paid out to cover gaps
    uint256 public totalStockTokensReceived; // Tracked separately per token

    // Per-token balances of stock tokens held by pool after stop executions
    mapping(address => uint256) public stockTokenBalances;
    address[] public stockTokenList;
    mapping(address => bool) public knownStockToken;

    // Pending premiums not yet distributed
    uint256 public pendingPremiums;

    // ═══════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════

    event Deposited(address indexed provider, uint256 usdcAmount, uint256 shares);
    event Withdrawn(address indexed provider, uint256 usdcAmount, uint256 shares);
    event PremiumReceived(uint256 amount, uint256 totalPremiums);
    event GapCovered(
        bytes32 indexed positionId,
        address indexed user,
        uint256 usdcPaid,
        uint256 gapAmount
    );
    event StockTokensReceived(address indexed token, uint256 amount);
    event PremiumsClaimed(address indexed provider, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "GapInsurancePool: only owner");
        _;
    }

    modifier onlyVault() {
        require(msg.sender == vault || msg.sender == owner, "GapInsurancePool: only vault");
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _usdc) {
        require(_usdc != address(0), "GapInsurancePool: zero USDC");
        owner = msg.sender;
        usdc = _usdc;
    }

    // ═══════════════════════════════════════════════════════════════
    // LP: DEPOSIT / WITHDRAW
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deposit USDC into the insurance pool. Earn premiums from stop-loss users.
    /// @param amount USDC amount (6 decimals)
    function deposit(uint256 amount) external {
        require(amount > 0, "GapInsurancePool: zero amount");
        _transferFrom(usdc, msg.sender, address(this), amount);

        // Calculate shares: first deposit gets 1:1, subsequent proportional to current pool value
        uint256 shares;
        uint256 currentBalance = _usdcBalance(); // Includes premiums received
        if (totalShares == 0 || currentBalance == 0) {
            shares = amount * 1e18 / 1e6; // Normalize to 18-dec shares
        } else {
            // Use actual balance (not totalUsdcDeposited) so premiums accrue to existing LPs
            shares = (amount * totalShares) / currentBalance;
        }

        if (providers[msg.sender].sharesHeld == 0) {
            providerList.push(msg.sender);
        }

        providers[msg.sender].usdcDeposited += amount;
        providers[msg.sender].sharesHeld += shares;
        providers[msg.sender].depositedAt = block.timestamp;

        totalShares += shares;
        totalUsdcDeposited += amount;

        // Approve vault to pull USDC from this pool when executing stop-losses
        _approve(usdc, vault, type(uint256).max);

        emit Deposited(msg.sender, amount, shares);
    }

    /// @notice Withdraw USDC proportional to shares held.
    /// @param shareAmount Number of shares to redeem
    function withdraw(uint256 shareAmount) external {
        ProviderInfo storage info = providers[msg.sender];
        require(info.sharesHeld >= shareAmount, "GapInsurancePool: insufficient shares");
        require(totalShares > 0, "GapInsurancePool: no shares");

        // USDC owed = shareAmount / totalShares * poolBalance
        uint256 currentBalance = _usdcBalance();
        uint256 usdcOwed = (shareAmount * currentBalance) / totalShares;
        require(usdcOwed > 0, "GapInsurancePool: zero withdrawal");
        require(currentBalance >= usdcOwed, "GapInsurancePool: insufficient pool balance");

        info.sharesHeld -= shareAmount;
        info.usdcDeposited = info.usdcDeposited > usdcOwed ? info.usdcDeposited - usdcOwed : 0;
        totalShares -= shareAmount;
        totalUsdcDeposited = totalUsdcDeposited > usdcOwed ? totalUsdcDeposited - usdcOwed : 0;

        _transfer(usdc, msg.sender, usdcOwed);

        emit Withdrawn(msg.sender, usdcOwed, shareAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VAULT INTERACTIONS (called automatically by StopLossVault)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Called when a stop-loss is created — premium flows from user into this pool.
    ///         The StopLossVault routes the premium here directly (via USDC transferFrom).
    ///         This function just tracks accounting.
    function recordPremium(uint256 amount) external onlyVault {
        totalPremiumsReceived += amount;
        pendingPremiums += amount;
        emit PremiumReceived(amount, totalPremiumsReceived);
    }

    /// @notice Called when stock tokens arrive from an executed stop-loss.
    ///         The vault transfers stock tokens to this address directly.
    function recordStockTokens(address token, uint256 amount) external onlyVault {
        if (!knownStockToken[token]) {
            knownStockToken[token] = true;
            stockTokenList.push(token);
        }
        stockTokenBalances[token] += amount;
        totalStockTokensReceived += amount;
        emit StockTokensReceived(token, amount);
    }

    /// @notice Called when a stop-loss executes and a gap is covered.
    ///         Records the gap payout and emits GapCovered for frontend tracking.
    function recordGapCovered(
        bytes32 positionId,
        address user,
        uint256 usdcPaid,
        uint256 gapAmount
    ) external onlyVault {
        totalGapsPaid += usdcPaid;
        if (pendingPremiums > 0) {
            pendingPremiums = pendingPremiums > usdcPaid ? pendingPremiums - usdcPaid : 0;
        }
        emit GapCovered(positionId, user, usdcPaid, gapAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW
    // ═══════════════════════════════════════════════════════════════

    /// @notice Current USDC balance of the pool
    function poolBalance() external view returns (uint256) {
        return _usdcBalance();
    }

    /// @notice USDC value of an LP's shares at current pool balance
    function providerValue(address provider) external view returns (uint256) {
        ProviderInfo memory info = providers[provider];
        if (info.sharesHeld == 0 || totalShares == 0) return 0;
        return (info.sharesHeld * _usdcBalance()) / totalShares;
    }

    /// @notice Pool utilization: proportion of USDC committed vs deposited
    function utilizationBps() public view returns (uint256) {
        if (totalUsdcDeposited == 0) return 0;
        uint256 balance = _usdcBalance();
        if (balance >= totalUsdcDeposited) return 0;
        return ((totalUsdcDeposited - balance) * 10_000) / totalUsdcDeposited;
    }

    /// @notice Check if pool has capacity for new stop-losses (utilization < 80%)
    function hasCapacity() external view returns (bool) {
        return utilizationBps() < 8000;
    }

    function getStats() external view returns (
        uint256 _totalUsdcDeposited,
        uint256 _poolBalance,
        uint256 _totalPremiums,
        uint256 _totalGapsPaid,
        uint256 _numProviders
    ) {
        return (
            totalUsdcDeposited,
            _usdcBalance(),
            totalPremiumsReceived,
            totalGapsPaid,
            providerList.length
        );
    }

    function getStockTokens() external view returns (address[] memory tokens, uint256[] memory balances) {
        tokens = stockTokenList;
        balances = new uint256[](stockTokenList.length);
        for (uint256 i = 0; i < stockTokenList.length; i++) {
            balances[i] = stockTokenBalances[stockTokenList[i]];
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    /// @notice Set vault address and re-approve max USDC spend
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "GapInsurancePool: zero vault");
        vault = _vault;
        _approve(usdc, _vault, type(uint256).max);
    }

    /// @notice Emergency: sweep accumulated stock tokens to owner (for selling)
    function sweepStockToken(address token, address to) external onlyOwner {
        uint256 bal = stockTokenBalances[token];
        require(bal > 0, "GapInsurancePool: no balance");
        stockTokenBalances[token] = 0;
        _transfer(token, to, bal);
    }

    function transferOwnership(address _new) external onlyOwner {
        require(_new != address(0), "GapInsurancePool: zero address");
        owner = _new;
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _usdcBalance() internal view returns (uint256) {
        (bool ok, bytes memory data) = usdc.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        require(ok, "GapInsurancePool: balanceOf failed");
        return abi.decode(data, (uint256));
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "GapInsurancePool: transfer failed");
    }

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "GapInsurancePool: transferFrom failed");
    }

    function _approve(address token, address spender, uint256 amount) internal {
        if (spender == address(0)) return;
        (bool ok,) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(ok, "GapInsurancePool: approve failed");
    }

    receive() external payable {}
}
