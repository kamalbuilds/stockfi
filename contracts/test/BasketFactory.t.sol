// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BasketFactory.sol";
import "../src/BasketToken.sol";
import "../src/MockUSDC.sol";

/// @dev Minimal ERC-20 mock for stock tokens
contract MockStock {
    string public name;
    string public symbol;
    uint8  public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _n, string memory _s) { name = _n; symbol = _s; }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract BasketFactoryTest is Test {
    BasketFactory factory;
    MockStock     tsla;
    MockStock     amzn;
    MockStock     pltr;

    address user  = address(0xBEEF);
    address user2 = address(0xCAFE);

    function setUp() public {
        factory = new BasketFactory();
        tsla    = new MockStock("Tesla",   "TSLA");
        amzn    = new MockStock("Amazon",  "AMZN");
        pltr    = new MockStock("Palantir","PLTR");

        // Mint stock tokens to user
        tsla.mint(user,  100e18);
        amzn.mint(user,  100e18);
        pltr.mint(user,  100e18);
        tsla.mint(user2, 100e18);
        amzn.mint(user2, 100e18);
    }

    // ─── createBasket ────────────────────────────────────────────────

    function test_createBasket_twoTokens() public {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](2);
        tokens[0] = address(tsla); weights[0] = 6000; // 60% TSLA
        tokens[1] = address(amzn); weights[1] = 4000; // 40% AMZN

        (uint256 id, address basketToken) = factory.createBasket("TechPair", "TPAIR", tokens, weights);

        assertEq(id, 0);
        assertTrue(factory.isBasketToken(basketToken));
        assertEq(BasketToken(basketToken).name(),   "TechPair");
        assertEq(BasketToken(basketToken).symbol(),  "TPAIR");
        assertEq(factory.basketCount(), 1);
    }

    function test_createBasket_threeTokens() public {
        address[] memory tokens  = new address[](3);
        uint256[] memory weights = new uint256[](3);
        tokens[0] = address(tsla); weights[0] = 5000; // 50%
        tokens[1] = address(amzn); weights[1] = 3000; // 30%
        tokens[2] = address(pltr); weights[2] = 2000; // 20%

        (uint256 id, address basketToken) = factory.createBasket("TriStock", "TRI", tokens, weights);
        assertEq(id, 0);
        assertEq(BasketToken(basketToken).componentCount(), 3);
    }

    function test_createBasket_revertsWeightsMismatch() public {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](2);
        tokens[0] = address(tsla); weights[0] = 5000;
        tokens[1] = address(amzn); weights[1] = 3000; // does not sum to 10000

        vm.expectRevert("BasketToken: weights must sum to 10000");
        factory.createBasket("Bad", "BAD", tokens, weights);
    }

    function test_createBasket_revertsLengthMismatch() public {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](1);
        tokens[0] = address(tsla);
        tokens[1] = address(amzn);
        weights[0] = 10_000;

        vm.expectRevert("BasketToken: length mismatch");
        factory.createBasket("Bad", "BAD", tokens, weights);
    }

    function test_createBasket_revertsEmptyTokens() public {
        address[] memory tokens  = new address[](0);
        uint256[] memory weights = new uint256[](0);

        vm.expectRevert("BasketToken: 1-10 tokens");
        factory.createBasket("Empty", "EMPT", tokens, weights);
    }

    function test_createMultipleBaskets() public {
        address[] memory t2 = new address[](2);
        uint256[] memory w2 = new uint256[](2);
        t2[0] = address(tsla); w2[0] = 5000;
        t2[1] = address(amzn); w2[1] = 5000;

        factory.createBasket("Basket1", "B1", t2, w2);
        factory.createBasket("Basket2", "B2", t2, w2);

        assertEq(factory.basketCount(), 2);
    }

    // ─── mint ────────────────────────────────────────────────────────

    function _makeBasket50_50() internal returns (address) {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](2);
        tokens[0] = address(tsla); weights[0] = 5000;
        tokens[1] = address(amzn); weights[1] = 5000;
        (, address bt) = factory.createBasket("50/50", "HALF", tokens, weights);
        return bt;
    }

    function test_mint_correctTokenTransfer() public {
        address bt = _makeBasket50_50();
        uint256 mintAmount = 10e18; // 10 basket tokens

        vm.startPrank(user);
        tsla.approve(address(factory), type(uint256).max);
        amzn.approve(address(factory), type(uint256).max);
        factory.mint(bt, mintAmount);
        vm.stopPrank();

        // User should have 10 basket tokens
        assertEq(BasketToken(bt).balanceOf(user), 10e18);
        // Factory holds proportional stock tokens
        // 50% of 10e18 = 5e18 each
        assertEq(tsla.balanceOf(address(factory)), 5e18);
        assertEq(amzn.balanceOf(address(factory)), 5e18);
        // User lost those stock tokens
        assertEq(tsla.balanceOf(user), 95e18);
        assertEq(amzn.balanceOf(user), 95e18);
    }

    function test_mint_60_40_basket() public {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](2);
        tokens[0] = address(tsla); weights[0] = 6000;
        tokens[1] = address(amzn); weights[1] = 4000;
        (, address bt) = factory.createBasket("60/40", "SIXTY", tokens, weights);

        vm.startPrank(user);
        tsla.approve(address(factory), type(uint256).max);
        amzn.approve(address(factory), type(uint256).max);
        factory.mint(bt, 10e18);
        vm.stopPrank();

        // 60% of 10e18 = 6e18 TSLA, 40% of 10e18 = 4e18 AMZN
        assertEq(tsla.balanceOf(address(factory)), 6e18);
        assertEq(amzn.balanceOf(address(factory)), 4e18);
    }

    function test_mint_revertsUnknownBasket() public {
        vm.prank(user);
        vm.expectRevert("BasketFactory: unknown basket");
        factory.mint(address(0x1234), 1e18);
    }

    function test_mint_revertsZeroAmount() public {
        address bt = _makeBasket50_50();
        vm.prank(user);
        vm.expectRevert("BasketFactory: zero amount");
        factory.mint(bt, 0);
    }

    // ─── burn ────────────────────────────────────────────────────────

    function test_burn_returnsProportionalTokens() public {
        address bt = _makeBasket50_50();

        // Mint first
        vm.startPrank(user);
        tsla.approve(address(factory), type(uint256).max);
        amzn.approve(address(factory), type(uint256).max);
        factory.mint(bt, 10e18);

        // Burn all
        BasketToken(bt).approve(address(factory), type(uint256).max);
        factory.burn(bt, 10e18);
        vm.stopPrank();

        // User should have all stock tokens back (100e18 each)
        assertEq(tsla.balanceOf(user), 100e18);
        assertEq(amzn.balanceOf(user), 100e18);
        // No basket tokens remain
        assertEq(BasketToken(bt).balanceOf(user), 0);
        assertEq(BasketToken(bt).totalSupply(), 0);
    }

    function test_burn_partial() public {
        address bt = _makeBasket50_50();

        vm.startPrank(user);
        tsla.approve(address(factory), type(uint256).max);
        amzn.approve(address(factory), type(uint256).max);
        factory.mint(bt, 10e18);

        BasketToken(bt).approve(address(factory), type(uint256).max);
        factory.burn(bt, 4e18); // burn 4 of 10
        vm.stopPrank();

        // Should get back 2e18 TSLA + 2e18 AMZN (50% of 4)
        // 100 - 5 (minted) + 2 (burned back) = 97
        assertEq(tsla.balanceOf(user), 97e18);
        assertEq(amzn.balanceOf(user), 97e18);
        assertEq(BasketToken(bt).balanceOf(user), 6e18);
    }

    function test_burn_revertsZeroAmount() public {
        address bt = _makeBasket50_50();
        vm.prank(user);
        vm.expectRevert("BasketFactory: zero amount");
        factory.burn(bt, 0);
    }

    // ─── quoteMint / quoteBurn ────────────────────────────────────────

    function test_quoteMint_correctAmounts() public {
        address bt = _makeBasket50_50();
        (address[] memory tokens, uint256[] memory amounts) = factory.quoteMint(bt, 10e18);

        assertEq(tokens.length, 2);
        assertEq(amounts[0], 5e18); // 50% of 10
        assertEq(amounts[1], 5e18);
    }

    // ─── getBasketsByCreator ─────────────────────────────────────────

    function test_basketsByCreator_tracked() public {
        address[] memory tokens  = new address[](2);
        uint256[] memory weights = new uint256[](2);
        tokens[0] = address(tsla); weights[0] = 5000;
        tokens[1] = address(amzn); weights[1] = 5000;

        vm.startPrank(user);
        factory.createBasket("A", "A", tokens, weights);
        factory.createBasket("B", "B", tokens, weights);
        vm.stopPrank();

        vm.prank(user2);
        factory.createBasket("C", "C", tokens, weights);

        uint256[] memory userBaskets  = factory.getBasketsByCreator(user);
        uint256[] memory user2Baskets = factory.getBasketsByCreator(user2);

        assertEq(userBaskets.length,  2);
        assertEq(user2Baskets.length, 1);
        assertEq(userBaskets[0], 0);
        assertEq(userBaskets[1], 1);
        assertEq(user2Baskets[0], 2);
    }
}
