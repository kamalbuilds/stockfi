// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BasketToken
/// @notice ERC-20 token backed by a fixed composition of stock tokens.
///         Each basket token represents fractional ownership of an on-chain
///         stock portfolio. Only the factory that created it can mint/burn.
contract BasketToken {
    // ─── ERC-20 Metadata ────────────────────────────────────────────
    string public name;
    string public symbol;
    uint8  public constant decimals = 18;

    // ─── State ──────────────────────────────────────────────────────
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Factory that controls mint/burn
    address public immutable factory;

    /// @notice Basket composition (read-only after creation)
    address[] private _tokens;
    uint256[] private _weights; // BPS (basis points, sum = 10_000)

    // ─── Events ─────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ─── Constructor ────────────────────────────────────────────────
    constructor(
        string memory _name,
        string memory _symbol,
        address[] memory tokens,
        uint256[] memory weights
    ) {
        require(tokens.length > 0 && tokens.length <= 10, "BasketToken: 1-10 tokens");
        require(tokens.length == weights.length, "BasketToken: length mismatch");

        uint256 totalWeight;
        for (uint256 i = 0; i < weights.length; i++) {
            require(tokens[i] != address(0), "BasketToken: zero token");
            require(weights[i] > 0, "BasketToken: zero weight");
            totalWeight += weights[i];
        }
        require(totalWeight == 10_000, "BasketToken: weights must sum to 10000");

        name    = _name;
        symbol  = _symbol;
        factory = msg.sender;
        _tokens  = tokens;
        _weights = weights;
    }

    // ─── Factory-only ────────────────────────────────────────────────
    modifier onlyFactory() {
        require(msg.sender == factory, "BasketToken: only factory");
        _;
    }

    function mint(address to, uint256 amount) external onlyFactory {
        totalSupply      += amount;
        balanceOf[to]    += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyFactory {
        require(balanceOf[from] >= amount, "BasketToken: burn exceeds balance");
        balanceOf[from]  -= amount;
        totalSupply      -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ─── ERC-20 ──────────────────────────────────────────────────────
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "BasketToken: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "BasketToken: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
    }

    // ─── View ────────────────────────────────────────────────────────

    /// @notice Returns the composition of this basket
    function composition() external view returns (address[] memory tokens, uint256[] memory weights) {
        return (_tokens, _weights);
    }

    /// @notice Returns the number of constituent tokens
    function componentCount() external view returns (uint256) {
        return _tokens.length;
    }

    /// @notice Returns a specific component
    function componentAt(uint256 index) external view returns (address token, uint256 weight) {
        require(index < _tokens.length, "BasketToken: out of range");
        return (_tokens[index], _weights[index]);
    }
}
