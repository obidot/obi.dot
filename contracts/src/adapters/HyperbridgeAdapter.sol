// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIsmpHost} from "../interfaces/IIsmpHost.sol";
import {IIsmpModule} from "../interfaces/IIsmpModule.sol";

/// @title HyperbridgeAdapter — Base adapter for Hyperbridge ISMP messaging
/// @notice Abstract contract providing core Hyperbridge integration logic.
///         Handles ISMP host interaction, message dispatch, access control for
///         received messages, and timeout handling.
/// @dev Inheriting contracts implement `_processMessage()` to handle incoming
///      cross-chain messages and `_handleTimeout()` for rollback logic.
///      Only the ISMP host can call `onAccept()` and timeout callbacks.
abstract contract HyperbridgeAdapter is IIsmpModule, AccessControl, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role for addresses authorized to dispatch cross-chain messages.
    bytes32 public constant DISPATCHER_ROLE = keccak256("DISPATCHER_ROLE");

    /// @dev Default ISMP message timeout: 2 hours.
    uint64 internal constant DEFAULT_TIMEOUT = 7200;

    /// @dev Default gas limit for cross-chain message execution.
    uint256 internal constant DEFAULT_GAS_LIMIT = 500_000;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Caller is not the authorized ISMP host.
    error UnauthorizedHost(address caller, address expected);

    /// @dev The source chain of a received message is not registered.
    error UnknownSourceChain(bytes source);

    /// @dev The source module of a received message is not authorized.
    error UnauthorizedSourceModule(bytes from);

    /// @dev Message dispatch failed.
    error DispatchFailed(bytes32 commitment);

    /// @dev Zero address provided for ISMP host.
    error ZeroHostAddress();

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a cross-chain message is dispatched.
    event MessageDispatched(bytes32 indexed commitment, bytes dest, uint64 timeout, uint256 bodyLength);

    /// @notice Emitted when a cross-chain message is received and processed.
    event MessageReceived(bytes source, uint64 nonce, uint256 bodyLength);

    /// @notice Emitted when a dispatched message times out.
    event MessageTimeout(bytes dest, uint64 nonce, uint256 bodyLength);

    /// @notice Emitted when a peer chain/module is registered or removed.
    event PeerRegistered(bytes chainId, bytes moduleAddress, bool registered);

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The Hyperbridge ISMP host contract.
    IIsmpHost public immutable ismpHost;

    /// @notice Registered peer chains and their module addresses.
    /// @dev Maps chain identifier → authorized module address on that chain.
    mapping(bytes32 => bytes) public registeredPeers;

    /// @notice Set of known chain identifiers for quick lookup.
    mapping(bytes32 => bool) public knownChains;

    /// @notice Outgoing message nonce (per-adapter replay protection).
    uint256 public outgoingNonce;

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param _ismpHost The address of the ISMP host contract on this chain.
    /// @param _admin The admin address receiving DEFAULT_ADMIN_ROLE.
    constructor(address _ismpHost, address _admin) {
        if (_ismpHost == address(0)) revert ZeroHostAddress();

        ismpHost = IIsmpHost(_ismpHost);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(DISPATCHER_ROLE, _admin);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Restrict calls to the ISMP host only.
    modifier onlyIsmpHost() {
        if (msg.sender != address(ismpHost)) {
            revert UnauthorizedHost(msg.sender, address(ismpHost));
        }
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Peer Management
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Register a peer chain and its authorized module address.
    /// @param chainId The chain identifier (e.g., "ETHEREUM", "POLKADOT-HUB").
    /// @param moduleAddress The module address on that chain (abi.encode(address) for EVM).
    function registerPeer(bytes calldata chainId, bytes calldata moduleAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 chainHash = keccak256(chainId);
        registeredPeers[chainHash] = moduleAddress;
        knownChains[chainHash] = true;
        emit PeerRegistered(chainId, moduleAddress, true);
    }

    /// @notice Remove a registered peer chain.
    /// @param chainId The chain identifier to remove.
    function removePeer(bytes calldata chainId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 chainHash = keccak256(chainId);
        delete registeredPeers[chainHash];
        knownChains[chainHash] = false;
        emit PeerRegistered(chainId, "", false);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Core — Dispatch Messages
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Dispatch a cross-chain message to a registered peer chain.
    /// @param destChainId The destination chain identifier.
    /// @param body The message body to send.
    /// @return commitment The unique commitment hash for this message.
    function _dispatchMessage(bytes memory destChainId, bytes memory body) internal returns (bytes32 commitment) {
        return _dispatchMessageWithParams(destChainId, body, DEFAULT_TIMEOUT, DEFAULT_GAS_LIMIT);
    }

    /// @notice Dispatch a cross-chain message with custom parameters.
    /// @param destChainId The destination chain identifier.
    /// @param body The message body to send.
    /// @param timeout Message timeout in seconds.
    /// @param gasLimit Execution gas limit on the destination.
    /// @return commitment The unique commitment hash for this message.
    function _dispatchMessageWithParams(bytes memory destChainId, bytes memory body, uint64 timeout, uint256 gasLimit)
        internal
        returns (bytes32 commitment)
    {
        bytes32 destHash = keccak256(destChainId);
        bytes memory peerModule = registeredPeers[destHash];
        if (peerModule.length == 0) revert UnknownSourceChain(destChainId);

        unchecked {
            outgoingNonce++;
        }

        IIsmpHost.DispatchPost memory post = IIsmpHost.DispatchPost({
            dest: destChainId,
            to: peerModule,
            body: body,
            timeout: timeout,
            gaslimit: gasLimit
        });

        // Estimate fee and dispatch
        uint256 fee = ismpHost.dispatchFee(post);
        commitment = ismpHost.dispatch{value: fee}(post);

        emit MessageDispatched(commitment, destChainId, timeout, body.length);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ISMP Module Callbacks
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IIsmpModule
    function onAccept(IncomingPostRequest calldata incoming) external override onlyIsmpHost nonReentrant {
        PostRequest calldata request = incoming.request;

        // Validate source chain is registered
        bytes32 sourceHash = keccak256(request.source);
        if (!knownChains[sourceHash]) {
            revert UnknownSourceChain(request.source);
        }

        // Validate source module is authorized
        bytes memory expectedFrom = registeredPeers[sourceHash];
        if (keccak256(request.from) != keccak256(expectedFrom)) {
            revert UnauthorizedSourceModule(request.from);
        }

        emit MessageReceived(request.source, request.nonce, request.body.length);

        // Delegate to the implementing contract
        _processMessage(request.source, request.body);
    }

    /// @inheritdoc IIsmpModule
    function onPostRequestTimeout(PostRequest calldata request) external override onlyIsmpHost nonReentrant {
        emit MessageTimeout(request.dest, request.nonce, request.body.length);
        _handleTimeout(request.dest, request.body);
    }

    /// @inheritdoc IIsmpModule
    function onPostResponse(IncomingPostResponse calldata) external override onlyIsmpHost {
        // Not used in this architecture — responses are handled via separate POST messages
    }

    /// @inheritdoc IIsmpModule
    function onPostResponseTimeout(PostResponse calldata) external override onlyIsmpHost {
        // Not used
    }

    /// @inheritdoc IIsmpModule
    function onGetResponse(IncomingGetResponse calldata) external override onlyIsmpHost {
        // Not used — state queries are handled off-chain
    }

    /// @inheritdoc IIsmpModule
    function onGetTimeout(GetRequest calldata) external override onlyIsmpHost {
        // Not used
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Abstract — Implement in Child Contracts
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Process an incoming cross-chain message.
    /// @param source The source chain identifier.
    /// @param body The message body.
    function _processMessage(bytes calldata source, bytes calldata body) internal virtual;

    /// @dev Handle a timeout for a previously dispatched message.
    /// @param dest The destination chain identifier.
    /// @param body The message body that timed out.
    function _handleTimeout(bytes calldata dest, bytes calldata body) internal virtual;

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-165
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc AccessControl
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Allow receiving native tokens for ISMP dispatch fees.
    receive() external payable {}
}
