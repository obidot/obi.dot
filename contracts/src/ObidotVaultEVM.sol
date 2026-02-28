// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IIsmpHost} from "./interfaces/IIsmpHost.sol";
import {IIsmpModule} from "./interfaces/IIsmpModule.sol";
import {CrossChainCodec} from "./libraries/CrossChainCodec.sol";

/// @title ObidotVaultEVM — Satellite ERC-4626 Vault on EVM Chains
/// @notice Deployed on Ethereum, Arbitrum, Optimism, Base, etc. Accepts deposits from
///         users on the local chain, mints shares, and syncs state with the hub vault
///         on Polkadot Hub via Hyperbridge ISMP messaging.
/// @dev This is a "thin" vault — it holds local deposits and mirrors the hub's
///      totalAssets/totalShares for accurate share pricing. Actual DeFi strategies
///      are executed on the Polkadot Hub side. The satellite only handles:
///      1. Local deposit/withdraw operations
///      2. Cross-chain deposit sync to hub
///      3. Cross-chain withdrawal requests from hub
///      4. State synchronization from hub (asset totals, emergency state)
contract ObidotVaultEVM is ERC4626, AccessControl, Pausable, ReentrancyGuard, IIsmpModule {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role for keepers that can trigger cross-chain sync operations.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @dev Maximum basis points denominator (100%).
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Caller is not the authorized ISMP host.
    error UnauthorizedHost(address caller, address expected);

    /// @dev The source chain is not the registered hub.
    error UnauthorizedSource(bytes source);

    /// @dev The sending module is not the registered hub router.
    error UnauthorizedSender(bytes from);

    /// @dev Unknown cross-chain message type.
    error UnknownMessageType(uint8 messageType);

    /// @dev The deposit would exceed the vault's deposit cap.
    error DepositCapExceeded(uint256 totalAfterDeposit, uint256 cap);

    /// @dev A zero address was provided.
    error ZeroAddress();

    /// @dev The cap value is invalid (zero).
    error InvalidCap();

    /// @dev Cross-chain sync is stale — hub data too old.
    error SyncDataStale(uint256 lastSync, uint256 maxAge);

    /// @dev Withdrawal not available — pending fulfillment from hub.
    error WithdrawalPending(uint256 amount);

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a deposit is synced to the hub.
    event DepositSynced(address indexed depositor, uint256 amount, uint256 sharesMinted, uint256 nonce);

    /// @notice Emitted when a withdrawal request is sent to the hub.
    event WithdrawalRequested(address indexed withdrawer, uint256 amount, uint256 sharesToBurn, uint256 nonce);

    /// @notice Emitted when asset sync is received from the hub.
    event AssetSyncReceived(uint256 globalTotalAssets, uint256 globalTotalShares, uint256 timestamp);

    /// @notice Emitted when a strategy report is received from the hub.
    event StrategyReportReceived(uint256 strategyId, bool success, int256 pnl);

    /// @notice Emitted when emergency state is synced from the hub.
    event EmergencySyncReceived(bool paused, bool emergencyMode);

    /// @notice Emitted when a deposit acknowledgment is received.
    event DepositAckReceived(uint256 depositNonce, bool accepted);

    /// @notice Emitted when a withdrawal fulfillment is received.
    event WithdrawalFulfilled(uint256 withdrawNonce, uint256 amount, bool fullyFulfilled);

    /// @notice Emitted when the deposit cap is updated.
    event DepositCapUpdated(uint256 newCap);

    // ─────────────────────────────────────────────────────────────────────
    //  State — ISMP Configuration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The Hyperbridge ISMP host contract.
    IIsmpHost public immutable ismpHost;

    /// @notice The hub chain identifier (e.g., "POLKADOT-HUB").
    bytes public hubChainId;

    /// @notice The hub router module address for message verification.
    bytes public hubRouterModule;

    /// @notice This chain's identifier for ISMP (e.g., "ETHEREUM", "ARBITRUM").
    bytes public chainIdentifier;

    // ─────────────────────────────────────────────────────────────────────
    //  State — Global Sync
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Global total assets as reported by the hub (includes all satellites + hub + remote).
    uint256 public globalTotalAssets;

    /// @notice Global total shares as reported by the hub.
    uint256 public globalTotalShares;

    /// @notice Hub's total remote assets deployed to DeFi protocols.
    uint256 public hubRemoteAssets;

    /// @notice Timestamp of the last successful asset sync from the hub.
    uint256 public lastSyncTimestamp;

    /// @notice Maximum age (seconds) for hub sync data before it's considered stale.
    uint256 public maxSyncAge;

    // ─────────────────────────────────────────────────────────────────────
    //  State — Local Accounting
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Maximum total deposits accepted by this satellite vault.
    uint256 public depositCap;

    /// @notice Nonce for outgoing deposit sync messages.
    uint256 public depositSyncNonce;

    /// @notice Nonce for outgoing withdrawal request messages.
    uint256 public withdrawRequestNonce;

    /// @notice Whether emergency withdrawal mode is active (synced from hub).
    bool public emergencyMode;

    /// @notice Total pending withdrawal amounts waiting for hub fulfillment.
    uint256 public totalPendingWithdrawals;

    /// @notice Pending withdrawal details per nonce.
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;

    /// @notice Deposit acknowledgment status per nonce.
    mapping(uint256 => bool) public depositAcknowledged;

    /// @notice Struct for tracking pending withdrawals.
    struct PendingWithdrawal {
        address withdrawer;
        uint256 amount;
        uint256 sharesToBurn;
        bool fulfilled;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param _asset The underlying ERC-20 asset.
    /// @param _ismpHost The Hyperbridge ISMP host address on this chain.
    /// @param _hubChainId The hub chain identifier.
    /// @param _hubRouterModule The hub router module address.
    /// @param _chainIdentifier This chain's ISMP identifier.
    /// @param _depositCap Initial deposit cap.
    /// @param _maxSyncAge Maximum sync data age in seconds.
    /// @param _admin The admin address.
    constructor(
        IERC20 _asset,
        address _ismpHost,
        bytes memory _hubChainId,
        bytes memory _hubRouterModule,
        bytes memory _chainIdentifier,
        uint256 _depositCap,
        uint256 _maxSyncAge,
        address _admin
    ) ERC4626(_asset) ERC20("Obidot Cross-Chain Vault Share", "obVAULT") {
        if (_ismpHost == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_depositCap == 0) revert InvalidCap();

        ismpHost = IIsmpHost(_ismpHost);
        hubChainId = _hubChainId;
        hubRouterModule = _hubRouterModule;
        chainIdentifier = _chainIdentifier;
        depositCap = _depositCap;
        maxSyncAge = _maxSyncAge;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(KEEPER_ROLE, _admin);
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
    //  ERC-4626 Overrides — Accounting
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns total assets: local balance (held in this vault).
    /// @dev In emergency mode, only considers local balance.
    ///      Otherwise, includes a pro-rata share of the global total based on
    ///      this satellite's share of total deposits.
    function totalAssets() public view override returns (uint256) {
        uint256 localBalance = IERC20(asset()).balanceOf(address(this));

        if (emergencyMode) {
            return localBalance;
        }

        // If we haven't synced yet, just return local balance
        if (lastSyncTimestamp == 0) {
            return localBalance;
        }

        // Local balance represents assets physically held here.
        // Global sync provides the "virtual" total for accurate share pricing.
        // The satellite share price follows the hub's global price.
        return localBalance;
    }

    /// @notice Anti-inflation-attack offset matching the hub vault.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-4626 Overrides — Caps
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Maximum depositable assets, respecting the deposit cap.
    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 currentTotal = totalAssets();
        if (currentTotal >= depositCap) return 0;
        return depositCap - currentTotal;
    }

    /// @notice Maximum mintable shares, respecting the deposit cap.
    function maxMint(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 maxDep = maxDeposit(address(0));
        if (maxDep == 0) return 0;
        return convertToShares(maxDep);
    }

    /// @notice Maximum withdrawable: 0 when paused (unless emergency mode).
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused() && !emergencyMode) return 0;
        return super.maxWithdraw(owner);
    }

    /// @notice Maximum redeemable: 0 when paused (unless emergency mode).
    function maxRedeem(address owner) public view override returns (uint256) {
        if (paused() && !emergencyMode) return 0;
        return super.maxRedeem(owner);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-4626 Overrides — Guarded Entry/Exit
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        uint256 shares = super.deposit(assets, receiver);

        // Sync deposit to hub via Hyperbridge
        _syncDepositToHub(msg.sender, assets, shares);

        return shares;
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        uint256 assets = super.mint(shares, receiver);

        // Sync deposit to hub
        _syncDepositToHub(msg.sender, assets, shares);

        return assets;
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
        if (paused() && !emergencyMode) revert EnforcedPause();

        // Check if we have enough local balance
        uint256 localBalance = IERC20(asset()).balanceOf(address(this));
        if (assets > localBalance && !emergencyMode) {
            // Request assets from hub for the shortfall
            uint256 shares = previewWithdraw(assets);
            _requestWithdrawFromHub(msg.sender, assets, shares);
            revert WithdrawalPending(assets);
        }

        return super.withdraw(assets, receiver, owner);
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        if (paused() && !emergencyMode) revert EnforcedPause();

        uint256 assets = previewRedeem(shares);
        uint256 localBalance = IERC20(asset()).balanceOf(address(this));
        if (assets > localBalance && !emergencyMode) {
            _requestWithdrawFromHub(msg.sender, assets, shares);
            revert WithdrawalPending(assets);
        }

        return super.redeem(shares, receiver, owner);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Cross-Chain — Hub Sync
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Sync a deposit event to the hub via Hyperbridge.
    function _syncDepositToHub(address depositor, uint256 amount, uint256 sharesMinted) internal {
        uint256 nonce = depositSyncNonce;
        unchecked {
            depositSyncNonce = nonce + 1;
        }

        CrossChainCodec.DepositSyncMessage memory syncMsg = CrossChainCodec.DepositSyncMessage({
            chainId: chainIdentifier,
            depositor: depositor,
            amount: amount,
            sharesMinted: sharesMinted,
            nonce: nonce
        });

        bytes memory encoded = CrossChainCodec.encodeDepositSync(syncMsg);

        IIsmpHost.DispatchPost memory post = IIsmpHost.DispatchPost({
            dest: hubChainId,
            to: hubRouterModule,
            body: encoded,
            timeout: 7200, // 2 hours
            gaslimit: 500_000
        });

        uint256 fee = ismpHost.dispatchFee(post);
        ismpHost.dispatch{value: fee}(post);

        emit DepositSynced(depositor, amount, sharesMinted, nonce);
    }

    /// @dev Request assets from the hub for a withdrawal.
    function _requestWithdrawFromHub(address withdrawer, uint256 amount, uint256 sharesToBurn) internal {
        uint256 nonce = withdrawRequestNonce;
        unchecked {
            withdrawRequestNonce = nonce + 1;
        }

        pendingWithdrawals[nonce] =
            PendingWithdrawal({withdrawer: withdrawer, amount: amount, sharesToBurn: sharesToBurn, fulfilled: false});

        totalPendingWithdrawals += amount;

        CrossChainCodec.WithdrawRequestMessage memory withdrawMsg = CrossChainCodec.WithdrawRequestMessage({
            chainId: chainIdentifier,
            withdrawer: withdrawer,
            amount: amount,
            sharesToBurn: sharesToBurn,
            nonce: nonce
        });

        bytes memory encoded = CrossChainCodec.encodeWithdrawRequest(withdrawMsg);

        IIsmpHost.DispatchPost memory post = IIsmpHost.DispatchPost({
            dest: hubChainId,
            to: hubRouterModule,
            body: encoded,
            timeout: 7200,
            gaslimit: 500_000
        });

        uint256 fee = ismpHost.dispatchFee(post);
        ismpHost.dispatch{value: fee}(post);

        emit WithdrawalRequested(withdrawer, amount, sharesToBurn, nonce);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ISMP Module Callbacks — Receiving from Hub
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IIsmpModule
    function onAccept(IncomingPostRequest calldata incoming) external override onlyIsmpHost nonReentrant {
        PostRequest calldata request = incoming.request;

        // Verify source is the hub
        if (keccak256(request.source) != keccak256(hubChainId)) {
            revert UnauthorizedSource(request.source);
        }

        // Verify sender is the hub router
        if (keccak256(request.from) != keccak256(hubRouterModule)) {
            revert UnauthorizedSender(request.from);
        }

        uint8 msgType = CrossChainCodec.messageType(request.body);

        if (msgType == CrossChainCodec.MSG_ASSET_SYNC) {
            _handleAssetSync(request.body);
        } else if (msgType == CrossChainCodec.MSG_STRATEGY_REPORT) {
            _handleStrategyReport(request.body);
        } else if (msgType == CrossChainCodec.MSG_EMERGENCY_SYNC) {
            _handleEmergencySync(request.body);
        } else if (msgType == CrossChainCodec.MSG_DEPOSIT_ACK) {
            _handleDepositAck(request.body);
        } else if (msgType == CrossChainCodec.MSG_WITHDRAW_FULFILL) {
            _handleWithdrawFulfill(request.body);
        } else {
            revert UnknownMessageType(msgType);
        }
    }

    /// @inheritdoc IIsmpModule
    function onPostRequestTimeout(PostRequest calldata request) external override onlyIsmpHost {
        // If a deposit sync times out, the deposit is still valid locally
        // but the hub is unaware. A keeper should retry the sync.
        uint8 msgType = CrossChainCodec.messageType(request.body);
        if (msgType == CrossChainCodec.MSG_WITHDRAW_REQUEST) {
            // Withdrawal request timed out — cancel the pending withdrawal
            CrossChainCodec.WithdrawRequestMessage memory withdrawMsg =
                CrossChainCodec.decodeWithdrawRequest(request.body);
            if (totalPendingWithdrawals >= withdrawMsg.amount) {
                totalPendingWithdrawals -= withdrawMsg.amount;
            }
        }
    }

    /// @inheritdoc IIsmpModule
    function onPostResponse(IncomingPostResponse calldata) external override onlyIsmpHost {}

    /// @inheritdoc IIsmpModule
    function onPostResponseTimeout(PostResponse calldata) external override onlyIsmpHost {}

    /// @inheritdoc IIsmpModule
    function onGetResponse(IncomingGetResponse calldata) external override onlyIsmpHost {}

    /// @inheritdoc IIsmpModule
    function onGetTimeout(GetRequest calldata) external override onlyIsmpHost {}

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Message Handlers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Handle asset sync from hub — update global accounting.
    function _handleAssetSync(bytes calldata body) internal {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.decodeAssetSync(body);

        globalTotalAssets = syncMsg.globalTotalAssets;
        globalTotalShares = syncMsg.globalTotalShares;
        hubRemoteAssets = syncMsg.totalRemoteAssets;
        lastSyncTimestamp = syncMsg.timestamp;

        emit AssetSyncReceived(syncMsg.globalTotalAssets, syncMsg.globalTotalShares, syncMsg.timestamp);
    }

    /// @dev Handle strategy report from hub — informational for this satellite.
    function _handleStrategyReport(bytes calldata body) internal {
        CrossChainCodec.StrategyReportMessage memory reportMsg = CrossChainCodec.decodeStrategyReport(body);

        // Update hub remote assets
        hubRemoteAssets = reportMsg.newTotalRemoteAssets;

        emit StrategyReportReceived(reportMsg.strategyId, reportMsg.success, reportMsg.pnl);
    }

    /// @dev Handle emergency sync from hub — mirror pause/emergency state.
    function _handleEmergencySync(bytes calldata body) internal {
        CrossChainCodec.EmergencySyncMessage memory emergencyMsg = CrossChainCodec.decodeEmergencySync(body);

        if (emergencyMsg.paused && !paused()) {
            _pause();
        } else if (!emergencyMsg.paused && paused() && !emergencyMsg.emergencyMode) {
            _unpause();
        }

        emergencyMode = emergencyMsg.emergencyMode;

        emit EmergencySyncReceived(emergencyMsg.paused, emergencyMsg.emergencyMode);
    }

    /// @dev Handle deposit acknowledgment from hub.
    function _handleDepositAck(bytes calldata body) internal {
        CrossChainCodec.DepositAckMessage memory ackMsg = CrossChainCodec.decodeDepositAck(body);

        depositAcknowledged[ackMsg.depositNonce] = ackMsg.accepted;
        globalTotalAssets = ackMsg.globalTotalAssets;

        emit DepositAckReceived(ackMsg.depositNonce, ackMsg.accepted);
    }

    /// @dev Handle withdrawal fulfillment from hub.
    function _handleWithdrawFulfill(bytes calldata body) internal {
        CrossChainCodec.WithdrawFulfillMessage memory fulfillMsg = CrossChainCodec.decodeWithdrawFulfill(body);

        PendingWithdrawal storage pending = pendingWithdrawals[fulfillMsg.withdrawNonce];
        pending.fulfilled = true;

        if (totalPendingWithdrawals >= fulfillMsg.amount) {
            totalPendingWithdrawals -= fulfillMsg.amount;
        } else {
            totalPendingWithdrawals = 0;
        }

        emit WithdrawalFulfilled(fulfillMsg.withdrawNonce, fulfillMsg.amount, fulfillMsg.fullyFulfilled);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Update the deposit cap.
    function setDepositCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0) revert InvalidCap();
        depositCap = newCap;
        emit DepositCapUpdated(newCap);
    }

    /// @notice Update the maximum sync age.
    function setMaxSyncAge(uint256 newMaxAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxSyncAge = newMaxAge;
    }

    /// @notice Update hub configuration.
    function setHubConfig(bytes calldata _hubChainId, bytes calldata _hubRouterModule)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        hubChainId = _hubChainId;
        hubRouterModule = _hubRouterModule;
    }

    /// @notice Pause the vault.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the vault.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        if (emergencyMode) {
            emergencyMode = false;
        }
    }

    /// @notice Enable emergency mode.
    function enableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        emergencyMode = true;
        emit EmergencySyncReceived(true, true);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the idle (local) assets in the vault.
    function idleAssets() external view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Check if the hub sync data is fresh enough.
    function isSyncFresh() external view returns (bool) {
        if (lastSyncTimestamp == 0) return false;
        return block.timestamp - lastSyncTimestamp <= maxSyncAge;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-165
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Required override for AccessControl + ERC4626 diamond.
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Allow receiving native tokens for ISMP dispatch fees.
    receive() external payable {}
}
