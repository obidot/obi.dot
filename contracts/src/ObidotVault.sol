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
import {MultiLocation} from "./libraries/MultiLocation.sol";

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

    /// @notice XCM precompile address on Polkadot Hub EVM.
    IXcm public constant XCM_PRECOMPILE =
        IXcm(0x00000000000000000000000000000000000a0000);

    /// @notice EIP-712 domain typehash.
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    /// @notice EIP-712 typehash for the StrategyIntent struct.
    bytes32 public constant STRATEGY_INTENT_TYPEHASH =
        keccak256(
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
    error ExposureCapExceeded(
        address protocol,
        uint256 currentExposure,
        uint256 amount,
        uint256 cap
    );

    /// @dev The strategy loss would exceed the daily loss threshold.
    error DailyLossThresholdBreached(
        uint256 currentLoss,
        uint256 additionalLoss,
        uint256 maxLoss
    );

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
    error XcmOverweight(
        uint64 estimatedRefTime,
        uint64 estimatedProofSize,
        uint64 maxRefTime,
        uint64 maxProofSize
    );

    /// @dev The deposit would exceed the vault's deposit cap.
    error DepositCapExceeded(uint256 totalAfterDeposit, uint256 cap);

    /// @dev The strategy ID does not exist.
    error StrategyNotFound(uint256 strategyId);

    /// @dev The strategy is not in the expected status for this operation.
    error InvalidStrategyStatus(
        uint256 strategyId,
        StrategyStatus current,
        StrategyStatus expected
    );

    /// @dev A zero address was provided where a valid address is required.
    error ZeroAddress();

    /// @dev The cap value is invalid (zero).
    error InvalidCap();

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
        uint256 indexed strategyId,
        StrategyStatus newStatus,
        uint256 returnedAmount,
        int256 pnl
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
    event RemoteAssetsAdjusted(
        uint256 oldValue,
        uint256 newValue,
        string reason
    );

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice EIP-712 domain separator, computed at deployment.
    bytes32 public immutable DOMAIN_SEPARATOR;

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

        // EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("ObidotVault"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

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
    function deposit(
        uint256 assets,
        address receiver
    ) public override whenNotPaused nonReentrant returns (uint256) {
        return super.deposit(assets, receiver);
    }

    /// @inheritdoc ERC4626
    function mint(
        uint256 shares,
        address receiver
    ) public override whenNotPaused nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    /// @inheritdoc ERC4626
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        if (paused() && !emergencyMode) revert EnforcedPause();
        return super.withdraw(assets, receiver, owner);
    }

    /// @inheritdoc ERC4626
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
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
    function executeStrategy(
        StrategyIntent calldata intent,
        bytes calldata signature
    ) external whenNotPaused nonReentrant returns (uint256 strategyId) {
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
        bytes memory dest = MultiLocation.siblingParachain(
            MultiLocation.VERSION_V4,
            intent.targetParachain
        );

        // Approve the XCM precompile to spend the asset if needed
        // (The precompile handles the asset transfer within the XCM message)
        IERC20(asset()).forceApprove(address(XCM_PRECOMPILE), intent.amount);

        // Dispatch XCM
        XCM_PRECOMPILE.send(dest, intent.xcmCall);

        // ── 10. Emit event ───────────────────────────────────────────────
        emit StrategyExecuted(
            strategyId,
            strategist,
            intent.targetParachain,
            intent.targetProtocol,
            intent.amount,
            intent.minReturn
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
    function reportStrategyOutcome(
        uint256 strategyId,
        bool success,
        uint256 returnedAmount
    ) external onlyRole(KEEPER_ROLE) nonReentrant {
        StrategyRecord storage record = strategies[strategyId];
        if (record.executedAt == 0) revert StrategyNotFound(strategyId);
        if (record.status != StrategyStatus.Sent) {
            revert InvalidStrategyStatus(
                strategyId,
                record.status,
                StrategyStatus.Sent
            );
        }

        // Update strategy status
        record.status = success
            ? StrategyStatus.Executed
            : StrategyStatus.Failed;

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

        emit StrategyOutcomeReported(
            strategyId,
            record.status,
            returnedAmount,
            pnl
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — EIP-712 Signature Recovery
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Recover the strategist address from an EIP-712 signature over a StrategyIntent.
    function _recoverStrategist(
        StrategyIntent calldata intent,
        bytes calldata signature
    ) internal view returns (address) {
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

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        return _recover(digest, signature);
    }

    /// @dev Low-level ECDSA recovery using the ecrecover precompile at address 0x01.
    function _recover(
        bytes32 digest,
        bytes calldata signature
    ) internal pure returns (address) {
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
        if (
            uint256(s) >
            0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        ) {
            return address(0);
        }

        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Policy Engine
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Enforce all risk policy constraints on a strategy intent.
    function _enforcePolicyEngine(
        StrategyIntent calldata intent
    ) internal view {
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
            revert ExposureCapExceeded(
                intent.targetProtocol,
                currentExposure,
                intent.amount,
                cap
            );
        }

        // Daily loss circuit breaker check (ensure we haven't already breached)
        if (maxDailyLoss > 0 && dailyLossAccumulator > maxDailyLoss) {
            revert DailyLossThresholdBreached(
                dailyLossAccumulator,
                0,
                maxDailyLoss
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Oracle Slippage Enforcement
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Fetch oracle price and validate that `minReturn` meets the slippage bound.
    ///      Formula: oracleMinimum = amount * price * (BPS - maxSlippage) / (BPS * 10^decimals)
    ///      Revert if minReturn < oracleMinimum.
    function _enforceOracleSlippage(
        StrategyIntent calldata intent
    ) internal view {
        (, int256 answer, , uint256 updatedAt, ) = priceOracle
            .latestRoundData();

        // Validate oracle data freshness and positivity
        if (
            answer <= 0 ||
            block.timestamp - updatedAt > ORACLE_STALENESS_THRESHOLD
        ) {
            revert OracleDataInvalid(answer, updatedAt);
        }

        uint8 oracleDecimals = priceOracle.decimals();
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
        (uint64 refTime, uint64 proofSize) = XCM_PRECOMPILE.weighMessage(
            xcmCall
        );

        // Apply safety margin: estimated * 110 / 100
        uint64 adjustedRefTime = (refTime * XCM_WEIGHT_SAFETY_MARGIN) /
            WEIGHT_MARGIN_DENOMINATOR;
        uint64 adjustedProofSize = (proofSize * XCM_WEIGHT_SAFETY_MARGIN) /
            WEIGHT_MARGIN_DENOMINATOR;

        if (
            adjustedRefTime > maxXcmRefTime ||
            adjustedProofSize > maxXcmProofSize
        ) {
            revert XcmOverweight(
                adjustedRefTime,
                adjustedProofSize,
                maxXcmRefTime,
                maxXcmProofSize
            );
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
    //  Admin — Policy Engine Configuration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Add or remove a parachain from the allowed whitelist.
    function setParachainAllowed(
        uint32 parachainId,
        bool allowed
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedParachains[parachainId] = allowed;
        emit ParachainWhitelistUpdated(parachainId, allowed);
    }

    /// @notice Add or remove a protocol from the allowed whitelist.
    function setProtocolAllowed(
        address protocol,
        bool allowed
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (protocol == address(0)) revert ZeroAddress();
        allowedTargets[protocol] = allowed;
        emit ProtocolWhitelistUpdated(protocol, allowed);
    }

    /// @notice Set the maximum capital exposure cap for a protocol.
    function setProtocolExposureCap(
        address protocol,
        uint256 cap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (protocol == address(0)) revert ZeroAddress();
        maxProtocolExposure[protocol] = cap;
        emit ExposureCapUpdated(protocol, cap);
    }

    /// @notice Update the maximum daily loss threshold.
    function setMaxDailyLoss(
        uint256 newMaxDailyLoss
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxDailyLoss = newMaxDailyLoss;
        emit DailyLossThresholdUpdated(newMaxDailyLoss);
    }

    /// @notice Update the deposit cap.
    function setDepositCap(
        uint256 newCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0) revert InvalidCap();
        depositCap = newCap;
        emit DepositCapUpdated(newCap);
    }

    /// @notice Update the oracle address.
    function setOracle(
        address newOracle
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newOracle == address(0)) revert ZeroAddress();
        priceOracle = IAggregatorV3(newOracle);
        emit OracleUpdated(newOracle);
    }

    /// @notice Update XCM weight limits.
    function setXcmWeightLimits(
        uint64 _maxRefTime,
        uint64 _maxProofSize
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxXcmRefTime = _maxRefTime;
        maxXcmProofSize = _maxProofSize;
        emit XcmWeightLimitsUpdated(_maxRefTime, _maxProofSize);
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

    /// @notice Manually adjust totalRemoteAssets in case of accounting discrepancies.
    /// @dev Should only be used in exceptional circumstances with governance oversight.
    function adjustRemoteAssets(
        uint256 newValue,
        string calldata reason
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
    function dailyLossStatus()
        external
        view
        returns (uint256 accumulated, uint256 maxAllowed, uint256 windowResetAt)
    {
        accumulated = dailyLossAccumulator;
        maxAllowed = maxDailyLoss;
        windowResetAt = lastLossResetTimestamp + DAILY_WINDOW;
    }

    /// @notice Compute the EIP-712 digest for a strategy intent (useful off-chain).
    function computeIntentDigest(
        StrategyIntent calldata intent
    ) external view returns (bytes32) {
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
        return
            keccak256(
                abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
            );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  ERC-165 — Interface Support
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Required override for AccessControl + ERC4626 diamond.
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
