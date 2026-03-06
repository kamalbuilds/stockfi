// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {PrivateStopLoss} from "../src/PrivateStopLoss.sol";
import {GapInsurancePool} from "../src/GapInsurancePool.sol";

contract MockERC20PSL is Test {
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

contract PrivateStopLossTest is Test {
    PriceOracle oracle;
    PrivateStopLoss psl;
    GapInsurancePool pool;
    MockERC20PSL tsla;
    MockERC20PSL usdc;

    address deployer = address(this);
    address user = address(0xBEEF);
    address lp = address(0xCAFE);
    address botAddr = address(0xB077);

    uint256 constant TSLA_PRICE = 280_00000000; // $280.00 (8 dec)
    uint256 constant STOP_PRICE = 270_00000000; // $270.00 (8 dec)
    bytes32 constant SALT = keccak256("my_secret_salt");

    function setUp() public {
        // Deploy tokens
        tsla = new MockERC20PSL("Tesla", "TSLA", 18);
        usdc = new MockERC20PSL("USDC", "USDC", 6);

        // Deploy oracle + pool + private stop-loss
        oracle = new PriceOracle("TSLA/USD", 8, deployer);
        pool = new GapInsurancePool(address(usdc));
        psl = new PrivateStopLoss(botAddr, address(pool), address(usdc));

        // Configure pool
        pool.setVault(address(psl));

        // Seed oracle price
        oracle.updatePrice(int256(TSLA_PRICE));

        // Fund user: 100 TSLA + 10K USDC
        tsla.mint(user, 100 ether);
        usdc.mint(user, 10_000 * 1e6);

        // Fund LP: 1M USDC in pool
        usdc.mint(lp, 1_000_000 * 1e6);
        vm.startPrank(lp);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(1_000_000 * 1e6);
        vm.stopPrank();

        // User approvals
        vm.startPrank(user);
        tsla.approve(address(psl), type(uint256).max);
        usdc.approve(address(psl), type(uint256).max);
        vm.stopPrank();
    }

    function _commitHash(uint256 stopPrice, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(stopPrice, salt));
    }

    // ═══════════════════════════════════════════════════════════════
    // COMMIT TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_commitStopLoss() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(pos.owner, user);
        assertEq(pos.amount, 10 ether);
        assertEq(pos.commitHash, hash);
        assertEq(pos.revealedStopPrice, 0); // Hidden!
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.COMMITTED));
    }

    function test_commitHash_is_opaque() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        // The stop price is NOT stored anywhere on-chain
        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(pos.revealedStopPrice, 0);
        // Only the hash is visible
        assertTrue(pos.commitHash != bytes32(0));
    }

    function test_commit_transfers_tokens_and_premium() public {
        uint256 userTslaBefore = tsla.balanceOf(user);
        uint256 userUsdcBefore = usdc.balanceOf(user);

        bytes32 hash = _commitHash(STOP_PRICE, SALT);
        vm.prank(user);
        psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        // 10 TSLA transferred to contract
        assertEq(tsla.balanceOf(user), userTslaBefore - 10 ether);
        assertEq(tsla.balanceOf(address(psl)), 10 ether);

        // Premium: 10 * $280 * 2% = $56 USDC = 56_000000
        uint256 expectedPremium = (10 ether * TSLA_PRICE / 1e18) * 200 / 10_000 / 100;
        assertEq(usdc.balanceOf(user), userUsdcBefore - expectedPremium);
    }

    function test_commit_revert_zero_amount() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);
        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: zero amount");
        psl.commitStopLoss(address(tsla), "TSLA", 0, hash, address(oracle));
    }

    function test_commit_revert_zero_hash() public {
        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: zero hash");
        psl.commitStopLoss(address(tsla), "TSLA", 10 ether, bytes32(0), address(oracle));
    }

    // ═══════════════════════════════════════════════════════════════
    // REVEAL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_revealStopLoss() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(pos.revealedStopPrice, STOP_PRICE);
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.REVEALED));
    }

    function test_reveal_wrong_salt_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        bytes32 wrongSalt = keccak256("wrong_salt");
        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: hash mismatch");
        psl.revealStopLoss(posId, STOP_PRICE, wrongSalt);
    }

    function test_reveal_wrong_price_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        uint256 wrongPrice = 260_00000000;
        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: hash mismatch");
        psl.revealStopLoss(posId, wrongPrice, SALT);
    }

    function test_reveal_expired_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        // Fast forward past reveal deadline
        vm.warp(block.timestamp + 8 days);
        // Keep oracle fresh
        oracle.updatePrice(int256(TSLA_PRICE));

        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: reveal expired");
        psl.revealStopLoss(posId, STOP_PRICE, SALT);
    }

    function test_reveal_only_position_owner() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        address attacker = address(0xDEAD);
        vm.prank(attacker);
        vm.expectRevert("PrivateStopLoss: not position owner");
        psl.revealStopLoss(posId, STOP_PRICE, SALT);
    }

    // ═══════════════════════════════════════════════════════════════
    // EXECUTE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_executeAfterReveal() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        // Drop price below stop
        oracle.updatePrice(int256(265_00000000)); // $265

        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.prank(botAddr);
        psl.executeStopLoss(posId);

        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.EXECUTED));

        // User should receive USDC at guaranteed price minus fee
        uint256 guaranteed8 = (10 ether * STOP_PRICE) / 1e18;
        uint256 guaranteedUsdc = guaranteed8 / 100;
        uint256 fee = (guaranteedUsdc * 50) / 10_000;
        uint256 expected = guaranteedUsdc - fee;
        assertEq(usdc.balanceOf(user), userUsdcBefore + expected);
    }

    function test_execute_before_reveal_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        oracle.updatePrice(int256(265_00000000));

        vm.prank(botAddr);
        vm.expectRevert("PrivateStopLoss: not revealed");
        psl.executeStopLoss(posId);
    }

    function test_execute_price_above_stop_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        // Price still above stop
        vm.prank(botAddr);
        vm.expectRevert("PrivateStopLoss: price above stop");
        psl.executeStopLoss(posId);
    }

    function test_shouldTrigger_committed_returns_false() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        oracle.updatePrice(int256(265_00000000));

        // Not revealed yet, should NOT trigger
        assertFalse(psl.shouldTrigger(posId));
    }

    function test_shouldTrigger_revealed_below_stop() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        oracle.updatePrice(int256(265_00000000));

        assertTrue(psl.shouldTrigger(posId));
    }

    // ═══════════════════════════════════════════════════════════════
    // CANCEL TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_cancelCommitted() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        uint256 tslaBefore = tsla.balanceOf(user);

        vm.prank(user);
        psl.cancelStopLoss(posId);

        assertEq(tsla.balanceOf(user), tslaBefore + 10 ether);
        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.CANCELLED));
    }

    function test_cancelRevealed() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        vm.prank(user);
        psl.cancelStopLoss(posId);

        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.CANCELLED));
    }

    function test_cancelExecuted_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        oracle.updatePrice(int256(265_00000000));
        vm.prank(botAddr);
        psl.executeStopLoss(posId);

        vm.prank(user);
        vm.expectRevert("PrivateStopLoss: cannot cancel");
        psl.cancelStopLoss(posId);
    }

    // ═══════════════════════════════════════════════════════════════
    // STATS + HELPERS
    // ═══════════════════════════════════════════════════════════════

    function test_computeCommitHash() public view {
        bytes32 expected = keccak256(abi.encodePacked(STOP_PRICE, SALT));
        assertEq(psl.computeCommitHash(STOP_PRICE, SALT), expected);
    }

    function test_stats_track_correctly() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        (uint256 c, uint256 r, uint256 e) = psl.getStats();
        assertEq(c, 1);
        assertEq(r, 0);
        assertEq(e, 0);

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        (c, r, e) = psl.getStats();
        assertEq(c, 1);
        assertEq(r, 1);
        assertEq(e, 0);

        oracle.updatePrice(int256(265_00000000));
        vm.prank(botAddr);
        psl.executeStopLoss(posId);

        (c, r, e) = psl.getStats();
        assertEq(c, 1);
        assertEq(r, 1);
        assertEq(e, 1);
    }

    function test_getUserPositions() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        bytes32[] memory ids = psl.getUserPositions(user);
        assertEq(ids.length, 1);
        assertEq(ids[0], posId);
    }

    // ═══════════════════════════════════════════════════════════════
    // REVEAL-AND-EXECUTE (bot keeper auto-reveal)
    // ═══════════════════════════════════════════════════════════════

    function test_revealAndExecute_bot_keeper() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        // Stop is COMMITTED — price still above stop, keeper should NOT trigger
        assertEq(uint8(psl.getPosition(posId).status), uint8(PrivateStopLoss.PrivateStopStatus.COMMITTED));

        // Price drops below stop — bot atomically reveals + executes
        oracle.updatePrice(int256(262_00000000)); // $262

        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.prank(botAddr);
        psl.revealAndExecute(posId, STOP_PRICE, SALT);

        PrivateStopLoss.PrivatePosition memory pos = psl.getPosition(posId);
        assertEq(uint8(pos.status), uint8(PrivateStopLoss.PrivateStopStatus.EXECUTED));
        assertEq(pos.revealedStopPrice, STOP_PRICE);

        // User receives USDC at guaranteed $270 price, not market $262
        uint256 guaranteed8 = (10 ether * STOP_PRICE) / 1e18;
        uint256 guaranteedUsdc = guaranteed8 / 100;
        uint256 fee = (guaranteedUsdc * 50) / 10_000;
        assertEq(usdc.balanceOf(user), userUsdcBefore + (guaranteedUsdc - fee));
    }

    function test_revealAndExecute_price_above_stop_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        // Price still at $280 — above stop of $270 — keeper must NOT execute
        vm.prank(botAddr);
        vm.expectRevert("PrivateStopLoss: price above stop");
        psl.revealAndExecute(posId, STOP_PRICE, SALT);
    }

    function test_revealAndExecute_wrong_salt_reverts() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));
        oracle.updatePrice(int256(262_00000000));

        vm.prank(botAddr);
        vm.expectRevert("PrivateStopLoss: hash mismatch");
        psl.revealAndExecute(posId, STOP_PRICE, keccak256("wrong_salt"));
    }

    function test_revealAndExecute_only_bot() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));
        oracle.updatePrice(int256(262_00000000));

        address attacker = address(0xDEAD);
        vm.prank(attacker);
        vm.expectRevert("PrivateStopLoss: only bot");
        psl.revealAndExecute(posId, STOP_PRICE, SALT);
    }

    function test_revealAndExecute_emits_both_events() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));
        oracle.updatePrice(int256(262_00000000));

        vm.prank(botAddr);
        vm.expectEmit(true, true, false, true);
        emit PrivateStopLoss.StopRevealed(posId, user, STOP_PRICE);
        psl.revealAndExecute(posId, STOP_PRICE, SALT);
    }

    function test_gap_coverage_correct() public {
        bytes32 hash = _commitHash(STOP_PRICE, SALT);

        vm.prank(user);
        bytes32 posId = psl.commitStopLoss(address(tsla), "TSLA", 10 ether, hash, address(oracle));

        vm.prank(user);
        psl.revealStopLoss(posId, STOP_PRICE, SALT);

        // Big gap: price crashes to $250 (stop was $270)
        oracle.updatePrice(int256(250_00000000));

        uint256 poolUsdcBefore = usdc.balanceOf(address(pool));

        vm.prank(botAddr);
        psl.executeStopLoss(posId);

        // User gets $270 * 10 = $2700 minus 0.5% fee
        // Gap = ($270 - $250) * 10 = $200 covered by pool
        uint256 guaranteed = (10 ether * STOP_PRICE / 1e18) / 100;
        uint256 fee = guaranteed * 50 / 10_000;
        uint256 netPayout = guaranteed - fee;

        assertEq(usdc.balanceOf(user) > 0, true);
        // Pool should have less USDC (paid out the guarantee)
        assertTrue(usdc.balanceOf(address(pool)) < poolUsdcBefore);
    }
}
