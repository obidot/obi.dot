// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IIsmpHost — Hyperbridge ISMP Host Interface
/// @notice Interface for the ISMP host contract deployed on each chain that Hyperbridge connects.
///         Used to dispatch cross-chain messages (PostRequests) and query chain state.
/// @dev The host address varies per chain. On Polkadot Hub it is a precompile;
///      on EVM chains it is a deployed contract provided by Hyperbridge.
interface IIsmpHost {
    // ──────────────────────────────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Parameters for dispatching a POST request to a remote chain.
    struct DispatchPost {
        /// The destination state machine identifier (e.g. "POLKADOT-HUB", "ETHEREUM", "ARBITRUM").
        bytes dest;
        /// The receiving module address/identifier on the destination chain.
        bytes to;
        /// The message body to deliver.
        bytes body;
        /// Timeout timestamp (seconds since epoch). 0 = no timeout.
        uint64 timeout;
        /// Gas limit for execution on the destination chain.
        uint256 gaslimit;
    }

    /// @notice Parameters for dispatching a GET request (state proof query).
    struct DispatchGet {
        /// The destination state machine to query.
        bytes dest;
        /// The block height at which to query state.
        uint64 height;
        /// Storage keys to query.
        bytes[] keys;
        /// Timeout timestamp.
        uint64 timeout;
        /// Execution context identifier.
        bytes context;
        /// Gas limit for callback.
        uint256 gaslimit;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Dispatch a POST request to a remote chain via Hyperbridge.
    /// @param post The dispatch parameters including destination, recipient, body, and timeout.
    /// @return commitment The unique commitment hash identifying this request.
    function dispatch(DispatchPost memory post) external payable returns (bytes32 commitment);

    /// @notice Dispatch a GET request (state proof query) to a remote chain.
    /// @param get The dispatch parameters including destination, height, keys, and timeout.
    /// @return commitment The unique commitment hash identifying this request.
    function dispatch(DispatchGet memory get) external payable returns (bytes32 commitment);

    /// @notice Returns the identifier of this state machine (e.g. "ETHEREUM", "POLKADOT-HUB").
    /// @return The state machine identifier as bytes.
    function host() external view returns (bytes memory);

    /// @notice Returns the current timestamp on this host.
    /// @return The current timestamp.
    function timestamp() external view returns (uint256);

    /// @notice Returns the nonce for outgoing requests from this host.
    /// @return The current nonce.
    function nonce() external view returns (uint256);

    /// @notice Estimate the fee for dispatching a cross-chain message.
    /// @param post The dispatch parameters to estimate fees for.
    /// @return fee The estimated fee in native tokens.
    function dispatchFee(DispatchPost memory post) external view returns (uint256 fee);
}
