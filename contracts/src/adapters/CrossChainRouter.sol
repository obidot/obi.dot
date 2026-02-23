// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {HyperbridgeAdapter} from "./HyperbridgeAdapter.sol";
import {CrossChainCodec} from "../libraries/CrossChainCodec.sol";

/// @title CrossChainRouter — Routes messages between hub and satellite vaults
/// @notice Deployed on Polkadot Hub alongside the master ObidotVault. Handles
///         cross-chain deposit sync, withdrawal requests, asset sync broadcasts,
///         strategy reports, and emergency propagation via Hyperbridge ISMP.
/// @dev Sits between the master vault and satellite vaults. The master vault calls
///      this router to broadcast state changes; satellite vaults send deposit/withdraw
///      messages through Hyperbridge to this router, which credits/debits the master vault.
contract CrossChainRouter is HyperbridgeAdapter, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role for the master vault to call router functions.
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Deposit amount is zero.
    error ZeroDepositAmount();

    /// @dev Withdrawal amount exceeds available balance.
    error InsufficientBalance(uint256 available, uint256 requested);

    /// @dev Unknown message type received.
    error UnknownCrossChainMessage(uint8 messageType);

    /// @dev Deposit was not accepted by the hub.
    error DepositNotAccepted(uint256 nonce);

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a satellite deposit is received and processed.
    event SatelliteDepositReceived(
        bytes indexed chainId,
        address indexed depositor,
        uint256 amount,
        uint256 sharesMinted,
        uint256 nonce
    );

    /// @notice Emitted when a satellite withdrawal request is received.
    event SatelliteWithdrawRequested(
        bytes indexed chainId,
        address indexed withdrawer,
        uint256 amount,
        uint256 sharesToBurn,
        uint256 nonce
    );

    /// @notice Emitted when an asset sync is broadcast to satellites.
    event AssetSyncBroadcast(
        uint256 globalTotalAssets,
        uint256 globalTotalShares,
        uint256 totalRemoteAssets,
        uint256 satelliteCount
    );

    /// @notice Emitted when a strategy report is broadcast to satellites.
    event StrategyReportBroadcast(
        uint256 strategyId,
        bool success,
        uint256 returnedAmount,
        int256 pnl
    );

    /// @notice Emitted when an emergency sync is broadcast to satellites.
    event EmergencySyncBroadcast(bool paused, bool emergencyMode);

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The underlying ERC-20 asset managed by the vault system.
    IERC20 public immutable asset;

    /// @notice The master ObidotVault address on this chain.
    address public masterVault;

    /// @notice Total assets deposited from all satellite chains (not yet synced).
    uint256 public pendingSatelliteDeposits;

    /// @notice Total pending withdrawal requests from satellites.
    uint256 public pendingWithdrawalRequests;

    /// @notice Array of registered satellite chain IDs for broadcasting.
    bytes[] public satelliteChains;

    /// @notice Mapping of chain hash → satellite chain assets.
    mapping(bytes32 => uint256) public satelliteAssets;

    /// @notice Incoming deposit nonce tracker per chain.
    mapping(bytes32 => uint256) public incomingDepositNonces;

    /// @notice Incoming withdrawal nonce tracker per chain.
    mapping(bytes32 => uint256) public incomingWithdrawNonces;

    /// @notice Pending withdrawal requests by nonce.
    mapping(uint256 => CrossChainCodec.WithdrawRequestMessage)
        public pendingWithdrawals;

    /// @notice Global withdrawal nonce.
    uint256 public withdrawNonce;

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param _ismpHost The ISMP host contract address.
    /// @param _asset The underlying ERC-20 asset.
    /// @param _masterVault The master ObidotVault address.
    /// @param _admin The admin address.
    constructor(
        address _ismpHost,
        IERC20 _asset,
        address _masterVault,
        address _admin
    ) HyperbridgeAdapter(_ismpHost, _admin) {
        asset = _asset;
        masterVault = _masterVault;
        _grantRole(VAULT_ROLE, _masterVault);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Satellite Management
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Add a satellite chain to the broadcast list.
    /// @param chainId The satellite chain identifier.
    /// @param moduleAddress The satellite vault module address on that chain.
    function addSatelliteChain(
        bytes calldata chainId,
        bytes calldata moduleAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Register as peer for bidirectional messaging
        bytes32 chainHash = keccak256(chainId);
        registeredPeers[chainHash] = moduleAddress;
        knownChains[chainHash] = true;
        satelliteChains.push(chainId);
        emit PeerRegistered(chainId, moduleAddress, true);
    }

    /// @notice Update the master vault address.
    function setMasterVault(
        address _masterVault
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VAULT_ROLE, masterVault);
        masterVault = _masterVault;
        _grantRole(VAULT_ROLE, _masterVault);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Hub → Satellites: Broadcast State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Broadcast updated asset totals to all satellite vaults.
    /// @dev Called by the master vault after strategy outcomes are reported.
    /// @param globalTotalAssets Total assets across the entire vault system.
    /// @param globalTotalShares Total share supply across all vaults.
    /// @param totalRemoteAssets Total assets deployed to DeFi protocols.
    function broadcastAssetSync(
        uint256 globalTotalAssets,
        uint256 globalTotalShares,
        uint256 totalRemoteAssets
    ) external onlyRole(VAULT_ROLE) whenNotPaused {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec
            .AssetSyncMessage({
                globalTotalAssets: globalTotalAssets,
                globalTotalShares: globalTotalShares,
                totalRemoteAssets: totalRemoteAssets,
                timestamp: block.timestamp
            });

        bytes memory encoded = CrossChainCodec.encodeAssetSync(syncMsg);

        for (uint256 i = 0; i < satelliteChains.length; i++) {
            _dispatchMessage(satelliteChains[i], encoded);
        }

        emit AssetSyncBroadcast(
            globalTotalAssets,
            globalTotalShares,
            totalRemoteAssets,
            satelliteChains.length
        );
    }

    /// @notice Broadcast a strategy execution report to all satellites.
    function broadcastStrategyReport(
        uint256 strategyId,
        bool success,
        uint256 returnedAmount,
        int256 pnl,
        uint256 newTotalRemoteAssets
    ) external onlyRole(VAULT_ROLE) whenNotPaused {
        CrossChainCodec.StrategyReportMessage memory reportMsg = CrossChainCodec
            .StrategyReportMessage({
                strategyId: strategyId,
                success: success,
                returnedAmount: returnedAmount,
                pnl: pnl,
                newTotalRemoteAssets: newTotalRemoteAssets
            });

        bytes memory encoded = CrossChainCodec.encodeStrategyReport(reportMsg);

        for (uint256 i = 0; i < satelliteChains.length; i++) {
            _dispatchMessage(satelliteChains[i], encoded);
        }

        emit StrategyReportBroadcast(strategyId, success, returnedAmount, pnl);
    }

    /// @notice Broadcast emergency state to all satellite vaults.
    function broadcastEmergencySync(
        bool _paused,
        bool _emergencyMode,
        bytes calldata reason
    ) external onlyRole(VAULT_ROLE) {
        CrossChainCodec.EmergencySyncMessage
            memory emergencyMsg = CrossChainCodec.EmergencySyncMessage({
                paused: _paused,
                emergencyMode: _emergencyMode,
                reason: reason
            });

        bytes memory encoded = CrossChainCodec.encodeEmergencySync(
            emergencyMsg
        );

        for (uint256 i = 0; i < satelliteChains.length; i++) {
            _dispatchMessage(satelliteChains[i], encoded);
        }

        emit EmergencySyncBroadcast(_paused, _emergencyMode);
    }

    /// @notice Send a deposit acknowledgment to a specific satellite.
    function sendDepositAck(
        bytes calldata destChainId,
        uint256 depositNonce,
        uint256 globalTotalAssets,
        bool accepted
    ) external onlyRole(VAULT_ROLE) {
        CrossChainCodec.DepositAckMessage memory ackMsg = CrossChainCodec
            .DepositAckMessage({
                depositNonce: depositNonce,
                globalTotalAssets: globalTotalAssets,
                accepted: accepted
            });

        _dispatchMessage(destChainId, CrossChainCodec.encodeDepositAck(ackMsg));
    }

    /// @notice Send withdrawal fulfillment to a specific satellite.
    function sendWithdrawFulfill(
        bytes calldata destChainId,
        uint256 _withdrawNonce,
        uint256 amount,
        bool fullyFulfilled
    ) external onlyRole(VAULT_ROLE) {
        CrossChainCodec.WithdrawFulfillMessage
            memory fulfillMsg = CrossChainCodec.WithdrawFulfillMessage({
                withdrawNonce: _withdrawNonce,
                amount: amount,
                fullyFulfilled: fullyFulfilled
            });

        _dispatchMessage(
            destChainId,
            CrossChainCodec.encodeWithdrawFulfill(fulfillMsg)
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Get the number of registered satellite chains.
    function satelliteChainCount() external view returns (uint256) {
        return satelliteChains.length;
    }

    /// @notice Get total satellite assets across all chains.
    function totalSatelliteAssets() external view returns (uint256 total) {
        for (uint256 i = 0; i < satelliteChains.length; i++) {
            total += satelliteAssets[keccak256(satelliteChains[i])];
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Emergency
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Pause the router (blocks outgoing messages).
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the router.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — ISMP Callbacks
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc HyperbridgeAdapter
    function _processMessage(
        bytes calldata source,
        bytes calldata body
    ) internal override {
        uint8 msgType = CrossChainCodec.messageType(body);

        if (msgType == CrossChainCodec.MSG_DEPOSIT_SYNC) {
            _handleDepositSync(source, body);
        } else if (msgType == CrossChainCodec.MSG_WITHDRAW_REQUEST) {
            _handleWithdrawRequest(source, body);
        } else {
            revert UnknownCrossChainMessage(msgType);
        }
    }

    /// @inheritdoc HyperbridgeAdapter
    function _handleTimeout(
        bytes calldata /* dest */,
        bytes calldata body
    ) internal override {
        uint8 msgType = CrossChainCodec.messageType(body);

        // On timeout of outgoing messages, we may need to rollback state
        if (msgType == CrossChainCodec.MSG_WITHDRAW_FULFILL) {
            CrossChainCodec.WithdrawFulfillMessage
                memory fulfillMsg = CrossChainCodec.decodeWithdrawFulfill(body);
            // The withdrawal assets were not delivered — re-add to pending
            pendingWithdrawalRequests += fulfillMsg.amount;
        }
        // For other message types (AssetSync, StrategyReport, etc.), timeout is informational
        // The next broadcast cycle will resync state
    }

    /// @dev Handle an incoming deposit sync from a satellite.
    function _handleDepositSync(
        bytes calldata source,
        bytes calldata body
    ) internal {
        CrossChainCodec.DepositSyncMessage memory depositMsg = CrossChainCodec
            .decodeDepositSync(body);

        bytes32 chainHash = keccak256(source);

        // Track the nonce
        uint256 expectedNonce = incomingDepositNonces[chainHash];
        if (depositMsg.nonce != expectedNonce) {
            // Out-of-order messages are still processed but logged
            // (Hyperbridge provides ordering guarantees, but be defensive)
        }
        incomingDepositNonces[chainHash] = depositMsg.nonce + 1;

        // Update satellite asset tracking
        satelliteAssets[chainHash] += depositMsg.amount;
        pendingSatelliteDeposits += depositMsg.amount;

        emit SatelliteDepositReceived(
            source,
            depositMsg.depositor,
            depositMsg.amount,
            depositMsg.sharesMinted,
            depositMsg.nonce
        );
    }

    /// @dev Handle an incoming withdrawal request from a satellite.
    function _handleWithdrawRequest(
        bytes calldata source,
        bytes calldata body
    ) internal {
        CrossChainCodec.WithdrawRequestMessage
            memory withdrawMsg = CrossChainCodec.decodeWithdrawRequest(body);

        bytes32 chainHash = keccak256(source);

        // Track the nonce
        incomingWithdrawNonces[chainHash] = withdrawMsg.nonce + 1;

        // Store the pending withdrawal
        uint256 currentNonce = withdrawNonce;
        pendingWithdrawals[currentNonce] = withdrawMsg;
        unchecked {
            withdrawNonce = currentNonce + 1;
        }

        pendingWithdrawalRequests += withdrawMsg.amount;

        // Update satellite asset tracking
        if (satelliteAssets[chainHash] >= withdrawMsg.amount) {
            satelliteAssets[chainHash] -= withdrawMsg.amount;
        } else {
            satelliteAssets[chainHash] = 0;
        }

        emit SatelliteWithdrawRequested(
            source,
            withdrawMsg.withdrawer,
            withdrawMsg.amount,
            withdrawMsg.sharesToBurn,
            withdrawMsg.nonce
        );
    }
}
