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

import {IXcm} from "./interfaces/IXcm.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {OracleRegistry} from "./OracleRegistry.sol";
import {MultiLocation} from "./libraries/MultiLocation.sol";
import {BifrostCodec} from "./libraries/BifrostCodec.sol";

/// @title ObidotVault — Autonomous Cross-Chain Finance Layer
/// @notice ERC-4626 yield-bearing vault that allows an off-chain AI strategist to
///         autonomously route funds to Polkadot parachains using native XCM precompiles.
///         Enforces on-chain risk policies, EIP-712 signature verification, and oracle-based
///         slippage protection to ensure the AI agent cannot act maliciously.
/// @dev Deployed to Polkadot Hub EVM (REVM). Uses the XCM precompile at 0xA0000 for
///      cross-chain message dispatch. Follows EIP-4626 conservative rounding (favoring vault).
///      Implements EIP-712 typed data signing for replay-protected strategy execution.
contract ObidotVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role identifier for AI strategist agents that can sign strategy intents.
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");

    /// @notice Role identifier for keepers that report remote strategy outcomes.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @dev The on-chain address of the XCM (Cross-Consensus Message) precompile
    address public constant XCM_PRECOMPILE_ADDR = address(0xA0000);

    /// @notice XCM precompile address on Polkadot Hub EVM.
    IXcm public constant XCM_PRECOMPILE = IXcm(XCM_PRECOMPILE_ADDR);

    /// @notice EIP-712 domain typehash.
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice EIP-712 typehash for the StrategyIntent struct.
    bytes32 public constant STRATEGY_INTENT_TYPEHASH = keccak256(
        "StrategyIntent(address asset,uint256 amount,uint256 minReturn,uint256 maxSlippageBps,uint256 deadline,uint256 nonce,bytes xcmCall,uint32 targetParachain,address targetProtocol)"
    );

    /// @dev Maximum basis points denominator (100%).
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @dev Maximum allowed slippage in basis points (50%).
    uint256 internal constant MAX_SLIPPAGE_BPS = 5_000;

    /// @dev Safety margin multiplier for XCM weight estimation (110 = 10% buffer).
    uint64 public constant XCM_WEIGHT_SAFETY_MARGIN = 110;

    /// @dev Denominator for weight safety margin calculation.
    uint64 internal constant WEIGHT_MARGIN_DENOMINATOR = 100;

    /// @dev Oracle staleness threshold: 1 hour.
    uint256 public constant ORACLE_STALENESS_THRESHOLD = 3600;

    /// @dev Duration of the daily loss tracking window.
    uint256 internal constant DAILY_WINDOW = 1 days;

    // ─────────────────────────────────────────────────────────────────────
    //  Enums & Structs
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Lifecycle status of a strategy execution.
    enum StrategyStatus {
        Pending,
        Sent,
        Executed,
        Failed
    }

    /// @notice Typed data structure for AI strategist intents.
    /// @param asset           The vault's underlying asset being deployed.
    /// @param amount          Amount of underlying asset to deploy.
    /// @param minReturn       Minimum expected return from the remote strategy.
    /// @param maxSlippageBps  Maximum acceptable slippage in basis points.
    /// @param deadline        Unix timestamp after which this intent expires.
    /// @param nonce           Per-strategist nonce for replay protection.
    /// @param xcmCall         SCALE-encoded VersionedXcm message payload.
    /// @param targetParachain Destination parachain ID for policy validation.
    /// @param targetProtocol  Target protocol address for exposure tracking.
    struct StrategyIntent {
        address asset;
        uint256 amount;
        uint256 minReturn;
        uint256 maxSlippageBps;
        uint256 deadline;
        uint256 nonce;
        bytes xcmCall;
        uint32 targetParachain;
        address targetProtocol;
    }

    /// @notice Record of a strategy execution.
    struct StrategyRecord {
        StrategyStatus status;
        address strategist;
        uint256 amount;
        uint256 minReturn;
        uint32 targetParachain;
        address targetProtocol;
        uint256 executedAt;
    }

    /// @notice Queued withdrawal request.
    /// @dev Size: 20 + 32 + 32 + 32 = 116 bytes — fits PVM 416-byte storage limit.
    struct WithdrawalRequest {
        address owner;
        uint256 shares;
        uint256 assets;
        uint256 claimableAt;
    }

    /// @notice Per-protocol performance metrics for strategy scoring.
    /// @dev Size: 5 × 32 = 160 bytes — fits PVM 416-byte storage limit.
    struct ProtocolPerformance {
        uint256 totalDeployed;
        uint256 totalReturned;
        uint256 executionCount;
        uint256 successCount;
        uint256 lastExecutedAt;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev The strategy intent deadline has expired.
    error DeadlineExpired(uint256 deadline, uint256 currentTime);

    /// @dev The nonce does not match the expected value for this strategist.
    error InvalidNonce(uint256 expected, uint256 provided);

    /// @dev The recovered signer does not have STRATEGIST_ROLE.
    error UnauthorizedStrategist(address recovered);

    /// @dev The recovered signer address is the zero address (invalid signature).
    error InvalidSignature();

    /// @dev The intent's asset does not match the vault's underlying asset.
    error AssetMismatch(address expected, address provided);

    /// @dev The target parachain is not in the allowed whitelist.
    error ParachainNotAllowed(uint32 parachainId);

    /// @dev The target protocol is not in the allowed whitelist.
    error ProtocolNotAllowed(address protocol);

    /// @dev The strategy amount would exceed the protocol's exposure cap.
    error ExposureCapExceeded(address protocol, uint256 currentExposure, uint256 amount, uint256 cap);

    /// @dev The strategy loss would exceed the daily loss threshold.
    error DailyLossThresholdBreached(uint256 currentLoss, uint256 additionalLoss, uint256 maxLoss);

    /// @dev The slippage parameter is too high.
    error SlippageTooHigh(uint256 maxSlippageBps);

    /// @dev The strategy amount is zero.
    error ZeroAmount();

    /// @dev Insufficient idle balance in the vault for the strategy deployment.
    error InsufficientIdleBalance(uint256 available, uint256 requested);

    /// @dev The oracle returned a stale or invalid price.
    error OracleDataInvalid(int256 answer, uint256 updatedAt);

    /// @dev The minReturn does not meet the oracle-derived slippage bound.
    error OracleSlippageCheckFailed(uint256 minReturn, uint256 oracleMinimum);

    /// @dev The XCM message weight exceeds the maximum allowed weight.
    error XcmOverweight(uint64 estimatedRefTime, uint64 estimatedProofSize, uint64 maxRefTime, uint64 maxProofSize);

    /// @dev The deposit would exceed the vault's deposit cap.
    error DepositCapExceeded(uint256 totalAfterDeposit, uint256 cap);

    /// @dev The strategy ID does not exist.
    error StrategyNotFound(uint256 strategyId);

    /// @dev The strategy is not in the expected status for this operation.
    error InvalidStrategyStatus(uint256 strategyId, StrategyStatus current, StrategyStatus expected);

    /// @dev A zero address was provided where a valid address is required.
    error ZeroAddress();

    /// @dev The cap value is invalid (zero).
    error InvalidCap();

    /// @dev The withdrawal request does not exist.
    error WithdrawalNotFound(uint256 requestId);

    /// @dev The withdrawal timelock has not expired yet.
    error WithdrawalNotClaimable(uint256 requestId, uint256 claimableAt);

    /// @dev Only the owner of a withdrawal request can cancel it.
    error NotWithdrawalOwner(uint256 requestId, address caller);

    /// @dev Insufficient idle balance to fulfill withdrawal.
    error InsufficientIdleForWithdrawal(uint256 available, uint256 required);

    /// @dev Array length mismatch in batch operations.
    error ArrayLengthMismatch();

    /// @dev Performance fee basis points too high (max 3000 = 30%).
    error FeeTooHigh(uint256 feeBps);

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a strategy intent is successfully validated and dispatched via XCM.
    event StrategyExecuted(
        uint256 indexed strategyId,
        address indexed strategist,
        uint32 indexed targetParachain,
        address targetProtocol,
        uint256 amount,
        uint256 minReturn
    );

    /// @notice Emitted when a remote strategy outcome is reported by a keeper.
    event StrategyOutcomeReported(
        uint256 indexed strategyId, StrategyStatus newStatus, uint256 returnedAmount, int256 pnl
    );

    /// @notice Emitted when a parachain is added to or removed from the whitelist.
    event ParachainWhitelistUpdated(uint32 indexed parachainId, bool allowed);

    /// @notice Emitted when a protocol is added to or removed from the whitelist.
    event ProtocolWhitelistUpdated(address indexed protocol, bool allowed);

    /// @notice Emitted when a protocol's exposure cap is updated.
    event ExposureCapUpdated(address indexed protocol, uint256 newCap);

    /// @notice Emitted when the daily loss threshold is updated.
    event DailyLossThresholdUpdated(uint256 newThreshold);

    /// @notice Emitted when the deposit cap is updated.
    event DepositCapUpdated(uint256 newCap);

    /// @notice Emitted when the oracle address is updated.
    event OracleUpdated(address indexed newOracle);

    /// @notice Emitted when the XCM weight limits are updated.
    event XcmWeightLimitsUpdated(uint64 maxRefTime, uint64 maxProofSize);

    /// @notice Emitted when emergency withdrawal mode is toggled.
    event EmergencyModeToggled(bool enabled);

    /// @notice Emitted when remote assets are adjusted by admin.
    event RemoteAssetsAdjusted(uint256 oldValue, uint256 newValue, string reason);

    /// @notice Emitted when the oracle registry is updated.
    event OracleRegistryUpdated(address indexed newRegistry);

    /// @notice Emitted when the cross-chain router is updated.
    event CrossChainRouterUpdated(address indexed newRouter);

    /// @notice Emitted when the Bifrost adapter is updated.
    event BifrostAdapterUpdated(address indexed newAdapter);

    /// @notice Emitted when satellite assets are updated.
    event SatelliteAssetsUpdated(bytes32 indexed chainHash, uint256 amount, uint256 newTotal);

    /// @notice Emitted when a Bifrost-specific strategy is executed.
    event BifrostStrategyExecuted(uint256 indexed strategyId, uint8 bifrostStrategyType, uint256 amount);

    /// @notice Emitted when asset sync is broadcast to satellites.
    event AssetSyncBroadcasted(uint256 totalAssets, uint256 totalShares, uint256 remoteAssets);

    // ── Withdrawal Queue Events ──────────────────────────────────────────

    /// @notice Emitted when a withdrawal request is queued.
    event WithdrawalQueued(uint256 indexed requestId, address indexed owner, uint256 shares, uint256 assets);

    /// @notice Emitted when a queued withdrawal is fulfilled by a keeper.
    event WithdrawalFulfilled(uint256 indexed requestId, address indexed owner, uint256 assets);

    /// @notice Emitted when a withdrawal request is cancelled by the owner.
    event WithdrawalCancelled(uint256 indexed requestId, address indexed owner);

    /// @notice Emitted when the withdrawal timelock duration is updated.
    event WithdrawalTimelockUpdated(uint256 newTimelock);

    // ── Performance & Fee Events ─────────────────────────────────────────

    /// @notice Emitted when the performance fee rate is updated.
    event PerformanceFeeUpdated(uint256 newFeeBps);

    /// @notice Emitted when performance fees are minted as vault shares.
    event PerformanceFeeMinted(address indexed treasury, uint256 feeShares);

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Cached EIP-712 domain separator (valid only when chain ID matches deployment).
    bytes32 private immutable _cachedDomainSeparator;

    /// @notice Chain ID at deployment time, used for fork detection.
    uint256 private immutable _deploymentChainId;

    /// @notice The Pyth/Chainlink oracle used for price sanity checks.
    IAggregatorV3 public priceOracle;

    /// @notice Global strategy counter (also used as strategy IDs).
    uint256 public strategyCounter;

    /// @notice Per-strategist nonce for replay protection.
    mapping(address => uint256) public nonces;

    /// @notice Strategy execution records indexed by strategy ID.
    mapping(uint256 => StrategyRecord) public strategies;

    // ── Remote Asset Accounting ──────────────────────────────────────────

    /// @notice Total value of assets deployed to remote parachains.
    /// @dev Updated on strategy dispatch (+) and outcome reporting (-/+).
    uint256 public totalRemoteAssets;

    // ── Policy Engine State ──────────────────────────────────────────────

    /// @notice Immutable-style whitelist of allowed destination parachains.
    mapping(uint32 => bool) public allowedParachains;

    /// @notice Whitelist of allowed target protocol addresses.
    mapping(address => bool) public allowedTargets;

    /// @notice Current capital deployed to each protocol.
    mapping(address => uint256) public protocolExposure;

    /// @notice Maximum capital allocation allowed per protocol.
    mapping(address => uint256) public maxProtocolExposure;

    /// @notice Maximum cumulative loss allowed per day before circuit-breaking.
    uint256 public maxDailyLoss;

    /// @notice Accumulated losses in the current daily window.
    uint256 public dailyLossAccumulator;

    /// @notice Timestamp when the daily loss accumulator was last reset.
    uint256 public lastLossResetTimestamp;

    /// @notice Maximum total deposits the vault will accept.
    uint256 public depositCap;

    // ── XCM Weight Limits ────────────────────────────────────────────────

    /// @notice Maximum allowed XCM refTime (with safety margin already excluded).
    uint64 public maxXcmRefTime;

    /// @notice Maximum allowed XCM proofSize (with safety margin already excluded).
    uint64 public maxXcmProofSize;

    // ── Emergency Mode ───────────────────────────────────────────────────

    /// @notice When true, withdrawals ignore remote asset accounting.
    bool public emergencyMode;

    /// @notice Optional oracle registry for multi-asset price feeds.
    /// @dev If set, `_enforceOracleSlippage` tries the registry first,
    ///      falling back to the single `priceOracle`. address(0) = disabled.
    OracleRegistry public oracleRegistry;

    // ── Withdrawal Queue ─────────────────────────────────────────────────

    /// @notice Withdrawal request counter (also used as request IDs).
    uint256 public withdrawalCounter;

    /// @notice Timelock duration for queued withdrawals (in seconds).
    uint256 public withdrawalTimelock;

    /// @notice Queued withdrawal requests indexed by request ID.
    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;

    // ── Protocol Performance Scoring ─────────────────────────────────────

    /// @notice Per-protocol performance metrics.
    mapping(address => ProtocolPerformance) public protocolPerformance;

    // ── PnL Tracking & Performance Fees ──────────────────────────────────

    /// @notice Cumulative profit and loss across all strategies.
    int256 public cumulativePnL;

    /// @notice High-water mark of total assets for performance fee calculation.
    uint256 public highWaterMark;

    /// @notice Performance fee rate in basis points (max 3000 = 30%).
    uint256 public performanceFeeBps;

    /// @notice Treasury address that receives performance fee shares.
    address public feeTreasury;
    // ── Cross-Chain Integration ──────────────────────────────────────────

    /// @notice The CrossChainRouter contract for satellite vault communication.
    address public crossChainRouter;

    /// @notice The BifrostAdapter contract for Bifrost DeFi operations.
    address public bifrostAdapter;

    /// @notice Total assets deposited across all satellite vaults.
    uint256 public totalSatelliteAssets;

    /// @notice Tracks assets per satellite chain (chainIdHash => amount).
    mapping(bytes32 => uint256) public satelliteChainAssets;

    /// @notice Bifrost-specific strategy type identifier for the strategy intent.
    mapping(uint256 => uint8) public strategyBifrostType;
    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Deploy the ObidotVault.
    /// @param _asset         The underlying ERC-20 asset for the vault.
    /// @param _oracle        The Pyth AggregatorV3 oracle address.
    /// @param _depositCap    Initial deposit cap for the vault.
    /// @param _maxDailyLoss  Initial maximum daily loss threshold.
    /// @param _maxRefTime    Initial maximum XCM refTime.
    /// @param _maxProofSize  Initial maximum XCM proofSize.
    /// @param _admin         The admin address receiving DEFAULT_ADMIN_ROLE.
    constructor(
        IERC20 _asset,
        address _oracle,
        uint256 _depositCap,
        uint256 _maxDailyLoss,
        uint64 _maxRefTime,
        uint64 _maxProofSize,
        address _admin
    ) ERC4626(_asset) ERC20("Obidot Vault Share", "obVAULT") {
        if (_oracle == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_depositCap == 0) revert InvalidCap();

        priceOracle = IAggregatorV3(_oracle);
        depositCap = _depositCap;
        maxDailyLoss = _maxDailyLoss;
        maxXcmRefTime = _maxRefTime;
        maxXcmProofSize = _maxProofSize;
        lastLossResetTimestamp = block.timestamp;

        // EIP-712 domain separator (cached for gas; recomputed on fork)
        _deploymentChainId = block.chainid;
        _cachedDomainSeparator = _computeDomainSeparator();

        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(KEEPER_ROLE, _admin);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-4626 Overrides — Accounting
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns total assets under management: local idle + remote deployed.
    /// @dev In emergency mode, only local idle balance is considered to enable
    ///      proportional emergency withdrawals without being blocked by remote accounting.
    function totalAssets() public view override returns (uint256) {
        if (emergencyMode) {
            return IERC20(asset()).balanceOf(address(this));
        }
        return IERC20(asset()).balanceOf(address(this)) + totalRemoteAssets;
    }

    /// @notice Anti-inflation-attack offset: adds 10^3 virtual shares.
    /// @dev Mitigates the ERC-4626 inflation attack by ensuring the share price
    ///      cannot be manipulated with small amounts during low-liquidity states.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-4626 Overrides — Deposit Caps
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

    /// @notice Maximum withdrawable assets when paused returns 0.
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused() && !emergencyMode) return 0;
        return super.maxWithdraw(owner);
    }

    /// @notice Maximum redeemable shares when paused returns 0.
    function maxRedeem(address owner) public view override returns (uint256) {
        if (paused() && !emergencyMode) return 0;
        return super.maxRedeem(owner);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-4626 Overrides — Guarded Entry/Exit
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        return super.deposit(assets, receiver);
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
        if (paused() && !emergencyMode) revert EnforcedPause();
        return super.withdraw(assets, receiver, owner);
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        if (paused() && !emergencyMode) revert EnforcedPause();
        return super.redeem(shares, receiver, owner);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Core — Strategy Execution
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Execute a signed strategy intent: verify signature, enforce policies,
    ///         validate oracle price, estimate XCM weight, and dispatch via precompile.
    /// @dev Can be called by anyone (permissionless relaying). The EIP-712 signature
    ///      ensures only an authorized strategist can originate a valid intent.
    /// @param intent   The fully-populated strategy intent struct.
    /// @param signature The EIP-712 signature (65 bytes: r || s || v).
    /// @return strategyId The unique ID assigned to this strategy execution.
    function executeStrategy(StrategyIntent calldata intent, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 strategyId)
    {
        return _executeStrategySingle(intent, signature);
    }

    /// @dev Internal implementation of strategy execution (shared by single + batch).
    function _executeStrategySingle(StrategyIntent calldata intent, bytes calldata signature)
        internal
        returns (uint256 strategyId)
    {
        // ── 1. Deadline check ────────────────────────────────────────────
        if (block.timestamp > intent.deadline) {
            revert DeadlineExpired(intent.deadline, block.timestamp);
        }

        // ── 2. Basic validation ──────────────────────────────────────────
        if (intent.amount == 0) revert ZeroAmount();
        if (intent.asset != asset()) {
            revert AssetMismatch(asset(), intent.asset);
        }
        if (intent.maxSlippageBps > MAX_SLIPPAGE_BPS) {
            revert SlippageTooHigh(intent.maxSlippageBps);
        }

        // ── 3. Recover signer & verify STRATEGIST_ROLE ───────────────────
        address strategist = _recoverStrategist(intent, signature);
        if (strategist == address(0)) revert InvalidSignature();
        if (!hasRole(STRATEGIST_ROLE, strategist)) {
            revert UnauthorizedStrategist(strategist);
        }

        // ── 4. Nonce check & increment ───────────────────────────────────
        uint256 expectedNonce = nonces[strategist];
        if (intent.nonce != expectedNonce) {
            revert InvalidNonce(expectedNonce, intent.nonce);
        }
        unchecked {
            nonces[strategist] = expectedNonce + 1;
        }

        // ── 5. Policy Engine checks ──────────────────────────────────────
        _enforcePolicyEngine(intent);

        // ── 6. Oracle slippage validation ────────────────────────────────
        _enforceOracleSlippage(intent);

        // ── 7. XCM weight estimation ─────────────────────────────────────
        _enforceXcmWeight(intent.xcmCall);

        // ── 8. Update accounting & dispatch ──────────────────────────────
        uint256 idleBalance = IERC20(asset()).balanceOf(address(this));
        if (idleBalance < intent.amount) {
            revert InsufficientIdleBalance(idleBalance, intent.amount);
        }

        // Assign strategy ID
        strategyId = strategyCounter;
        unchecked {
            strategyCounter = strategyId + 1;
        }

        // Update remote asset tracking
        totalRemoteAssets += intent.amount;

        // Update protocol exposure
        protocolExposure[intent.targetProtocol] += intent.amount;

        // Record the strategy
        strategies[strategyId] = StrategyRecord({
            status: StrategyStatus.Sent,
            strategist: strategist,
            amount: intent.amount,
            minReturn: intent.minReturn,
            targetParachain: intent.targetParachain,
            targetProtocol: intent.targetProtocol,
            executedAt: block.timestamp
        });

        // ── 9. Approve & dispatch XCM ────────────────────────────────────
        // Encode the destination from targetParachain using MultiLocation library
        bytes memory dest = MultiLocation.siblingParachain(MultiLocation.VERSION_V4, intent.targetParachain);

        // Approve the XCM precompile to spend the asset if needed
        // (The precompile handles the asset transfer within the XCM message)
        IERC20(asset()).forceApprove(address(XCM_PRECOMPILE), intent.amount);

        // Dispatch XCM
        XCM_PRECOMPILE.send(dest, intent.xcmCall);

        // ── 10. Emit event ───────────────────────────────────────────────
        emit StrategyExecuted(
            strategyId, strategist, intent.targetParachain, intent.targetProtocol, intent.amount, intent.minReturn
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Core — Strategy Outcome Reporting
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Report the outcome of a remote strategy execution.
    /// @dev Called by keepers after observing the cross-chain result.
    ///      Updates remote asset accounting and triggers circuit breaker on losses.
    /// @param strategyId     The strategy ID to report on.
    /// @param success        Whether the remote execution succeeded.
    /// @param returnedAmount The amount of assets returned to the vault.
    function reportStrategyOutcome(uint256 strategyId, bool success, uint256 returnedAmount)
        external
        onlyRole(KEEPER_ROLE)
        nonReentrant
    {
        StrategyRecord storage record = strategies[strategyId];
        if (record.executedAt == 0) revert StrategyNotFound(strategyId);
        if (record.status != StrategyStatus.Sent) {
            revert InvalidStrategyStatus(strategyId, record.status, StrategyStatus.Sent);
        }

        // Update strategy status
        record.status = success ? StrategyStatus.Executed : StrategyStatus.Failed;

        // Calculate P&L
        int256 pnl = int256(returnedAmount) - int256(record.amount);

        // Update remote assets: remove the deployed amount
        if (totalRemoteAssets >= record.amount) {
            totalRemoteAssets -= record.amount;
        } else {
            totalRemoteAssets = 0;
        }

        // Update protocol exposure
        if (protocolExposure[record.targetProtocol] >= record.amount) {
            protocolExposure[record.targetProtocol] -= record.amount;
        } else {
            protocolExposure[record.targetProtocol] = 0;
        }

        // ── Protocol Performance Scoring ─────────────────────────────────
        ProtocolPerformance storage perf = protocolPerformance[record.targetProtocol];
        perf.totalDeployed += record.amount;
        perf.totalReturned += returnedAmount;
        perf.executionCount += 1;
        if (success) {
            perf.successCount += 1;
        }
        perf.lastExecutedAt = block.timestamp;

        // ── Cumulative PnL Tracking ──────────────────────────────────────
        cumulativePnL += pnl;

        // ── Performance Fee (on profit only) ─────────────────────────────
        if (pnl > 0) {
            _accruePerformanceFee(uint256(pnl));
        }

        // Track losses for circuit breaker
        if (pnl < 0) {
            _resetDailyLossIfNeeded();
            uint256 loss = uint256(-pnl);
            dailyLossAccumulator += loss;

            // Circuit breaker: auto-pause if daily loss threshold exceeded
            if (dailyLossAccumulator > maxDailyLoss && maxDailyLoss > 0) {
                _pause();
                emergencyMode = true;
                emit EmergencyModeToggled(true);
            }
        }

        emit StrategyOutcomeReported(strategyId, record.status, returnedAmount, pnl);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Withdrawal Queue
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Request a withdrawal that will be queued with a timelock.
    /// @dev Burns the caller's shares immediately and queues the asset redemption.
    ///      If `withdrawalTimelock == 0`, this effectively acts as instant withdrawal.
    /// @param shares The number of vault shares to redeem.
    /// @return requestId The ID of the queued withdrawal request.
    function requestWithdrawal(uint256 shares) external nonReentrant returns (uint256 requestId) {
        if (shares == 0) revert ZeroAmount();

        // Calculate assets owed for these shares (using current exchange rate)
        uint256 assets = previewRedeem(shares);

        // Burn shares from the caller
        _burn(msg.sender, shares);

        // Create the withdrawal request
        requestId = withdrawalCounter;
        unchecked {
            withdrawalCounter = requestId + 1;
        }

        withdrawalRequests[requestId] = WithdrawalRequest({
            owner: msg.sender,
            shares: shares,
            assets: assets,
            claimableAt: block.timestamp + withdrawalTimelock
        });

        emit WithdrawalQueued(requestId, msg.sender, shares, assets);
    }

    /// @notice Fulfill a queued withdrawal after the timelock has expired.
    /// @dev Called by keepers or the withdrawal owner. Transfers assets to the owner.
    /// @param requestId The ID of the withdrawal request to fulfill.
    function fulfillWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.owner == address(0)) {
            revert WithdrawalNotFound(requestId);
        }
        if (block.timestamp < request.claimableAt) {
            revert WithdrawalNotClaimable(requestId, request.claimableAt);
        }

        uint256 idleBalance = IERC20(asset()).balanceOf(address(this));
        if (idleBalance < request.assets) {
            revert InsufficientIdleForWithdrawal(idleBalance, request.assets);
        }

        address owner = request.owner;
        uint256 assets = request.assets;

        // Clear the request
        delete withdrawalRequests[requestId];

        // Transfer assets to the owner
        SafeERC20.safeTransfer(IERC20(asset()), owner, assets);

        emit WithdrawalFulfilled(requestId, owner, assets);
    }

    /// @notice Cancel a pending withdrawal request and return shares to the owner.
    /// @dev Only the request owner can cancel. Mints shares back based on current rate.
    /// @param requestId The ID of the withdrawal request to cancel.
    function cancelWithdrawal(uint256 requestId) external nonReentrant {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        if (request.owner == address(0)) {
            revert WithdrawalNotFound(requestId);
        }
        if (request.owner != msg.sender) {
            revert NotWithdrawalOwner(requestId, msg.sender);
        }

        // Re-mint the original shares back to the owner
        uint256 shares = request.shares;
        address owner = request.owner;

        // Clear the request
        delete withdrawalRequests[requestId];

        // Mint shares back to the owner
        _mint(owner, shares);

        emit WithdrawalCancelled(requestId, owner);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Batch Strategy Execution
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Execute multiple strategies in a single transaction.
    /// @dev PVM call depth: batch(1) → executeStrategy(2) → XCM precompile(3). Safe (limit 5).
    /// @param intents Array of strategy intents to execute.
    /// @param signatures Corresponding EIP-712 signatures for each intent.
    /// @return strategyIds Array of assigned strategy IDs.
    function executeStrategies(StrategyIntent[] calldata intents, bytes[] calldata signatures)
        external
        whenNotPaused
        nonReentrant
        returns (uint256[] memory strategyIds)
    {
        uint256 len = intents.length;
        if (len != signatures.length) revert ArrayLengthMismatch();

        strategyIds = new uint256[](len);
        for (uint256 i = 0; i < len;) {
            strategyIds[i] = _executeStrategySingle(intents[i], signatures[i]);
            unchecked {
                ++i;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  EIP-712 Domain Separator (fork-safe)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the EIP-712 domain separator.
    /// @dev Uses the cached value when chain ID matches deployment; recomputes on fork.
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return block.chainid == _deploymentChainId ? _cachedDomainSeparator : _computeDomainSeparator();
    }

    /// @dev Compute the EIP-712 domain separator from scratch.
    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("ObidotVault"), keccak256("1"), block.chainid, address(this))
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — EIP-712 Signature Recovery
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Recover the strategist address from an EIP-712 signature over a StrategyIntent.
    function _recoverStrategist(StrategyIntent calldata intent, bytes calldata signature)
        internal
        view
        returns (address)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                STRATEGY_INTENT_TYPEHASH,
                intent.asset,
                intent.amount,
                intent.minReturn,
                intent.maxSlippageBps,
                intent.deadline,
                intent.nonce,
                keccak256(intent.xcmCall),
                intent.targetParachain,
                intent.targetProtocol
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));

        return _recover(digest, signature);
    }

    /// @dev Low-level ECDSA recovery using the ecrecover precompile at address 0x01.
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        // EIP-2: restrict s to lower half order to prevent malleability
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }

        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Policy Engine
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Enforce all risk policy constraints on a strategy intent.
    ///      Note: Not `view` because it resets the daily loss window if expired.
    function _enforcePolicyEngine(StrategyIntent calldata intent) internal {
        // Parachain whitelist
        if (!allowedParachains[intent.targetParachain]) {
            revert ParachainNotAllowed(intent.targetParachain);
        }

        // Protocol whitelist
        if (!allowedTargets[intent.targetProtocol]) {
            revert ProtocolNotAllowed(intent.targetProtocol);
        }

        // Protocol exposure cap
        uint256 currentExposure = protocolExposure[intent.targetProtocol];
        uint256 cap = maxProtocolExposure[intent.targetProtocol];
        if (cap > 0 && currentExposure + intent.amount > cap) {
            revert ExposureCapExceeded(intent.targetProtocol, currentExposure, intent.amount, cap);
        }

        // Reset daily loss window if 24h has elapsed (prevents stale accumulator blocking)
        _resetDailyLossIfNeeded();

        // Daily loss circuit breaker check (ensure we haven't already breached)
        if (maxDailyLoss > 0 && dailyLossAccumulator > maxDailyLoss) {
            revert DailyLossThresholdBreached(dailyLossAccumulator, 0, maxDailyLoss);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Oracle Slippage Enforcement
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Fetch oracle price and validate that `minReturn` meets the slippage bound.
    ///      Formula: oracleMinimum = amount * price * (BPS - maxSlippage) / (BPS * 10^decimals)
    ///      Revert if minReturn < oracleMinimum.
    ///      If an oracle registry is set, tries the registry first for asset-specific feeds,
    ///      falling back to the single priceOracle.
    function _enforceOracleSlippage(StrategyIntent calldata intent) internal view {
        int256 answer;
        uint8 oracleDecimals;
        uint256 updatedAt;

        if (address(oracleRegistry) != address(0) && oracleRegistry.hasFeed(intent.asset)) {
            // Use registry for asset-specific feed
            (answer, oracleDecimals, updatedAt) = oracleRegistry.getPrice(intent.asset);
        } else {
            // Fallback to single oracle (backward-compatible)
            (, answer,, updatedAt,) = priceOracle.latestRoundData();
            oracleDecimals = priceOracle.decimals();
        }

        // Validate oracle data freshness and positivity
        if (answer <= 0 || block.timestamp - updatedAt > ORACLE_STALENESS_THRESHOLD) {
            revert OracleDataInvalid(answer, updatedAt);
        }

        uint256 price = uint256(answer);

        // Calculate minimum acceptable return based on oracle price and slippage
        // oracleMinimum = amount * price * (BPS_DENOMINATOR - maxSlippageBps) / (BPS_DENOMINATOR * 10^oracleDecimals)
        uint256 oracleMinimum = intent.amount.mulDiv(
            price * (BPS_DENOMINATOR - intent.maxSlippageBps),
            BPS_DENOMINATOR * (10 ** oracleDecimals),
            Math.Rounding.Ceil // Round up to be conservative (higher minimum)
        );

        if (intent.minReturn < oracleMinimum) {
            revert OracleSlippageCheckFailed(intent.minReturn, oracleMinimum);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — XCM Weight Estimation
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Estimate the XCM message weight and revert if it exceeds limits
    ///      after applying the safety margin buffer.
    function _enforceXcmWeight(bytes calldata xcmCall) internal view {
        (uint64 refTime, uint64 proofSize) = XCM_PRECOMPILE.weighMessage(xcmCall);

        // Apply safety margin: estimated * 110 / 100
        uint64 adjustedRefTime = (refTime * XCM_WEIGHT_SAFETY_MARGIN) / WEIGHT_MARGIN_DENOMINATOR;
        uint64 adjustedProofSize = (proofSize * XCM_WEIGHT_SAFETY_MARGIN) / WEIGHT_MARGIN_DENOMINATOR;

        if (adjustedRefTime > maxXcmRefTime || adjustedProofSize > maxXcmProofSize) {
            revert XcmOverweight(adjustedRefTime, adjustedProofSize, maxXcmRefTime, maxXcmProofSize);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Daily Loss Tracking
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Reset the daily loss accumulator if the current window has elapsed.
    function _resetDailyLossIfNeeded() internal {
        if (block.timestamp >= lastLossResetTimestamp + DAILY_WINDOW) {
            dailyLossAccumulator = 0;
            lastLossResetTimestamp = block.timestamp;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Performance Fee Accrual
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Accrue performance fee on profit by minting vault shares to treasury.
    ///      Only charges fees on new profit above the high-water mark.
    function _accruePerformanceFee(uint256 profit) internal {
        if (performanceFeeBps == 0 || feeTreasury == address(0)) return;

        uint256 currentTotalAssets = totalAssets();

        // Only charge fee if total assets exceed the high-water mark
        if (currentTotalAssets <= highWaterMark) return;

        // Fee only on the portion above the high-water mark
        uint256 profitAboveHWM = currentTotalAssets - highWaterMark;
        // Cap to actual profit from this outcome
        if (profitAboveHWM > profit) {
            profitAboveHWM = profit;
        }

        uint256 feeAssets = (profitAboveHWM * performanceFeeBps) / BPS_DENOMINATOR;
        if (feeAssets == 0) return;

        // Mint fee shares to treasury (using previewDeposit for correct conversion)
        uint256 feeShares = previewDeposit(feeAssets);
        if (feeShares == 0) return;

        _mint(feeTreasury, feeShares);

        // Update high-water mark
        highWaterMark = currentTotalAssets;

        emit PerformanceFeeMinted(feeTreasury, feeShares);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Policy Engine Configuration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Add or remove a parachain from the allowed whitelist.
    function setParachainAllowed(uint32 parachainId, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedParachains[parachainId] = allowed;
        emit ParachainWhitelistUpdated(parachainId, allowed);
    }

    /// @notice Add or remove a protocol from the allowed whitelist.
    function setProtocolAllowed(address protocol, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (protocol == address(0)) revert ZeroAddress();
        allowedTargets[protocol] = allowed;
        emit ProtocolWhitelistUpdated(protocol, allowed);
    }

    /// @notice Set the maximum capital exposure cap for a protocol.
    function setProtocolExposureCap(address protocol, uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (protocol == address(0)) revert ZeroAddress();
        maxProtocolExposure[protocol] = cap;
        emit ExposureCapUpdated(protocol, cap);
    }

    /// @notice Update the maximum daily loss threshold.
    function setMaxDailyLoss(uint256 newMaxDailyLoss) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxDailyLoss = newMaxDailyLoss;
        emit DailyLossThresholdUpdated(newMaxDailyLoss);
    }

    /// @notice Update the deposit cap.
    function setDepositCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0) revert InvalidCap();
        depositCap = newCap;
        emit DepositCapUpdated(newCap);
    }

    /// @notice Update the oracle address.
    function setOracle(address newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newOracle == address(0)) revert ZeroAddress();
        priceOracle = IAggregatorV3(newOracle);
        emit OracleUpdated(newOracle);
    }

    /// @notice Set the optional oracle registry for multi-asset price feeds.
    /// @dev Setting to address(0) disables registry usage (falls back to priceOracle).
    /// @param _registry The OracleRegistry contract address.
    function setOracleRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        oracleRegistry = OracleRegistry(_registry);
        emit OracleRegistryUpdated(_registry);
    }

    /// @notice Update XCM weight limits.
    function setXcmWeightLimits(uint64 _maxRefTime, uint64 _maxProofSize) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxXcmRefTime = _maxRefTime;
        maxXcmProofSize = _maxProofSize;
        emit XcmWeightLimitsUpdated(_maxRefTime, _maxProofSize);
    }

    /// @notice Set the withdrawal timelock duration.
    /// @param newTimelock The new timelock duration in seconds (0 = instant).
    function setWithdrawalTimelock(uint256 newTimelock) external onlyRole(DEFAULT_ADMIN_ROLE) {
        withdrawalTimelock = newTimelock;
        emit WithdrawalTimelockUpdated(newTimelock);
    }

    /// @notice Set the performance fee rate and treasury.
    /// @param _feeBps Performance fee in basis points (max 3000 = 30%).
    /// @param _treasury Address to receive fee shares.
    function setPerformanceFee(uint256 _feeBps, address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_feeBps > 3000) revert FeeTooHigh(_feeBps);
        if (_feeBps > 0 && _treasury == address(0)) revert ZeroAddress();
        performanceFeeBps = _feeBps;
        feeTreasury = _treasury;
        emit PerformanceFeeUpdated(_feeBps);
    }

    /// @notice Reset the high-water mark to current total assets.
    /// @dev Use with caution — only after major accounting adjustments.
    function resetHighWaterMark() external onlyRole(DEFAULT_ADMIN_ROLE) {
        highWaterMark = totalAssets();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Emergency Controls
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Pause the vault (blocks deposits and strategy execution).
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the vault.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        if (emergencyMode) {
            emergencyMode = false;
            emit EmergencyModeToggled(false);
        }
    }

    /// @notice Enable emergency mode: pauses vault and allows withdrawals
    ///         based only on local idle balance (ignoring remote assets).
    function enableEmergencyMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        emergencyMode = true;
        emit EmergencyModeToggled(true);
    }

    /// @notice Check if the oracle data for a given asset is fresh.
    /// @param asset The ERC-20 asset address to check.
    /// @return True if the oracle data is within the staleness threshold.
    function isOracleFresh(address asset) external view returns (bool) {
        if (address(oracleRegistry) != address(0) && oracleRegistry.hasFeed(asset)) {
            return !oracleRegistry.isFeedStale(asset);
        }
        // Fallback: check single oracle
        (,,, uint256 updatedAt,) = priceOracle.latestRoundData();
        return block.timestamp - updatedAt <= ORACLE_STALENESS_THRESHOLD;
    }

    /// @notice Manually adjust totalRemoteAssets in case of accounting discrepancies.
    /// @dev Should only be used in exceptional circumstances with governance oversight.
    function adjustRemoteAssets(uint256 newValue, string calldata reason) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldValue = totalRemoteAssets;
        totalRemoteAssets = newValue;
        emit RemoteAssetsAdjusted(oldValue, newValue, reason);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  View — Helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the idle (local, undeployed) assets in the vault.
    function idleAssets() external view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Returns the current daily loss window status.
    function dailyLossStatus() external view returns (uint256 accumulated, uint256 maxAllowed, uint256 windowResetAt) {
        accumulated = dailyLossAccumulator;
        maxAllowed = maxDailyLoss;
        windowResetAt = lastLossResetTimestamp + DAILY_WINDOW;
    }

    /// @notice Returns the performance metrics for a protocol.
    /// @param protocol The protocol address to query.
    function getProtocolPerformance(address protocol)
        external
        view
        returns (
            uint256 totalDeployed,
            uint256 totalReturned,
            uint256 executionCount,
            uint256 successCount,
            uint256 lastExecutedAt
        )
    {
        ProtocolPerformance storage perf = protocolPerformance[protocol];
        return (perf.totalDeployed, perf.totalReturned, perf.executionCount, perf.successCount, perf.lastExecutedAt);
    }

    /// @notice Returns a withdrawal request by ID.
    /// @param requestId The withdrawal request ID.
    function getWithdrawalRequest(uint256 requestId)
        external
        view
        returns (address owner, uint256 shares, uint256 assets, uint256 claimableAt)
    {
        WithdrawalRequest storage req = withdrawalRequests[requestId];
        return (req.owner, req.shares, req.assets, req.claimableAt);
    }

    /// @notice Returns vault-level performance summary.
    function performanceSummary()
        external
        view
        returns (int256 _cumulativePnL, uint256 _highWaterMark, uint256 _performanceFeeBps, address _feeTreasury)
    {
        return (cumulativePnL, highWaterMark, performanceFeeBps, feeTreasury);
    }

    /// @notice Compute the EIP-712 digest for a strategy intent (useful off-chain).
    function computeIntentDigest(StrategyIntent calldata intent) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                STRATEGY_INTENT_TYPEHASH,
                intent.asset,
                intent.amount,
                intent.minReturn,
                intent.maxSlippageBps,
                intent.deadline,
                intent.nonce,
                keccak256(intent.xcmCall),
                intent.targetParachain,
                intent.targetProtocol
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-165 — Interface Support
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Required override for AccessControl + ERC4626 diamond.
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Cross-Chain — Router & Adapter Configuration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Set the CrossChainRouter address for satellite vault communication.
    /// @param _router The CrossChainRouter contract address.
    function setCrossChainRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_router == address(0)) revert ZeroAddress();
        crossChainRouter = _router;
        emit CrossChainRouterUpdated(_router);
    }

    /// @notice Set the BifrostAdapter address for Bifrost DeFi operations.
    /// @param _adapter The BifrostAdapter contract address.
    function setBifrostAdapter(address _adapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_adapter == address(0)) revert ZeroAddress();
        bifrostAdapter = _adapter;
        emit BifrostAdapterUpdated(_adapter);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Cross-Chain — Satellite Asset Tracking
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Update satellite assets for a given chain (called by keeper after processing deposits).
    /// @param chainIdHash The keccak256 hash of the satellite chain identifier.
    /// @param amount The new total assets for that satellite chain.
    function updateSatelliteAssets(bytes32 chainIdHash, uint256 amount) external onlyRole(KEEPER_ROLE) {
        uint256 previousAmount = satelliteChainAssets[chainIdHash];
        satelliteChainAssets[chainIdHash] = amount;

        // Adjust global tracking
        if (amount > previousAmount) {
            totalSatelliteAssets += (amount - previousAmount);
        } else {
            uint256 diff = previousAmount - amount;
            if (totalSatelliteAssets >= diff) {
                totalSatelliteAssets -= diff;
            } else {
                totalSatelliteAssets = 0;
            }
        }

        emit SatelliteAssetsUpdated(chainIdHash, amount, totalSatelliteAssets);
    }

    /// @notice Returns the global total assets including satellite deposits.
    /// @dev Hub total + satellite deposits gives the cross-chain aggregate.
    function globalTotalAssets() external view returns (uint256) {
        return totalAssets() + totalSatelliteAssets;
    }

    /// @notice Returns the global total share supply (hub shares only for now).
    /// @dev In the multi-vault sync model, satellites track their own shares locally
    ///      and sync with the hub for pricing. The hub holds the authoritative share price.
    function globalTotalShares() external view returns (uint256) {
        return totalSupply();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Cross-Chain — Bifrost Strategy Support
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Get encoded XCM message for a Bifrost vToken mint operation.
    /// @dev Utility for the agent to preview the XCM payload before signing.
    /// @param currencyId The currency to stake (e.g., 0 for DOT).
    /// @param amount The amount to stake.
    /// @param beneficiary The Bifrost AccountId32 receiving vTokens.
    /// @return xcmMessage The encoded XCM message.
    /// @return dest The encoded destination MultiLocation.
    function previewBifrostMint(uint32 currencyId, uint256 amount, bytes32 beneficiary)
        external
        pure
        returns (bytes memory xcmMessage, bytes memory dest)
    {
        xcmMessage = BifrostCodec.encodeMintVToken(currencyId, amount, beneficiary);
        dest = BifrostCodec.bifrostDestination();
    }

    /// @notice Get encoded XCM message for a Bifrost DEX swap.
    /// @param currencyIn Input currency ID.
    /// @param currencyOut Output currency ID.
    /// @param amountIn Amount to swap.
    /// @param amountOutMin Minimum output (slippage protection).
    /// @param beneficiary The Bifrost AccountId32.
    /// @return xcmMessage The encoded XCM message.
    function previewBifrostSwap(
        uint32 currencyIn,
        uint32 currencyOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes32 beneficiary
    ) external pure returns (bytes memory xcmMessage) {
        xcmMessage = BifrostCodec.encodeDEXSwap(currencyIn, currencyOut, amountIn, amountOutMin, beneficiary);
    }
}
