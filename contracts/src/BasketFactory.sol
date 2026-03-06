// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BasketToken.sol";
import "./interfaces/IAggregatorV3.sol";

/// @title BasketFactory
/// @notice Permissionless on-chain ETF factory for Robinhood Chain.
///
///         Users create custom stock baskets (e.g., 40% TSLA + 60% AMZN)
///         as ERC-20 tokens in a single transaction. To mint basket tokens,
///         the factory pulls the proportional stock tokens from the user and
///         issues basket tokens. Burns return underlying stock tokens pro-rata.
///
///         Key innovation vs TradFi ETFs:
///         - No SEC approval (permissionless)
///         - No minimum investment ($250K+ in TradFi)
///         - Instant creation and settlement
///         - Composable: basket tokens work with StopLossVault
contract BasketFactory {
    // ─── Constants ──────────────────────────────────────────────────

    /// @notice Creation fee in native token (covers gas estimation for deployers)
    uint256 public constant CREATION_FEE = 0; // Free for hackathon demo

    /// @notice Basket tokens are issued 1:1 per unit of underlying (1e18 base)
    uint256 public constant BASKET_UNIT = 1e18;

    address public owner;

    // ─── State ──────────────────────────────────────────────────────

    struct BasketInfo {
        address basketToken;
        address creator;
        string  name;
        string  symbol;
        uint256 createdAt;
    }

    BasketInfo[] public baskets;
    mapping(address => uint256[]) public basketsByCreator; // creator -> basket indices
    mapping(address => bool) public isBasketToken;         // basketToken -> exists
    mapping(address => address) public oracleFor;          // stockToken -> PriceOracle

    constructor() { owner = msg.sender; }

    modifier onlyOwner() {
        require(msg.sender == owner, "BasketFactory: only owner");
        _;
    }

    // ─── Events ─────────────────────────────────────────────────────
    event BasketCreated(
        uint256 indexed basketId,
        address indexed basketToken,
        address indexed creator,
        string name,
        string symbol,
        address[] tokens,
        uint256[] weights
    );
    event BasketMinted(
        address indexed basketToken,
        address indexed user,
        uint256 basketAmount,
        uint256[] tokenAmounts
    );
    event BasketBurned(
        address indexed basketToken,
        address indexed user,
        uint256 basketAmount,
        uint256[] tokenAmounts
    );

    // ─── Create ─────────────────────────────────────────────────────

    /// @notice Create a new basket token representing a custom stock portfolio.
    /// @param name        Human-readable name (e.g., "Kamal's Tech Basket")
    /// @param symbol      Ticker symbol (e.g., "KTECH")
    /// @param tokens      Array of stock token addresses (ERC-20)
    /// @param weights     Array of weights in basis points (must sum to 10_000)
    /// @return basketId   Index in the baskets array
    /// @return basketToken Address of the newly deployed BasketToken ERC-20
    function createBasket(
        string calldata name,
        string calldata symbol,
        address[] calldata tokens,
        uint256[] calldata weights
    ) external returns (uint256 basketId, address basketToken) {
        BasketToken basket = new BasketToken(name, symbol, tokens, weights);
        basketToken = address(basket);

        basketId = baskets.length;
        baskets.push(BasketInfo({
            basketToken: basketToken,
            creator:     msg.sender,
            name:        name,
            symbol:      symbol,
            createdAt:   block.timestamp
        }));

        basketsByCreator[msg.sender].push(basketId);
        isBasketToken[basketToken] = true;

        emit BasketCreated(basketId, basketToken, msg.sender, name, symbol, tokens, weights);
    }

    // ─── Mint ───────────────────────────────────────────────────────

    /// @notice Mint basket tokens by depositing underlying stock tokens.
    ///
    ///         To mint `basketAmount` basket tokens, the factory pulls from the
    ///         user the proportional quantity of each stock token based on weights.
    ///
    ///         Token amounts per basket unit:
    ///           tokenAmount[i] = basketAmount * weight[i] / 10_000
    ///
    ///         (All stock tokens have 18 decimals, so this scales correctly.)
    ///
    /// @param basketToken  Address of the BasketToken to mint
    /// @param basketAmount Number of basket tokens to mint (18 decimals)
    function mint(address basketToken, uint256 basketAmount) external {
        require(isBasketToken[basketToken], "BasketFactory: unknown basket");
        require(basketAmount > 0, "BasketFactory: zero amount");

        (address[] memory tokens, uint256[] memory weights) =
            BasketToken(basketToken).composition();

        uint256 n = tokens.length;
        uint256[] memory amounts = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            // proportional amount of each stock token required
            amounts[i] = (basketAmount * weights[i]) / 10_000;
            require(amounts[i] > 0, "BasketFactory: dust amount");
            _transferFrom(tokens[i], msg.sender, address(this), amounts[i]);
        }

        BasketToken(basketToken).mint(msg.sender, basketAmount);
        emit BasketMinted(basketToken, msg.sender, basketAmount, amounts);
    }

    // ─── Burn ───────────────────────────────────────────────────────

    /// @notice Burn basket tokens and receive underlying stock tokens.
    ///
    ///         Inverse of mint. Returns proportional stock tokens to the caller.
    ///
    /// @param basketToken  Address of the BasketToken to burn
    /// @param basketAmount Number of basket tokens to burn (18 decimals)
    function burn(address basketToken, uint256 basketAmount) external {
        require(isBasketToken[basketToken], "BasketFactory: unknown basket");
        require(basketAmount > 0, "BasketFactory: zero amount");

        (address[] memory tokens, uint256[] memory weights) =
            BasketToken(basketToken).composition();

        uint256 n = tokens.length;
        uint256[] memory amounts = new uint256[](n);

        // Pull basket tokens from user first
        _transferFrom(basketToken, msg.sender, address(this), basketAmount);
        BasketToken(basketToken).burn(address(this), basketAmount);

        // Return proportional stock tokens
        for (uint256 i = 0; i < n; i++) {
            amounts[i] = (basketAmount * weights[i]) / 10_000;
            if (amounts[i] > 0) {
                _transfer(tokens[i], msg.sender, amounts[i]);
            }
        }

        emit BasketBurned(basketToken, msg.sender, basketAmount, amounts);
    }

    // ─── View ────────────────────────────────────────────────────────

    /// @notice Total number of baskets created
    function basketCount() external view returns (uint256) {
        return baskets.length;
    }

    /// @notice Returns all baskets created by a specific address
    function getBasketsByCreator(address creator) external view returns (uint256[] memory) {
        return basketsByCreator[creator];
    }

    /// @notice How many of each stock token is needed to mint `basketAmount`
    function quoteMint(address basketToken, uint256 basketAmount)
        external view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        require(isBasketToken[basketToken], "BasketFactory: unknown basket");
        uint256[] memory weights;
        (tokens, weights) = BasketToken(basketToken).composition();
        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            amounts[i] = (basketAmount * weights[i]) / 10_000;
        }
    }

    /// @notice How many stock tokens are returned when burning `basketAmount`
    function quoteBurn(address basketToken, uint256 basketAmount)
        external view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        return this.quoteMint(basketToken, basketAmount); // symmetric
    }

    // ─── Oracle Integration ─────────────────────────────────────────

    /// @notice Register a PriceOracle for a stock token (owner only)
    function setOracle(address stockToken, address oracle) external onlyOwner {
        require(stockToken != address(0) && oracle != address(0), "BasketFactory: zero address");
        oracleFor[stockToken] = oracle;
    }

    /// @notice Compute the weighted price of a basket token from underlying oracles.
    ///         Returns price in 8 decimals (Chainlink standard).
    ///         basketPrice = sum(weight[i] * oraclePrice[i]) / 10_000
    function getBasketPrice(address basketToken) external view returns (int256 price) {
        require(isBasketToken[basketToken], "BasketFactory: unknown basket");
        (address[] memory tokens, uint256[] memory weights) =
            BasketToken(basketToken).composition();

        int256 weightedSum = 0;
        for (uint256 i = 0; i < tokens.length; i++) {
            address oracle = oracleFor[tokens[i]];
            require(oracle != address(0), "BasketFactory: no oracle for token");
            (, int256 tokenPrice, , uint256 updatedAt,) = IAggregatorV3(oracle).latestRoundData();
            require(tokenPrice > 0, "BasketFactory: invalid oracle price");
            require(block.timestamp - updatedAt <= 3600, "BasketFactory: stale oracle");
            weightedSum += tokenPrice * int256(weights[i]);
        }
        price = weightedSum / 10_000;
    }

    // ─── Internal ────────────────────────────────────────────────────

    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "BasketFactory: transferFrom failed");
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "BasketFactory: transfer failed");
    }
}
