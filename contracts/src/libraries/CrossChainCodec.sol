// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CrossChainCodec — Encoding/Decoding for Hyperbridge ISMP Messages
/// @notice Library for encoding and decoding cross-chain messages sent between
///         ObidotVault hub and satellite vaults via Hyperbridge's ISMP protocol.
/// @dev All messages follow a type-length-value (TLV) pattern:
///      [messageType (1 byte)] [payload (variable)]
///      Each message type has a well-defined encoding for deterministic parsing.
library CrossChainCodec {
    // ─────────────────────────────────────────────────────────────────────
    //  Message Types
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Satellite → Hub: Notify hub of new deposits.
    uint8 internal constant MSG_DEPOSIT_SYNC = 0x01;

    /// @dev Satellite → Hub: Request withdrawal of assets.
    uint8 internal constant MSG_WITHDRAW_REQUEST = 0x02;

    /// @dev Hub → Satellite: Broadcast updated totalAssets and share price.
    uint8 internal constant MSG_ASSET_SYNC = 0x03;

    /// @dev Hub → Satellite: Report strategy execution outcome.
    uint8 internal constant MSG_STRATEGY_REPORT = 0x04;

    /// @dev Hub → Satellite: Propagate emergency/pause state.
    uint8 internal constant MSG_EMERGENCY_SYNC = 0x05;

    /// @dev Hub → Satellite: Acknowledge deposit received.
    uint8 internal constant MSG_DEPOSIT_ACK = 0x06;

    /// @dev Hub → Satellite: Fulfill a withdrawal request.
    uint8 internal constant MSG_WITHDRAW_FULFILL = 0x07;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev The message body is too short to decode.
    error MessageTooShort(uint256 length, uint256 minLength);

    /// @dev Unknown message type byte.
    error UnknownMessageType(uint8 messageType);

    // ─────────────────────────────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Deposit sync message: satellite informs hub of new deposits.
    struct DepositSyncMessage {
        /// The chain identifier of the satellite (e.g., "ETHEREUM").
        bytes chainId;
        /// The depositor address on the satellite chain.
        address depositor;
        /// The amount of underlying assets deposited.
        uint256 amount;
        /// Shares minted on the satellite vault.
        uint256 sharesMinted;
        /// Nonce for this message (replay protection).
        uint256 nonce;
    }

    /// @notice Withdrawal request message: satellite requests assets from hub.
    struct WithdrawRequestMessage {
        /// The chain identifier of the satellite.
        bytes chainId;
        /// The withdrawer address on the satellite chain.
        address withdrawer;
        /// The amount of underlying assets requested.
        uint256 amount;
        /// Shares to burn on the satellite vault.
        uint256 sharesToBurn;
        /// Nonce for this message.
        uint256 nonce;
    }

    /// @notice Asset sync message: hub broadcasts state to satellites.
    struct AssetSyncMessage {
        /// Total assets across all vaults (hub + all satellites).
        uint256 globalTotalAssets;
        /// Total shares supply across all vaults.
        uint256 globalTotalShares;
        /// Total remote assets deployed to DeFi protocols.
        uint256 totalRemoteAssets;
        /// Timestamp of this sync.
        uint256 timestamp;
    }

    /// @notice Strategy report message: hub reports DeFi strategy outcome.
    struct StrategyReportMessage {
        /// The strategy ID.
        uint256 strategyId;
        /// Whether the strategy succeeded.
        bool success;
        /// Amount returned from the strategy.
        uint256 returnedAmount;
        /// Profit/loss (signed).
        int256 pnl;
        /// Updated total remote assets after this report.
        uint256 newTotalRemoteAssets;
    }

    /// @notice Emergency sync message: hub propagates emergency state.
    struct EmergencySyncMessage {
        /// Whether the vault should be paused.
        bool paused;
        /// Whether emergency withdrawal mode is enabled.
        bool emergencyMode;
        /// Reason for the emergency action.
        bytes reason;
    }

    /// @notice Deposit acknowledgment: hub confirms receipt.
    struct DepositAckMessage {
        /// The original deposit nonce being acknowledged.
        uint256 depositNonce;
        /// Updated global total assets after deposit.
        uint256 globalTotalAssets;
        /// Whether the deposit was accepted.
        bool accepted;
    }

    /// @notice Withdrawal fulfillment: hub sends assets to satellite.
    struct WithdrawFulfillMessage {
        /// The original withdrawal nonce.
        uint256 withdrawNonce;
        /// Amount of assets being sent.
        uint256 amount;
        /// Whether the withdrawal was fully fulfilled.
        bool fullyFulfilled;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Encoders
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode a deposit sync message.
    function encodeDepositSync(
        DepositSyncMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_DEPOSIT_SYNC,
                abi.encode(
                    msg_.chainId,
                    msg_.depositor,
                    msg_.amount,
                    msg_.sharesMinted,
                    msg_.nonce
                )
            );
    }

    /// @notice Encode a withdrawal request message.
    function encodeWithdrawRequest(
        WithdrawRequestMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_WITHDRAW_REQUEST,
                abi.encode(
                    msg_.chainId,
                    msg_.withdrawer,
                    msg_.amount,
                    msg_.sharesToBurn,
                    msg_.nonce
                )
            );
    }

    /// @notice Encode an asset sync message.
    function encodeAssetSync(
        AssetSyncMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_ASSET_SYNC,
                abi.encode(
                    msg_.globalTotalAssets,
                    msg_.globalTotalShares,
                    msg_.totalRemoteAssets,
                    msg_.timestamp
                )
            );
    }

    /// @notice Encode a strategy report message.
    function encodeStrategyReport(
        StrategyReportMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_STRATEGY_REPORT,
                abi.encode(
                    msg_.strategyId,
                    msg_.success,
                    msg_.returnedAmount,
                    msg_.pnl,
                    msg_.newTotalRemoteAssets
                )
            );
    }

    /// @notice Encode an emergency sync message.
    function encodeEmergencySync(
        EmergencySyncMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_EMERGENCY_SYNC,
                abi.encode(msg_.paused, msg_.emergencyMode, msg_.reason)
            );
    }

    /// @notice Encode a deposit acknowledgment message.
    function encodeDepositAck(
        DepositAckMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_DEPOSIT_ACK,
                abi.encode(
                    msg_.depositNonce,
                    msg_.globalTotalAssets,
                    msg_.accepted
                )
            );
    }

    /// @notice Encode a withdrawal fulfillment message.
    function encodeWithdrawFulfill(
        WithdrawFulfillMessage memory msg_
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                MSG_WITHDRAW_FULFILL,
                abi.encode(msg_.withdrawNonce, msg_.amount, msg_.fullyFulfilled)
            );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Decoders
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Extract the message type from a raw message body.
    function messageType(bytes calldata body) internal pure returns (uint8) {
        if (body.length < 1) revert MessageTooShort(body.length, 1);
        return uint8(body[0]);
    }

    /// @notice Decode a deposit sync message.
    function decodeDepositSync(
        bytes calldata body
    ) internal pure returns (DepositSyncMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (
            msg_.chainId,
            msg_.depositor,
            msg_.amount,
            msg_.sharesMinted,
            msg_.nonce
        ) = abi.decode(body[1:], (bytes, address, uint256, uint256, uint256));
    }

    /// @notice Decode a withdrawal request message.
    function decodeWithdrawRequest(
        bytes calldata body
    ) internal pure returns (WithdrawRequestMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (
            msg_.chainId,
            msg_.withdrawer,
            msg_.amount,
            msg_.sharesToBurn,
            msg_.nonce
        ) = abi.decode(body[1:], (bytes, address, uint256, uint256, uint256));
    }

    /// @notice Decode an asset sync message.
    function decodeAssetSync(
        bytes calldata body
    ) internal pure returns (AssetSyncMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (
            msg_.globalTotalAssets,
            msg_.globalTotalShares,
            msg_.totalRemoteAssets,
            msg_.timestamp
        ) = abi.decode(body[1:], (uint256, uint256, uint256, uint256));
    }

    /// @notice Decode a strategy report message.
    function decodeStrategyReport(
        bytes calldata body
    ) internal pure returns (StrategyReportMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (
            msg_.strategyId,
            msg_.success,
            msg_.returnedAmount,
            msg_.pnl,
            msg_.newTotalRemoteAssets
        ) = abi.decode(body[1:], (uint256, bool, uint256, int256, uint256));
    }

    /// @notice Decode an emergency sync message.
    function decodeEmergencySync(
        bytes calldata body
    ) internal pure returns (EmergencySyncMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (msg_.paused, msg_.emergencyMode, msg_.reason) = abi.decode(
            body[1:],
            (bool, bool, bytes)
        );
    }

    /// @notice Decode a deposit acknowledgment message.
    function decodeDepositAck(
        bytes calldata body
    ) internal pure returns (DepositAckMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (msg_.depositNonce, msg_.globalTotalAssets, msg_.accepted) = abi.decode(
            body[1:],
            (uint256, uint256, bool)
        );
    }

    /// @notice Decode a withdrawal fulfillment message.
    function decodeWithdrawFulfill(
        bytes calldata body
    ) internal pure returns (WithdrawFulfillMessage memory msg_) {
        if (body.length < 33) revert MessageTooShort(body.length, 33);
        (msg_.withdrawNonce, msg_.amount, msg_.fullyFulfilled) = abi.decode(
            body[1:],
            (uint256, uint256, bool)
        );
    }
}
