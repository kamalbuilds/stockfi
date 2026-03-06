// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {FHEStopLoss} from "../src/FHEStopLoss.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {GapInsurancePool} from "../src/GapInsurancePool.sol";
import {FHE, euint128, ebool, InEuint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {CoFheTest} from "@fhenixprotocol/cofhe-foundry-mocks/CoFheTest.sol";

/// @dev Minimal ERC-20 mock for FHE tests
contract MockERC20FHE is Test {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _n, string memory _s, uint8 _d) { name = _n; symbol = _s; decimals = _d; }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient");
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FHEStopLossTest is Test {
    CoFheTest private CFT;
    FHEStopLoss public fheVault;
    PriceOracle public tslaOracle;
    GapInsurancePool public pool;
    MockERC20FHE public tsla;
    MockERC20FHE public usdc;

    address deployer;
    address user;
    address botAddr;

    int256 constant TSLA_PRICE = 35000000000; // $350.00

    function setUp() public {
        // Initialize FHE mock environment
        CFT = new CoFheTest(true);

        deployer = address(this);
        user = makeAddr("user");
        botAddr = makeAddr("bot");

        // Deploy tokens
        tsla = new MockERC20FHE("Tesla", "TSLA", 18);
        usdc = new MockERC20FHE("USDC", "USDC", 6);

        // Deploy oracle
        tslaOracle = new PriceOracle("TSLA/USD", 8, deployer);
        tslaOracle.forceUpdatePrice(TSLA_PRICE);

        // Deploy insurance pool
        pool = new GapInsurancePool(address(usdc));

        // Deploy FHEStopLoss
        fheVault = new FHEStopLoss(botAddr, address(pool), address(usdc));
        pool.setVault(address(fheVault));

        // Fund user
        tsla.mint(user, 100 ether);
        usdc.mint(user, 100_000e6);

        // Fund insurance pool
        usdc.mint(deployer, 500_000e6);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(500_000e6);
    }

    // ═══════════════════════════════════════════════════════════════
    // DEPLOYMENT TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_deployment() public view {
        assertEq(fheVault.owner(), deployer);
        assertEq(fheVault.bot(), botAddr);
        assertEq(fheVault.insurancePool(), address(pool));
        assertEq(fheVault.usdc(), address(usdc));
        assertEq(fheVault.totalPositions(), 0);
        assertEq(fheVault.totalExecuted(), 0);
    }

    function test_constants() public view {
        assertEq(fheVault.PREMIUM_BPS(), 200);
        assertEq(fheVault.EXECUTION_FEE_BPS(), 50);
    }

    // ═══════════════════════════════════════════════════════════════
    // CREATE ENCRYPTED STOP-LOSS
    // ═══════════════════════════════════════════════════════════════

    function test_createEncryptedStopLoss() public {
        uint256 stopPrice = 30000000000; // $300 (8 decimals)

        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        // Encrypt the stop price using FHE
        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(stopPrice), user);

        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla),
            "TSLA",
            10 ether,
            encStopPrice,
            address(tslaOracle)
        );
        vm.stopPrank();

        // Verify position created
        (
            address posOwner,
            address stockToken,
            string memory ticker,
            uint256 amount,
            uint256 premiumPaid,
            address oracle,
            FHEStopLoss.FHEStopStatus status,
            uint256 createdAt,
            uint256 executedAt
        ) = fheVault.getPosition(positionId);

        assertEq(posOwner, user);
        assertEq(stockToken, address(tsla));
        assertEq(keccak256(bytes(ticker)), keccak256(bytes("TSLA")));
        assertEq(amount, 10 ether);
        assertGt(premiumPaid, 0);
        assertEq(oracle, address(tslaOracle));
        assertTrue(status == FHEStopLoss.FHEStopStatus.ACTIVE);
        assertEq(createdAt, block.timestamp);
        assertEq(executedAt, 0);
    }

    function test_createEncryptedStopLoss_transfersTokens() public {
        uint256 userTslaBefore = tsla.balanceOf(user);

        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        assertEq(tsla.balanceOf(user), userTslaBefore - 10 ether);
        assertEq(tsla.balanceOf(address(fheVault)), 10 ether);
    }

    function test_createEncryptedStopLoss_paysPremium() public {
        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        // Premium = 10 TSLA * $350 * 2% = $70 = 70_000000 USDC
        uint256 expectedPremium = (10 ether * uint256(TSLA_PRICE) / 1e18 * 200 / 10_000) / 100;
        assertEq(usdc.balanceOf(user), userUsdcBefore - expectedPremium);
    }

    function test_createEncryptedStopLoss_incrementsStats() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        (uint256 total, uint256 executed) = fheVault.getStats();
        assertEq(total, 1);
        assertEq(executed, 0);
    }

    function test_createEncryptedStopLoss_revertsZeroToken() public {
        vm.startPrank(user);
        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        vm.expectRevert("FHEStopLoss: zero token");
        fheVault.createEncryptedStopLoss(
            address(0), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();
    }

    function test_createEncryptedStopLoss_revertsZeroAmount() public {
        vm.startPrank(user);
        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        vm.expectRevert("FHEStopLoss: zero amount");
        fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 0, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // FHE ENCRYPTED COMPARISON
    // ═══════════════════════════════════════════════════════════════

    function test_checkTrigger_returnsEncryptedBool() public {
        // Create position
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user); // $300
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );

        // Check with price below stop ($250 <= $300 = true)
        InEuint128 memory encCurrentPrice = CFT.createInEuint128(uint128(25000000000), user);
        ebool result = fheVault.checkTrigger(positionId, encCurrentPrice);
        vm.stopPrank();

        // The result is an encrypted boolean - in mock mode we can verify it exists
        // In production, this would need threshold decryption
        assertTrue(ebool.unwrap(result) != 0);
    }

    function test_checkTrigger_revertsIfNotActive() public {
        // Create and cancel a position
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );

        fheVault.cancelStopLoss(positionId);

        InEuint128 memory encCurrentPrice = CFT.createInEuint128(uint128(25000000000), user);
        vm.expectRevert("FHEStopLoss: not active");
        fheVault.checkTrigger(positionId, encCurrentPrice);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // EXECUTE
    // ═══════════════════════════════════════════════════════════════

    function test_executeStopLoss() public {
        // Create position
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user); // $300
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        // Bot executes after FHE comparison confirmed trigger
        uint256 userUsdcBefore = usdc.balanceOf(user);
        uint256 marketPrice = 28000000000; // $280

        vm.prank(botAddr);
        fheVault.executeStopLoss(positionId, marketPrice);

        // User receives USDC
        uint256 userUsdcAfter = usdc.balanceOf(user);
        assertGt(userUsdcAfter, userUsdcBefore);

        // Position is executed
        (,,,,,,FHEStopLoss.FHEStopStatus status,,) = fheVault.getPosition(positionId);
        assertTrue(status == FHEStopLoss.FHEStopStatus.EXECUTED);

        // Stats updated
        (uint256 total, uint256 executed) = fheVault.getStats();
        assertEq(total, 1);
        assertEq(executed, 1);
    }

    function test_executeStopLoss_correctPayout() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        uint256 userUsdcBefore = usdc.balanceOf(user);
        uint256 marketPrice = 28000000000; // $280

        vm.prank(botAddr);
        fheVault.executeStopLoss(positionId, marketPrice);

        // Expected: 10 TSLA * $280 = $2800
        // Fee: $2800 * 0.5% = $14
        // Net: $2800 - $14 = $2786
        uint256 payoutUsd8 = (10 ether * marketPrice) / 1e18;
        uint256 payoutUsdc = payoutUsd8 / 100;
        uint256 feeUsdc = (payoutUsdc * 50) / 10_000;
        uint256 expectedNet = payoutUsdc - feeUsdc;

        assertEq(usdc.balanceOf(user) - userUsdcBefore, expectedNet);
    }

    function test_executeStopLoss_onlyBot() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );

        vm.expectRevert("FHEStopLoss: only bot");
        fheVault.executeStopLoss(positionId, 28000000000);
        vm.stopPrank();
    }

    function test_executeStopLoss_revertsIfNotActive() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        fheVault.cancelStopLoss(positionId);
        vm.stopPrank();

        vm.prank(botAddr);
        vm.expectRevert("FHEStopLoss: not active");
        fheVault.executeStopLoss(positionId, 28000000000);
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCEL
    // ═══════════════════════════════════════════════════════════════

    function test_cancelStopLoss() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );

        uint256 tslaBefore = tsla.balanceOf(user);
        fheVault.cancelStopLoss(positionId);
        vm.stopPrank();

        // Tokens returned
        assertEq(tsla.balanceOf(user), tslaBefore + 10 ether);

        // Status cancelled
        (,,,,,,FHEStopLoss.FHEStopStatus status,,) = fheVault.getPosition(positionId);
        assertTrue(status == FHEStopLoss.FHEStopStatus.CANCELLED);
    }

    function test_cancelStopLoss_notOwnerReverts() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory encStopPrice = CFT.createInEuint128(uint128(30000000000), user);
        bytes32 positionId = fheVault.createEncryptedStopLoss(
            address(tsla), "TSLA", 10 ether, encStopPrice, address(tslaOracle)
        );
        vm.stopPrank();

        vm.prank(botAddr);
        vm.expectRevert("FHEStopLoss: not position owner");
        fheVault.cancelStopLoss(positionId);
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    function test_getUserPositions() public {
        vm.startPrank(user);
        tsla.approve(address(fheVault), type(uint256).max);
        usdc.approve(address(fheVault), type(uint256).max);

        InEuint128 memory enc1 = CFT.createInEuint128(uint128(30000000000), user);
        fheVault.createEncryptedStopLoss(address(tsla), "TSLA", 5 ether, enc1, address(tslaOracle));

        InEuint128 memory enc2 = CFT.createInEuint128(uint128(28000000000), user);
        fheVault.createEncryptedStopLoss(address(tsla), "TSLA", 5 ether, enc2, address(tslaOracle));
        vm.stopPrank();

        bytes32[] memory positions = fheVault.getUserPositions(user);
        assertEq(positions.length, 2);
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function test_setBot() public {
        address newBot = makeAddr("newBot");
        fheVault.setBot(newBot);
        assertEq(fheVault.bot(), newBot);
    }

    function test_setInsurancePool() public {
        address newPool = makeAddr("newPool");
        fheVault.setInsurancePool(newPool);
        assertEq(fheVault.insurancePool(), newPool);
    }

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");
        fheVault.transferOwnership(newOwner);
        assertEq(fheVault.owner(), newOwner);
    }

    function test_transferOwnership_revertsZero() public {
        vm.expectRevert("FHEStopLoss: zero address");
        fheVault.transferOwnership(address(0));
    }
}
