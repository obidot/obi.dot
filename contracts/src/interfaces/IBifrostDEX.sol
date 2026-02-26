// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IBifrostDEX — Bifrost Decentralized Exchange Interface
/// @notice Interface for Bifrost's built-in DEX functionality.
///         Supports token swaps with configurable slippage protection
///         and multi-hop routing through liquidity pools.
/// @dev Bifrost DEX uses an AMM model. On Polkadot Hub, swaps are executed
///      via XCM to the Bifrost parachain (2030). Supports both exact-input
///      and exact-output swap modes.
interface IBifrostDEX {
    // ──────────────────────────────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Parameters for a single swap operation.
    struct SwapParams {
        /// Currency ID of the input token.
        uint32 currencyIn;
        /// Currency ID of the output token.
        uint32 currencyOut;
        /// Amount of input tokens to swap (for exact-input mode).
        uint256 amountIn;
        /// Minimum output tokens expected (slippage protection).
        uint256 amountOutMin;
        /// Deadline timestamp for the swap.
        uint256 deadline;
    }

    /// @notice Parameters for a multi-hop swap through a specific path.
    struct SwapPathParams {
        /// Ordered array of currency IDs forming the swap path.
        uint32[] path;
        /// Amount of first token to swap.
        uint256 amountIn;
        /// Minimum final output tokens.
        uint256 amountOutMin;
        /// Deadline timestamp.
        uint256 deadline;
    }

    /// @notice Information about a liquidity pool.
    struct PoolInfo {
        /// Currency ID of the first token in the pair.
        uint32 currencyA;
        /// Currency ID of the second token in the pair.
        uint32 currencyB;
        /// Reserve of the first token.
        uint256 reserveA;
        /// Reserve of the second token.
        uint256 reserveB;
        /// Total LP token supply.
        uint256 totalLpSupply;
        /// Trading fee in basis points.
        uint256 feeBps;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a swap is executed.
    event Swapped(
        address indexed user, uint32 indexed currencyIn, uint32 indexed currencyOut, uint256 amountIn, uint256 amountOut
    );

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Execute a token swap with exact input amount.
    /// @param params The swap parameters.
    /// @return amountOut The actual output amount received.
    function swapExactIn(SwapParams calldata params) external returns (uint256 amountOut);

    /// @notice Execute a multi-hop swap through a specified path.
    /// @param params The swap path parameters.
    /// @return amountOut The actual final output amount.
    function swapExactInWithPath(SwapPathParams calldata params) external returns (uint256 amountOut);

    /// @notice Get an output quote for a given input amount (without executing).
    /// @param currencyIn The input currency ID.
    /// @param currencyOut The output currency ID.
    /// @param amountIn The input amount.
    /// @return amountOut The estimated output amount.
    function getAmountOut(uint32 currencyIn, uint32 currencyOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);

    /// @notice Get pool information for a trading pair.
    /// @param currencyA First currency ID.
    /// @param currencyB Second currency ID.
    /// @return pool The pool information struct.
    function getPool(uint32 currencyA, uint32 currencyB) external view returns (PoolInfo memory pool);
}
