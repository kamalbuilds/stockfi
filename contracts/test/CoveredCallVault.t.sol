// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {CoveredCallVault} from "../src/CoveredCallVault.sol";

/// @dev Minimal ERC-20 mock for testing
contract MockToken is Test {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _dec) {
        name = _name;
        symbol = _symbol;
        decimals = _dec;
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

contract CoveredCallVaultTest is Test {
    CoveredCallVault vault;
    PriceOracle oracle;
    MockToken tsla;
    MockToken usdc;

    address deployer;
    address writer;
    address buyer;

    // TSLA at $350 (8 decimals)
    int256 constant TSLA_PRICE = 35000000000;

    function setUp() public {
        deployer = address(this);
        writer = makeAddr("writer");
        buyer = makeAddr("buyer");

        // Deploy tokens
        tsla = new MockToken("Tesla", "TSLA", 18);
        usdc = new MockToken("USD Coin", "USDC", 6);

        // Deploy oracle with initial price
        oracle = new PriceOracle("TSLA/USD", 8, deployer);
        oracle.forceUpdatePrice(TSLA_PRICE);

        // Deploy vault
        vault = new CoveredCallVault(address(usdc));

        // Fund writer with TSLA
        tsla.mint(writer, 100 ether); // 100 TSLA tokens

        // Fund buyer with USDC
        usdc.mint(buyer, 1_000_000e6); // 1M USDC

        // Approvals
        vm.prank(writer);
        tsla.approve(address(vault), type(uint256).max);

        vm.prank(buyer);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════
    // WRITE CALL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_writeCall_basic() public {
        uint256 strikePrice = 40000000000; // $400 strike (above current $350)
        uint256 premium = 500e6; // $500 USDC premium
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, strikePrice, premium, expiry, address(oracle)
        );

        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertEq(opt.writer, writer);
        assertEq(opt.buyer, address(0));
        assertEq(opt.stockToken, address(tsla));
        assertEq(opt.amount, 10 ether);
        assertEq(opt.strikePrice, strikePrice);
        assertEq(opt.premium, premium);
        assertEq(opt.expiry, expiry);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.OPEN);

        // TSLA should be locked in vault
        assertEq(tsla.balanceOf(address(vault)), 10 ether);
        assertEq(tsla.balanceOf(writer), 90 ether);
    }

    function test_writeCall_locks_tokens() public {
        uint256 writerBalanceBefore = tsla.balanceOf(writer);

        vm.prank(writer);
        vault.writeCall(
            address(tsla), "TSLA", 5 ether, 40000000000, 200e6,
            block.timestamp + 7 days, address(oracle)
        );

        assertEq(tsla.balanceOf(writer), writerBalanceBefore - 5 ether);
        assertEq(tsla.balanceOf(address(vault)), 5 ether);
    }

    function test_writeCall_reverts_strike_below_current() public {
        vm.prank(writer);
        vm.expectRevert("CoveredCallVault: strike must be above current price");
        vault.writeCall(
            address(tsla), "TSLA", 10 ether,
            30000000000, // $300 < $350 current
            500e6, block.timestamp + 7 days, address(oracle)
        );
    }

    function test_writeCall_reverts_expiry_too_soon() public {
        vm.prank(writer);
        vm.expectRevert("CoveredCallVault: expiry too soon");
        vault.writeCall(
            address(tsla), "TSLA", 10 ether,
            40000000000, 500e6,
            block.timestamp + 30 minutes, // Less than MIN_DURATION (1h)
            address(oracle)
        );
    }

    function test_writeCall_reverts_expiry_too_far() public {
        vm.prank(writer);
        vm.expectRevert("CoveredCallVault: expiry too far");
        vault.writeCall(
            address(tsla), "TSLA", 10 ether,
            40000000000, 500e6,
            block.timestamp + 31 days, // More than MAX_DURATION (30d)
            address(oracle)
        );
    }

    function test_writeCall_increments_stats() public {
        vm.prank(writer);
        vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        (uint256 written,,,,, ) = vault.getStats();
        assertEq(written, 1);
    }

    function test_writeCall_multiple_options() public {
        vm.startPrank(writer);
        vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );
        vault.writeCall(
            address(tsla), "TSLA", 5 ether, 45000000000, 300e6,
            block.timestamp + 14 days, address(oracle)
        );
        vm.stopPrank();

        bytes32[] memory writerOpts = vault.getWriterOptions(writer);
        assertEq(writerOpts.length, 2);
        assertEq(tsla.balanceOf(address(vault)), 15 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    // BUY CALL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_buyCall_basic() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        uint256 writerUsdcBefore = usdc.balanceOf(writer);

        vm.prank(buyer);
        vault.buyCall(optionId);

        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertEq(opt.buyer, buyer);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.BOUGHT);

        // Writer receives 99% of premium (1% fee)
        uint256 expectedWriterPayment = 500e6 - (500e6 * 100 / 10_000); // 495 USDC
        assertEq(usdc.balanceOf(writer), writerUsdcBefore + expectedWriterPayment);
    }

    function test_buyCall_protocol_fee() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 1000e6,
            block.timestamp + 7 days, address(oracle)
        );

        uint256 feeRecipientBefore = usdc.balanceOf(deployer);

        vm.prank(buyer);
        vault.buyCall(optionId);

        // 1% of 1000 USDC = 10 USDC fee
        assertEq(usdc.balanceOf(deployer), feeRecipientBefore + 10e6);
    }

    function test_buyCall_reverts_writer_self_buy() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        usdc.mint(writer, 1000e6);
        vm.prank(writer);
        usdc.approve(address(vault), type(uint256).max);

        vm.prank(writer);
        vm.expectRevert("CoveredCallVault: writer cannot buy own call");
        vault.buyCall(optionId);
    }

    function test_buyCall_reverts_already_bought() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        address buyer2 = makeAddr("buyer2");
        usdc.mint(buyer2, 1000e6);
        vm.prank(buyer2);
        usdc.approve(address(vault), type(uint256).max);

        vm.prank(buyer2);
        vm.expectRevert("CoveredCallVault: not open");
        vault.buyCall(optionId);
    }

    function test_buyCall_reverts_expired() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.warp(block.timestamp + 8 days);

        vm.prank(buyer);
        vm.expectRevert("CoveredCallVault: expired");
        vault.buyCall(optionId);
    }

    // ═══════════════════════════════════════════════════════════════
    // EXERCISE CALL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_exerciseCall_basic() public {
        uint256 strikePrice = 40000000000; // $400

        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, strikePrice, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Price rises to $420
        oracle.forceUpdatePrice(42000000000);

        uint256 buyerTslaBefore = tsla.balanceOf(buyer);
        uint256 writerUsdcBefore = usdc.balanceOf(writer);

        vm.prank(buyer);
        vault.exerciseCall(optionId);

        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.EXERCISED);

        // Buyer receives 10 TSLA
        assertEq(tsla.balanceOf(buyer), buyerTslaBefore + 10 ether);

        // Writer receives strike price in USDC: 10 * $400 = $4000
        // 10e18 * 40000000000 / 1e18 = 40000000000 (8 dec) / 100 = 400000000 (6 dec) = $4000
        uint256 expectedUsdc = 4000e6;
        assertEq(usdc.balanceOf(writer), writerUsdcBefore + expectedUsdc);
    }

    function test_exerciseCall_reverts_below_strike() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Price stays at $350 (below $400 strike)
        vm.prank(buyer);
        vm.expectRevert("CoveredCallVault: price below strike");
        vault.exerciseCall(optionId);
    }

    function test_exerciseCall_reverts_after_expiry() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Warp past expiry
        vm.warp(block.timestamp + 8 days);
        oracle.forceUpdatePrice(42000000000);

        vm.prank(buyer);
        vm.expectRevert("CoveredCallVault: expired");
        vault.exerciseCall(optionId);
    }

    function test_exerciseCall_reverts_not_buyer() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        oracle.forceUpdatePrice(42000000000);

        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert("CoveredCallVault: not buyer");
        vault.exerciseCall(optionId);
    }

    function test_exerciseCall_at_exact_strike() public {
        uint256 strikePrice = 40000000000; // $400

        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, strikePrice, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Price rises to exactly $400 (strike)
        oracle.forceUpdatePrice(40000000000);

        vm.prank(buyer);
        vault.exerciseCall(optionId);

        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.EXERCISED);
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPIRE CALL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_expireCall_bought_but_unexercised() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Warp past expiry
        vm.warp(block.timestamp + 8 days);

        uint256 writerTslaBefore = tsla.balanceOf(writer);

        vault.expireCall(optionId);

        // Writer gets tokens back
        assertEq(tsla.balanceOf(writer), writerTslaBefore + 10 ether);
        assertEq(tsla.balanceOf(address(vault)), 0);

        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.EXPIRED);
    }

    function test_expireCall_unsold() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        // Nobody buys. Warp past expiry.
        vm.warp(block.timestamp + 8 days);

        vault.expireCall(optionId);

        assertEq(tsla.balanceOf(writer), 100 ether); // All tokens back
        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.EXPIRED);
    }

    function test_expireCall_reverts_before_expiry() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.expectRevert("CoveredCallVault: not expired yet");
        vault.expireCall(optionId);
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCEL CALL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_cancelCall_basic() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(writer);
        vault.cancelCall(optionId);

        assertEq(tsla.balanceOf(writer), 100 ether);
        CoveredCallVault.CallOption memory opt = vault.getOption(optionId);
        assertTrue(opt.status == CoveredCallVault.OptionStatus.CANCELLED);
    }

    function test_cancelCall_reverts_after_bought() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        vm.prank(writer);
        vm.expectRevert("CoveredCallVault: not open");
        vault.cancelCall(optionId);
    }

    function test_cancelCall_reverts_not_writer() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vm.expectRevert("CoveredCallVault: not writer");
        vault.cancelCall(optionId);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPER TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_isInTheMoney() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Below strike - not ITM
        assertFalse(vault.isInTheMoney(optionId));

        // At strike - ITM
        oracle.forceUpdatePrice(40000000000);
        assertTrue(vault.isInTheMoney(optionId));

        // Above strike - ITM
        oracle.forceUpdatePrice(45000000000);
        assertTrue(vault.isInTheMoney(optionId));
    }

    function test_timeToExpiry() public {
        uint256 duration = 7 days;
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + duration, address(oracle)
        );

        assertEq(vault.timeToExpiry(optionId), duration);

        vm.warp(block.timestamp + 3 days);
        assertEq(vault.timeToExpiry(optionId), 4 days);

        vm.warp(block.timestamp + 5 days);
        assertEq(vault.timeToExpiry(optionId), 0);
    }

    function test_intrinsicValue() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        // Below strike: 0 intrinsic value
        assertEq(vault.intrinsicValue(optionId), 0);

        // At $420: intrinsic = ($420 - $400) * 10 = $200 (8 decimals)
        oracle.forceUpdatePrice(42000000000);
        // (42000000000 - 40000000000) * 10e18 / 1e18 = 20000000000
        assertEq(vault.intrinsicValue(optionId), 20000000000);
    }

    function test_stats_track_correctly() public {
        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        oracle.forceUpdatePrice(42000000000);

        vm.prank(buyer);
        vault.exerciseCall(optionId);

        (
            uint256 written,
            uint256 bought,
            uint256 exercised,
            uint256 expired,
            uint256 premiums,
            uint256 volume
        ) = vault.getStats();

        assertEq(written, 1);
        assertEq(bought, 1);
        assertEq(exercised, 1);
        assertEq(expired, 0);
        assertEq(premiums, 500e6);
        assertGt(volume, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // FULL FLOW: WRITER EARNS YIELD
    // ═══════════════════════════════════════════════════════════════

    function test_fullFlow_writer_earns_yield() public {
        // Writer deposits 10 TSLA, writes $400 strike call, 500 USDC premium
        // Price stays below $400 -> option expires -> writer keeps tokens + premium

        uint256 writerTslaBefore = tsla.balanceOf(writer);

        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        // Buyer purchases for 500 USDC
        vm.prank(buyer);
        vault.buyCall(optionId);

        // Price stays at $350. Option expires worthless.
        vm.warp(block.timestamp + 8 days);
        vault.expireCall(optionId);

        // Writer has all TSLA back + earned 495 USDC premium (99% after 1% fee)
        assertEq(tsla.balanceOf(writer), writerTslaBefore);
        assertEq(usdc.balanceOf(writer), 495e6);
    }

    function test_fullFlow_buyer_profits() public {
        // Writer deposits 10 TSLA at $350, writes $400 strike call, 500 USDC premium
        // Price rises to $450 -> buyer exercises -> buyer gets TSLA at $400 (worth $450)

        vm.prank(writer);
        bytes32 optionId = vault.writeCall(
            address(tsla), "TSLA", 10 ether, 40000000000, 500e6,
            block.timestamp + 7 days, address(oracle)
        );

        vm.prank(buyer);
        vault.buyCall(optionId);

        // Price rises to $450
        oracle.forceUpdatePrice(45000000000);

        uint256 buyerUsdcBefore = usdc.balanceOf(buyer);

        vm.prank(buyer);
        vault.exerciseCall(optionId);

        // Buyer paid 500 USDC premium + 4000 USDC strike = 4500 total
        // Buyer received 10 TSLA worth $4500 at market
        // Profit: $4500 market - $4500 cost = $0 at market, but TSLA could continue rising
        assertEq(tsla.balanceOf(buyer), 10 ether);
        // 4000 USDC paid to writer for exercise
        assertEq(usdc.balanceOf(buyer), buyerUsdcBefore - 4000e6);
    }
}
