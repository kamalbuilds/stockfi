// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {BasketPriceOracle} from "../src/BasketPriceOracle.sol";
import {StopLossVault} from "../src/StopLossVault.sol";
import {GapInsurancePool} from "../src/GapInsurancePool.sol";

/// @dev Minimal ERC-20 mock
contract MockERC20BPO is Test {
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

contract BasketPriceOracleTest is Test {
    BasketFactory factory;
    PriceOracle tslaOracle;
    PriceOracle amznOracle;
    BasketPriceOracle basketOracle;
    StopLossVault vault;
    GapInsurancePool pool;
    MockERC20BPO tsla;
    MockERC20BPO amzn;
    MockERC20BPO usdc;

    address deployer;
    address user;

    address basketToken;

    // TSLA at $350, AMZN at $200
    int256 constant TSLA_PRICE = 35000000000;
    int256 constant AMZN_PRICE = 20000000000;

    function setUp() public {
        deployer = address(this);
        user = makeAddr("user");

        // Deploy tokens
        tsla = new MockERC20BPO("Tesla", "TSLA", 18);
        amzn = new MockERC20BPO("Amazon", "AMZN", 18);
        usdc = new MockERC20BPO("USDC", "USDC", 6);

        // Deploy oracles
        tslaOracle = new PriceOracle("TSLA/USD", 8, deployer);
        amznOracle = new PriceOracle("AMZN/USD", 8, deployer);
        tslaOracle.forceUpdatePrice(TSLA_PRICE);
        amznOracle.forceUpdatePrice(AMZN_PRICE);

        // Deploy BasketFactory and register oracles
        factory = new BasketFactory();
        factory.setOracle(address(tsla), address(tslaOracle));
        factory.setOracle(address(amzn), address(amznOracle));

        // Create a basket: 60% TSLA + 40% AMZN
        address[] memory tokens = new address[](2);
        tokens[0] = address(tsla);
        tokens[1] = address(amzn);
        uint256[] memory weights = new uint256[](2);
        weights[0] = 6000; // 60%
        weights[1] = 4000; // 40%

        (, basketToken) = factory.createBasket("Tech Duo", "TDUO", tokens, weights);

        // Deploy BasketPriceOracle
        basketOracle = new BasketPriceOracle(address(factory), basketToken, "TDUO/USD");

        // Deploy insurance pool and vault
        pool = new GapInsurancePool(address(usdc));
        vault = new StopLossVault(deployer, address(pool), address(usdc));
        pool.setVault(address(vault));

        // Fund user with stock tokens and USDC
        tsla.mint(user, 100 ether);
        amzn.mint(user, 100 ether);
        usdc.mint(user, 100_000e6);

        // Fund insurance pool
        usdc.mint(deployer, 500_000e6);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(500_000e6);

        // Mint basket tokens for user
        vm.startPrank(user);
        tsla.approve(address(factory), type(uint256).max);
        amzn.approve(address(factory), type(uint256).max);
        factory.mint(basketToken, 10 ether); // 10 basket tokens
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    // BASKET PRICE ORACLE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_basketOracle_returnsCorrectPrice() public view {
        (, int256 price, , ,) = basketOracle.latestRoundData();
        // Expected: 60% * $350 + 40% * $200 = $210 + $80 = $290
        // In 8 decimals: 29000000000
        assertEq(price, 29000000000);
    }

    function test_basketOracle_updatesWithUnderlying() public {
        // Move TSLA to $400
        tslaOracle.forceUpdatePrice(40000000000);

        (, int256 price, , ,) = basketOracle.latestRoundData();
        // Expected: 60% * $400 + 40% * $200 = $240 + $80 = $320
        assertEq(price, 32000000000);
    }

    function test_basketOracle_decimals() public view {
        assertEq(basketOracle.decimals(), 8);
    }

    function test_basketOracle_description() public view {
        assertEq(basketOracle.description(), "TDUO/USD");
    }

    function test_basketOracle_timestampsAreCurrent() public view {
        (, , uint256 startedAt, uint256 updatedAt,) = basketOracle.latestRoundData();
        assertEq(startedAt, block.timestamp);
        assertEq(updatedAt, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    // FULL COMPOSABILITY: BASKET + INSURANCE
    // ═══════════════════════════════════════════════════════════════

    function test_composability_basketStopLoss() public {
        // User creates a stop-loss on their basket token
        // This is the key innovation: portfolio-level insurance

        (, int256 basketPrice, , ,) = basketOracle.latestRoundData();
        uint256 stopPrice = uint256(basketPrice) * 90 / 100; // Stop at 90% of current ($261)

        // Approve basket token and USDC for vault
        vm.startPrank(user);
        MockERC20BPO(basketToken).approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        bytes32 positionId = vault.createStopLoss(
            basketToken,
            "TDUO",
            5 ether, // 5 basket tokens
            stopPrice,
            address(basketOracle)
        );
        vm.stopPrank();

        // Verify position created
        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);
        assertEq(pos.owner, user);
        assertEq(pos.stockToken, basketToken);
        assertEq(pos.amount, 5 ether);
        assertEq(pos.stopPrice, stopPrice);
        assertTrue(pos.status == StopLossVault.StopLossStatus.ACTIVE);
    }

    function test_composability_basketStopLossExecutes() public {
        (, int256 basketPrice, , ,) = basketOracle.latestRoundData();
        uint256 stopPrice = uint256(basketPrice) * 90 / 100; // ~$261

        vm.startPrank(user);
        MockERC20BPO(basketToken).approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        bytes32 positionId = vault.createStopLoss(
            basketToken, "TDUO", 5 ether, stopPrice, address(basketOracle)
        );
        vm.stopPrank();

        // Drop TSLA to $200, AMZN to $150
        // New basket price: 60% * $200 + 40% * $150 = $120 + $60 = $180
        tslaOracle.forceUpdatePrice(20000000000);
        amznOracle.forceUpdatePrice(15000000000);

        // Verify price is now below stop
        assertTrue(vault.shouldTrigger(positionId));

        // Execute stop-loss
        uint256 userUsdcBefore = usdc.balanceOf(user);
        vault.executeStopLoss(positionId);

        // User receives USDC at the stop price, not the crashed market price
        uint256 userUsdcAfter = usdc.balanceOf(user);
        assertGt(userUsdcAfter, userUsdcBefore);

        StopLossVault.StopLossPosition memory pos = vault.getPosition(positionId);
        assertTrue(pos.status == StopLossVault.StopLossStatus.EXECUTED);
    }

    function test_composability_shouldNotTriggerAboveStop() public {
        (, int256 basketPrice, , ,) = basketOracle.latestRoundData();
        uint256 stopPrice = uint256(basketPrice) * 80 / 100; // Stop at 80%

        vm.startPrank(user);
        MockERC20BPO(basketToken).approve(address(vault), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);

        bytes32 positionId = vault.createStopLoss(
            basketToken, "TDUO", 5 ether, stopPrice, address(basketOracle)
        );
        vm.stopPrank();

        // Price hasn't dropped enough
        assertFalse(vault.shouldTrigger(positionId));
    }
}
