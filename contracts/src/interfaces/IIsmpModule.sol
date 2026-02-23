// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IIsmpModule — Hyperbridge ISMP Module Callback Interface
/// @notice Interface that contracts must implement to receive cross-chain messages
///         via Hyperbridge's ISMP protocol. The ISMP host calls these functions
///         when a cross-chain message arrives or times out.
/// @dev Only the ISMP host contract should call these methods. Implementations
///      must verify `msg.sender` is the authorized ISMP host address.
interface IIsmpModule {
    // ──────────────────────────────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────────────────────────────

    /// @notice A cross-chain POST request received from a remote chain.
    struct PostRequest {
        /// The source state machine identifier.
        bytes source;
        /// The destination state machine identifier.
        bytes dest;
        /// The request nonce.
        uint64 nonce;
        /// The sending module on the source chain.
        bytes from;
        /// The receiving module on the destination chain.
        bytes to;
        /// Timeout timestamp.
        uint64 timeoutTimestamp;
        /// The message body.
        bytes body;
    }

    /// @notice Wrapper for an incoming POST request with relayer metadata.
    struct IncomingPostRequest {
        /// The POST request itself.
        PostRequest request;
        /// The relayer address that delivered this message.
        address relayer;
    }

    /// @notice A POST response to a previously dispatched POST request.
    struct PostResponse {
        /// The original POST request.
        PostRequest post;
        /// The response body from the destination.
        bytes response;
        /// Timeout timestamp for the response.
        uint64 timeoutTimestamp;
    }

    /// @notice Wrapper for an incoming POST response.
    struct IncomingPostResponse {
        /// The POST response.
        PostResponse response;
        /// The relayer address.
        address relayer;
    }

    /// @notice A GET request for cross-chain state proofs.
    struct GetRequest {
        /// The source state machine.
        bytes source;
        /// The destination state machine.
        bytes dest;
        /// The request nonce.
        uint64 nonce;
        /// Sender module on source chain.
        bytes from;
        /// Storage keys to query.
        bytes[] keys;
        /// Block height for the query.
        uint64 height;
        /// Timeout timestamp.
        uint64 timeoutTimestamp;
        /// Execution context.
        bytes context;
    }

    /// @notice Storage value returned from a GET request.
    struct StorageValue {
        /// The storage key.
        bytes key;
        /// The storage value.
        bytes value;
    }

    /// @notice Wrapper for an incoming GET response.
    struct IncomingGetResponse {
        /// The original GET request.
        GetRequest request;
        /// The storage values returned.
        StorageValue[] values;
        /// The relayer address.
        address relayer;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Callbacks
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Called when a POST request is received from a remote chain.
    /// @dev MUST verify msg.sender is the ISMP host. Process the message body
    ///      according to the application protocol.
    /// @param incoming The incoming POST request with relayer metadata.
    function onAccept(IncomingPostRequest calldata incoming) external;

    /// @notice Called when a dispatched POST request times out without delivery.
    /// @dev Implement rollback logic (e.g., refund locked assets).
    /// @param request The timed-out POST request.
    function onPostRequestTimeout(PostRequest calldata request) external;

    /// @notice Called when a POST response is received.
    /// @param incoming The incoming POST response.
    function onPostResponse(IncomingPostResponse calldata incoming) external;

    /// @notice Called when a POST response times out.
    /// @param response The timed-out POST response.
    function onPostResponseTimeout(PostResponse calldata response) external;

    /// @notice Called when a GET response (state proof result) is received.
    /// @param incoming The GET response with storage values.
    function onGetResponse(IncomingGetResponse calldata incoming) external;

    /// @notice Called when a GET request times out.
    /// @param request The timed-out GET request.
    function onGetTimeout(GetRequest calldata request) external;
}
