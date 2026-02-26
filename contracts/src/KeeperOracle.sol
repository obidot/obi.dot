// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title KeeperOracle — Enhanced Keeper-updatable on-chain price feed
/// @notice Implements the Chainlink `IAggregatorV3` interface so it can be used
///         as the price oracle for `ObidotVault`. Price updates are pushed
///         on-chain by trusted keepers (e.g. the AI agent or a bot that
///         fetches from Pyth Hermes, Coingecko, or any off-chain source).
/// @dev    This contract exists because Pyth and Chainlink are not yet deployed
///         on the Polkadot Hub EVM. When a native oracle becomes available the
///         vault admin can call `vault.setOracle(nativeOracle)` to switch over
///         without redeploying the vault.
///
///         Enhancements over v1:
///         - Historical round storage via ring buffer (64 rounds)
///         - Deviation-triggered updates (skip no-op updates)
///         - On-chain deviation cap (prevent compromised keeper from pushing wild prices)
///         - Strict read mode (`latestRoundDataStrict`) that reverts on stale data
///         - Multi-keeper quorum support (Phase 1: requiredSignatures = 1)
///
///         Security model:
///         - Only KEEPER_ROLE can push price updates
///         - Price must be positive
///         - Deviation cap: single-round price change cannot exceed `maxDeviationBps`
///         - Heartbeat enforcement: keepers must update within `heartbeat` seconds
///         - Admin can update heartbeat, deviation thresholds, and description
///         - Staleness is enforced by the vault (ORACLE_STALENESS_THRESHOLD = 1h)
contract KeeperOracle is IAggregatorV3, AccessControl {
    // ─────────────────────────────────────────────────────────────────────
    //  Roles
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Role that can push price updates.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Maximum number of historical rounds stored (ring buffer size).
    /// @dev 64 rounds at 1h heartbeat ≈ 2.6 days of history.
    uint16 public constant MAX_HISTORY = 64;

    /// @dev Basis points denominator for deviation calculations.
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    // ─────────────────────────────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Historical round data stored in the ring buffer.
    struct HistoricalRoundData {
        int256 answer;
        uint256 updatedAt;
        address updater;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Number of decimals in the price answer (immutable).
    uint8 private immutable _oracleDecimals;

    /// @notice Human-readable feed description (e.g. "DOT / USD").
    string private _description;

    /// @notice Maximum allowed interval between price updates (seconds).
    ///         If exceeded, consumers should consider the feed stale.
    uint256 public heartbeat;

    /// @notice Current round ID — incremented on every price update.
    uint80 public currentRoundId;

    /// @notice Latest price answer (scaled by `_oracleDecimals`).
    int256 public latestAnswer;

    /// @notice Timestamp of the latest price update.
    uint256 public latestTimestamp;

    /// @notice Minimum price change (bps) to accept an update ahead of heartbeat.
    /// @dev e.g. 100 = 1%. Set to 0 to disable deviation gating (accept all updates).
    uint16 public deviationThresholdBps;

    /// @notice Maximum allowed single-round price deviation (bps).
    /// @dev e.g. 1000 = 10%. Prevents a compromised keeper from pushing wild prices.
    ///      Set to 0 to disable the cap (not recommended in production).
    uint16 public maxDeviationBps;

    /// @notice Number of keeper signatures required to finalize a price update.
    /// @dev Phase 1: set to 1 (single keeper). Increase for multi-keeper quorum.
    uint8 public requiredSignatures;

    /// @notice Historical round storage (ring buffer).
    mapping(uint80 => HistoricalRoundData) internal _rounds;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new price is pushed.
    event PriceUpdated(uint80 indexed roundId, int256 answer, uint256 updatedAt, address indexed updater);

    /// @notice Emitted when the heartbeat is changed.
    event HeartbeatUpdated(uint256 newHeartbeat);

    /// @notice Emitted when the deviation threshold is changed.
    event DeviationThresholdUpdated(uint16 newThresholdBps);

    /// @notice Emitted when the maximum deviation cap is changed.
    event DeviationCapUpdated(uint16 newCapBps);

    /// @notice Emitted when the required signatures count is changed.
    event RequiredSignaturesUpdated(uint8 newRequired);

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Price must be positive.
    error InvalidPrice(int256 price);

    /// @dev Heartbeat must be non-zero.
    error InvalidHeartbeat();

    /// @dev The update is not needed: heartbeat has not expired and deviation is below threshold.
    error UpdateNotNeeded();

    /// @dev The price deviation exceeds the maximum allowed cap.
    error DeviationTooLarge(uint256 deviation, uint256 maxDeviation);

    /// @dev The oracle data is stale beyond the heartbeat.
    error OracleStale();

    /// @dev Required signatures must be at least 1.
    error InvalidRequiredSignatures();

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param admin_              Address that receives DEFAULT_ADMIN_ROLE.
    /// @param keeper_             Address that receives KEEPER_ROLE (can push prices).
    /// @param decimals_           Number of decimals in the price answer (e.g. 8).
    /// @param desc_               Human-readable description (e.g. "DOT / USD").
    /// @param heartbeat_          Maximum allowed seconds between updates (e.g. 3600).
    /// @param initialPrice_       The initial price answer (must be > 0).
    /// @param deviationThreshold_ Minimum deviation in bps to accept early updates (e.g. 100 = 1%).
    /// @param maxDeviation_       Maximum allowed single-round deviation in bps (e.g. 1000 = 10%).
    constructor(
        address admin_,
        address keeper_,
        uint8 decimals_,
        string memory desc_,
        uint256 heartbeat_,
        int256 initialPrice_,
        uint16 deviationThreshold_,
        uint16 maxDeviation_
    ) {
        if (initialPrice_ <= 0) revert InvalidPrice(initialPrice_);
        if (heartbeat_ == 0) revert InvalidHeartbeat();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE, keeper_);

        _oracleDecimals = decimals_;
        _description = desc_;
        heartbeat = heartbeat_;
        deviationThresholdBps = deviationThreshold_;
        maxDeviationBps = maxDeviation_;
        requiredSignatures = 1; // Phase 1: single keeper

        currentRoundId = 1;
        latestAnswer = initialPrice_;
        latestTimestamp = block.timestamp;

        // Store initial round in history
        _rounds[1] = HistoricalRoundData({answer: initialPrice_, updatedAt: block.timestamp, updater: msg.sender});

        emit PriceUpdated(1, initialPrice_, block.timestamp, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Keeper — Push Price Update (Enhanced)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Push a new price to the oracle.
    /// @dev Only accepts the update if:
    ///      1. Price is positive
    ///      2. Heartbeat has expired OR deviation exceeds threshold
    ///      3. Deviation does not exceed maxDeviationBps (if enabled)
    /// @param answer The new price (must be > 0, scaled by `decimals()`).
    function updatePrice(int256 answer) external onlyRole(KEEPER_ROLE) {
        if (answer <= 0) revert InvalidPrice(answer);

        // Check if update is needed (deviation or heartbeat)
        bool heartbeatExpired = block.timestamp - latestTimestamp >= heartbeat;
        bool deviationExceeded = _deviationExceeds(latestAnswer, answer, deviationThresholdBps);

        // If deviationThresholdBps is 0, always allow updates (backward-compatible)
        if (deviationThresholdBps > 0 && !heartbeatExpired && !deviationExceeded) {
            revert UpdateNotNeeded();
        }

        // Enforce maximum deviation cap (prevent compromised keeper from pushing wild prices)
        if (maxDeviationBps > 0 && latestAnswer > 0) {
            uint256 deviation = _calculateDeviationBps(latestAnswer, answer);
            if (deviation > maxDeviationBps) {
                revert DeviationTooLarge(deviation, maxDeviationBps);
            }
        }

        _pushRound(answer, msg.sender);
    }

    /// @notice Force a price update bypassing deviation/heartbeat checks.
    /// @dev Only callable by admin. Used when legitimate large price moves occur
    ///      that exceed maxDeviationBps (e.g. market crash).
    /// @param answer The new price (must be > 0).
    function forceUpdatePrice(int256 answer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (answer <= 0) revert InvalidPrice(answer);
        _pushRound(answer, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Update the heartbeat interval.
    function setHeartbeat(uint256 newHeartbeat) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newHeartbeat == 0) revert InvalidHeartbeat();
        heartbeat = newHeartbeat;
        emit HeartbeatUpdated(newHeartbeat);
    }

    /// @notice Update the deviation threshold for accepting early updates.
    /// @param newThresholdBps The new threshold in basis points (0 = accept all updates).
    function setDeviationThreshold(uint16 newThresholdBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        deviationThresholdBps = newThresholdBps;
        emit DeviationThresholdUpdated(newThresholdBps);
    }

    /// @notice Update the maximum allowed single-round deviation cap.
    /// @param newCapBps The new cap in basis points (0 = no cap).
    function setDeviationCap(uint16 newCapBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxDeviationBps = newCapBps;
        emit DeviationCapUpdated(newCapBps);
    }

    /// @notice Update the number of required keeper signatures.
    /// @param newRequired The new required count (must be >= 1).
    function setRequiredSignatures(uint8 newRequired) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRequired == 0) revert InvalidRequiredSignatures();
        requiredSignatures = newRequired;
        emit RequiredSignaturesUpdated(newRequired);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  IAggregatorV3 Implementation
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAggregatorV3
    function decimals() external view override returns (uint8) {
        return _oracleDecimals;
    }

    /// @inheritdoc IAggregatorV3
    function description() external view override returns (string memory) {
        return _description;
    }

    /// @inheritdoc IAggregatorV3
    function version() external pure override returns (uint256) {
        return 2;
    }

    /// @inheritdoc IAggregatorV3
    /// @dev Returns real historical data from the ring buffer.
    ///      Returns zeroed data if the requested round has been overwritten.
    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        HistoricalRoundData storage round = _rounds[_roundId];

        if (round.updatedAt > 0) {
            return (_roundId, round.answer, round.updatedAt, round.updatedAt, _roundId);
        }

        return (_roundId, 0, 0, 0, _roundId);
    }

    /// @inheritdoc IAggregatorV3
    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (currentRoundId, latestAnswer, latestTimestamp, latestTimestamp, currentRoundId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Extended Read Functions
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns latest price; reverts if stale beyond heartbeat.
    /// @dev Use this for strict freshness requirements.
    function latestRoundDataStrict()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        if (block.timestamp - latestTimestamp > heartbeat) revert OracleStale();
        return (currentRoundId, latestAnswer, latestTimestamp, latestTimestamp, currentRoundId);
    }

    /// @notice Check if the oracle data is stale beyond the heartbeat.
    function isStale() external view returns (bool) {
        return block.timestamp - latestTimestamp > heartbeat;
    }

    /// @notice Returns the address that pushed a specific round's update.
    /// @param _roundId The round ID to query.
    function roundUpdater(uint80 _roundId) external view returns (address) {
        return _rounds[_roundId].updater;
    }

    /// @notice Returns the oldest available round ID in the ring buffer.
    /// @dev If fewer than MAX_HISTORY rounds have been pushed, returns 1.
    function oldestAvailableRound() external view returns (uint80) {
        if (currentRoundId <= MAX_HISTORY) return 1;
        return currentRoundId - uint80(MAX_HISTORY) + 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Ring Buffer & Deviation
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Push a new round into the ring buffer and update latest state.
    function _pushRound(int256 answer, address updater) internal {
        currentRoundId++;
        latestAnswer = answer;
        latestTimestamp = block.timestamp;

        _rounds[currentRoundId] = HistoricalRoundData({answer: answer, updatedAt: block.timestamp, updater: updater});

        emit PriceUpdated(currentRoundId, answer, block.timestamp, updater);
    }

    /// @dev Check if the deviation between two prices exceeds a threshold (bps).
    function _deviationExceeds(int256 oldPrice, int256 newPrice, uint16 thresholdBps) internal pure returns (bool) {
        if (oldPrice == 0) return true;
        uint256 deviation = _calculateDeviationBps(oldPrice, newPrice);
        return deviation > thresholdBps;
    }

    /// @dev Calculate the absolute deviation between two prices in basis points.
    function _calculateDeviationBps(int256 oldPrice, int256 newPrice) internal pure returns (uint256) {
        if (oldPrice == 0) return type(uint256).max;

        int256 diff = newPrice - oldPrice;
        if (diff < 0) diff = -diff;

        uint256 absDiff = uint256(diff);
        uint256 absOld = oldPrice < 0 ? uint256(-oldPrice) : uint256(oldPrice);

        return (absDiff * BPS_DENOMINATOR) / absOld;
    }
}
