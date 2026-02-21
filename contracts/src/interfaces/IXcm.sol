// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IXcm — Interface for the Polkadot Hub XCM Precompile
/// @notice Located at 0x00000000000000000000000000000000000A0000 on Polkadot Hub EVM (REVM).
///         Provides low-level access to cross-chain message dispatch and weight estimation
///         via the native XCM transport layer.
/// @dev All payloads (`dest`, `message`) MUST be SCALE-encoded Versioned types:
///      - `dest`    → VersionedLocation  (e.g. V4 { parents, interior })
///      - `message` → VersionedXcm       (e.g. V4 [Instruction...])
///      Weight values are expressed in Polkadot's two-dimensional Weight model:
///      - `refTime`   → picoseconds of execution time consumed
///      - `proofSize` → bytes of PoV (Proof-of-Validity) consumed
interface IXcm {
    // ──────────────────────────────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────────────────────────────

    /// @dev Emitted by the precompile when the destination location is malformed.
    error InvalidDestination();

    /// @dev Emitted by the precompile when the XCM message payload is malformed.
    error InvalidMessage();

    /// @dev Emitted by the precompile when the XCM message exceeds the weight limit.
    error Overweight();

    /// @dev Emitted by the precompile when the XCM send fails at the transport layer.
    error SendFailure();

    // ──────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emitted after a successful XCM dispatch.
    /// @param sender  The EVM address that invoked `send`.
    /// @param dest    The SCALE-encoded destination VersionedLocation.
    /// @param message The SCALE-encoded VersionedXcm payload that was dispatched.
    event XcmSent(address indexed sender, bytes dest, bytes message);

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Dispatch an XCM message to a remote consensus system (parachain / relay).
    /// @dev Requires the caller to have sufficient balance for any execution fees
    ///      or reserve-based transfers encoded within the XCM instructions.
    ///      Reverts with `InvalidDestination`, `InvalidMessage`, or `SendFailure`
    ///      if the precompile cannot route the message.
    /// @param dest    SCALE-encoded VersionedLocation of the destination.
    /// @param message SCALE-encoded VersionedXcm containing the instructions to execute
    ///                on the remote chain.
    function send(bytes calldata dest, bytes calldata message) external;

    /// @notice Estimate the execution weight of an XCM message without dispatching it.
    /// @dev Useful for pre-flight checks: callers should compare the returned weight
    ///      against on-chain limits and add a safety margin before calling `send`.
    ///      Reverts with `InvalidMessage` if the payload cannot be decoded.
    /// @param message SCALE-encoded VersionedXcm to estimate.
    /// @return refTime   Estimated execution time in picoseconds.
    /// @return proofSize Estimated proof-of-validity size in bytes.
    function weighMessage(
        bytes calldata message
    ) external view returns (uint64 refTime, uint64 proofSize);
}
