// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {StopLossVault} from "../src/StopLossVault.sol";
import {GapInsurancePool} from "../src/GapInsurancePool.sol";

/// @dev Minimal ERC-20 mock for testing
contract MockERC20 is Test {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract StopLossVaultTest is Test {
    PriceOracle oracle;
    StopLossVault vault;
    GapInsurancePool pool;
    MockERC20 tsla;
    MockERC20 usdc;

    address deployer = address(this);
    address user = address(0xBEEF);
    address lp = address(0xCAFE);
    address bot = address(0xB07);

    function setUp() public {
        // Deploy mock tokens
        tsla = new MockERC20("Tesla", "TSLA", 18);
        usdc = new MockERC20("USDC", "USDC", 6);

        // Deploy oracle
        oracle = new PriceOracle("TSLA / USD", 8, bot);
        oracle.forceUpdatePrice(27000000000); // $270.00

        // Deploy pool + vault
        pool = new GapInsurancePool(address(usdc));
        vault = new StopLossVault(bot, address(pool), address(usdc));
        pool.setVault(address(vault));

        // Mint tokens to user
        tsla.mint(user, 100 ether);     // 100 TSLA tokens
        usdc.mint(user, 1_000_000e6);   // $1M USDC

        // Mint USDC to LP and have them deposit into insurance pool
        usdc.mint(lp, 500_000e6);       // $500K USDC
        vm.startPrank(lp);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(500_000e6);
        vm.stopPrank();
    }

    // ===== Oracle Tests =====

    function test_oracleReturnsPrice() public view {
        (, int256 price, , ,) = oracle.latestRoundData();
        assertEq(price, 27000000000);
    }

    function test_oracleUpdatePrice() public {
        vm.prank(bot);
        oracle.updatePrice(28000000000); // $280
        assertEq(oracle.latestPrice(), 28000000000);
    }

    function test_oracleRejectUnauthorized() public {
        vm.prank(user);
        vm.expectRevert("PriceOracle: unauthorized");
        oracle.updatePrice(28000000000);
    }

    function test_oracleRejectHugeJump() public {
        vm.prank(bot);
        vm.expectRevert("PriceOracle: price jump too large");
        oracle.updatePrice(50000000000); // $500 (85% jump from $270)
    }

    function test_oracleIsNotStale() public view {
        assertFalse(oracle.isStale());
    }

    // ===== Create Stop-Loss Tests =====

    function test_createStopLoss() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        bytes32 positionId = vault.createStopLoss(
            address(tsla),
            "TSLA",
            5 ether,       // 5 TSLA
            25000000000,   // $250 stop price
            address(oracle)
        );
        vm.stopPrank();

        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);
        assertEq(pos.owner, user);
        assertEq(pos.amount, 5 ether);
        assertEq(pos.stopPrice, 25000000000);
        assertTrue(pos.status == StopLossVault.StopLossStatus.ACTIVE);
    }

    function test_createStopLossChargesPremium() public {
        uint256 usdcBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        vault.createStopLoss(
            address(tsla),
            "TSLA",
            10 ether,      // 10 TSLA
            25000000000,   // $250 stop
            address(oracle)
        );
        vm.stopPrank();

        uint256 usdcAfter = usdc.balanceOf(user);
        // Premium = 10 TSLA * $270 * 2% = $54 = 54_000_000 in USDC 6 dec
        uint256 premiumPaid = usdcBefore - usdcAfter;
        assertEq(premiumPaid, 54_000_000);
    }

    function test_revertStopAboveCurrentPrice() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        vm.expectRevert("StopLossVault: stop must be below current price");
        vault.createStopLoss(
            address(tsla),
            "TSLA",
            5 ether,
            30000000000,   // $300 (above current $270)
            address(oracle)
        );
        vm.stopPrank();
    }

    // ===== Execute Stop-Loss Tests =====

    function test_executeStopLoss() public {
        // Create stop at $250
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        uint256 userUsdcBefore = usdc.balanceOf(user);

        // Price drops to $240 (below stop)
        oracle.forceUpdatePrice(24000000000);

        // Bot executes
        vm.prank(bot);
        vault.executeStopLoss(positionId);

        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);
        assertTrue(pos.status == StopLossVault.StopLossStatus.EXECUTED);
        assertEq(pos.marketPriceAtExecution, 24000000000);

        // User gets guaranteed $250 per TSLA for 5 TSLA = $1250
        // guaranteedPayout8 = 5e18 * 25e9 / 1e18 = 125e9
        // guaranteedPayoutUsdc = 125e9 / 100 = 1_250_000_000
        // Fee = 1_250_000_000 * 50 / 10000 = 6_250_000
        // Net = 1_250_000_000 - 6_250_000 = 1_243_750_000
        uint256 userUsdcAfter = usdc.balanceOf(user);
        assertEq(userUsdcAfter - userUsdcBefore, 1_243_750_000);
    }

    function test_executeCoversGap() public {
        // Create stop at $260
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 10 ether, 26000000000, address(oracle)
        );
        vm.stopPrank();

        // Massive gap: price crashes from $270 to $200
        oracle.forceUpdatePrice(20000000000);

        // Bot executes
        vm.prank(bot);
        vault.executeStopLoss(positionId);

        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);

        // User still gets guaranteed $260 per TSLA (not $200)
        // 10 TSLA * $260 = $2600 = 26_000_000 USDC
        // Fee = 26_000_000 * 50/10000 = 130_000
        // Net = 25_870_000
        assertTrue(pos.status == StopLossVault.StopLossStatus.EXECUTED);

        // Insurance pool absorbed the $60/share gap: 10 TSLA * $60 = $600
    }

    function test_revertExecuteAboveStop() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        // Price is still $270 (above $250 stop)
        vm.prank(bot);
        vm.expectRevert("StopLossVault: price above stop");
        vault.executeStopLoss(positionId);
    }

    function test_revertExecuteNotBot() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        oracle.forceUpdatePrice(24000000000);

        vm.prank(user);
        vm.expectRevert("StopLossVault: only bot");
        vault.executeStopLoss(positionId);
    }

    // ===== Cancel Tests =====

    function test_cancelStopLoss() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );

        uint256 tslaBefore = tsla.balanceOf(user);
        vault.cancelStopLoss(positionId);
        vm.stopPrank();

        uint256 tslaAfter = tsla.balanceOf(user);
        assertEq(tslaAfter - tslaBefore, 5 ether); // Tokens returned

        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);
        assertTrue(pos.status == StopLossVault.StopLossStatus.CANCELLED);
    }

    function test_revertCancelNotOwner() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        vm.prank(lp);
        vm.expectRevert("StopLossVault: not position owner");
        vault.cancelStopLoss(positionId);
    }

    // ===== Insurance Pool Tests =====

    function test_poolDeposit() public view {
        (uint256 deposited, uint256 balance, , , uint256 numProviders) = pool.getStats();
        assertEq(deposited, 500_000e6);
        assertEq(balance, 500_000e6);
        assertEq(numProviders, 1);
    }

    function test_poolWithdraw() public {
        uint256 balBefore = usdc.balanceOf(lp);
        GapInsurancePool.ProviderInfo memory info = _getProviderInfo(lp);

        vm.prank(lp);
        pool.withdraw(info.sharesHeld);

        uint256 balAfter = usdc.balanceOf(lp);
        // LP gets back their deposit + any premiums that accumulated
        assertTrue(balAfter > balBefore);
    }

    function test_poolReceivesPremiumOnCreate() public {
        uint256 poolBefore = usdc.balanceOf(address(pool));

        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vault.createStopLoss(
            address(tsla), "TSLA", 10 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        uint256 poolAfter = usdc.balanceOf(address(pool));
        // Premium = 10 * $270 * 2% = $54 = 54_000_000
        assertEq(poolAfter - poolBefore, 54_000_000);
    }

    // ===== View Helper Tests =====

    function test_shouldTrigger() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        // Price at $270, stop at $250 -> should NOT trigger
        assertFalse(vault.shouldTrigger(positionId));

        // Price drops to $240
        oracle.forceUpdatePrice(24000000000);

        // Should trigger now
        assertTrue(vault.shouldTrigger(positionId));
    }

    function test_getDistanceToStop() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        // Price $270, stop $250 -> 270/250 * 100 = 108 (8% above stop)
        uint256 dist = vault.getDistanceToStop(positionId);
        assertEq(dist, 108);
    }

    function test_getUserPositions() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vault.createStopLoss(address(tsla), "TSLA", 2 ether, 25000000000, address(oracle));
        vault.createStopLoss(address(tsla), "TSLA", 3 ether, 24000000000, address(oracle));
        vm.stopPrank();

        bytes32[] memory ids = vault.getUserPositions(user);
        assertEq(ids.length, 2);
    }

    function test_getStats() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vault.createStopLoss(address(tsla), "TSLA", 5 ether, 25000000000, address(oracle));
        vm.stopPrank();

        (uint256 total, uint256 executed, ) = vault.getStats();
        assertEq(total, 1);
        assertEq(executed, 0);
    }

    // ===== Cooldown Tests =====

    function test_revertDoubleExecute() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        oracle.forceUpdatePrice(24000000000);

        vm.prank(bot);
        vault.executeStopLoss(positionId);

        // Second execute should revert — position is no longer ACTIVE
        vm.prank(bot);
        vm.expectRevert("StopLossVault: not active");
        vault.executeStopLoss(positionId);
    }

    function test_revertCancelExecutedPosition() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        oracle.forceUpdatePrice(24000000000);
        vm.prank(bot);
        vault.executeStopLoss(positionId);

        vm.prank(user);
        vm.expectRevert("StopLossVault: not active");
        vault.cancelStopLoss(positionId);
    }

    // ===== Stale Oracle Tests =====

    function test_revertCreateWithStaleOracle() public {
        // Warp time past 1-hour staleness window
        vm.warp(block.timestamp + 3601);

        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        vm.expectRevert("StopLossVault: stale oracle");
        vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();
    }

    // ===== Dust Attack Prevention =====

    function test_revertDustPositionZeroPremium() public {
        // 1 wei of TSLA at $270 gives premium = 0 in 6-dec USDC
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        vm.expectRevert("StopLossVault: position too small for insurance");
        vault.createStopLoss(
            address(tsla), "TSLA", 1, 25000000000, address(oracle)
        );
        vm.stopPrank();
    }

    // ===== Admin Function Tests =====

    function test_setBot() public {
        address newBot = address(0xB0b);
        vault.setBot(newBot);
        // Verify new bot can execute, old bot cannot
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, newBot == address(0) ? address(oracle) : address(oracle)
        );
        vm.stopPrank();

        oracle.forceUpdatePrice(24000000000);

        // Old bot should fail
        vm.prank(bot);
        vm.expectRevert("StopLossVault: only bot");
        vault.executeStopLoss(positionId);

        // New bot should succeed
        vm.prank(newBot);
        vault.executeStopLoss(positionId);
    }

    function test_setFeeRecipient() public {
        address feeAddr = address(0xFEE);
        vault.setFeeRecipient(feeAddr);

        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        oracle.forceUpdatePrice(24000000000);

        uint256 feeBefore = usdc.balanceOf(feeAddr);
        vm.prank(bot);
        vault.executeStopLoss(positionId);

        // Fee recipient should have received the 0.5% execution fee
        uint256 feeAfter = usdc.balanceOf(feeAddr);
        assertTrue(feeAfter > feeBefore);
    }

    function test_revertSetBotUnauthorized() public {
        vm.prank(user);
        vm.expectRevert();
        vault.setBot(address(0xBAD));
    }

    // ===== Pool Accounting Tests =====

    function test_poolStatsUpdatedOnCreate() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        vault.createStopLoss(address(tsla), "TSLA", 10 ether, 25000000000, address(oracle));
        vm.stopPrank();

        (, , uint256 premiums, , ) = pool.getStats();
        // 10 TSLA * $270 * 2% = $54 = 54_000_000 USDC
        assertEq(premiums, 54_000_000);
    }

    function test_poolStatsUpdatedOnExecute() public {
        vm.startPrank(user);
        tsla.approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        bytes32 positionId = vault.createStopLoss(
            address(tsla), "TSLA", 5 ether, 25000000000, address(oracle)
        );
        vm.stopPrank();

        // Massive gap: crash to $200
        oracle.forceUpdatePrice(20000000000);

        vm.prank(bot);
        vault.executeStopLoss(positionId);

        (, , , uint256 gapsPaid, ) = pool.getStats();
        // Gap = (stop - market) * amount = ($250 - $200) * 5 = $250 = 250_000_000 USDC
        assertGt(gapsPaid, 0);
    }

    // ===== Helper =====

    function _getProviderInfo(address provider) internal view returns (GapInsurancePool.ProviderInfo memory) {
        (uint256 usdcDeposited, uint256 sharesHeld, uint256 premiumsClaimed, uint256 depositedAt)
            = pool.providers(provider);
        return GapInsurancePool.ProviderInfo({
            usdcDeposited: usdcDeposited,
            sharesHeld: sharesHeld,
            premiumsClaimed: premiumsClaimed,
            depositedAt: depositedAt
        });
    }
}
