// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title OracleRegistry — Multi-asset oracle feed registry
/// @notice Maps ERC-20 asset addresses to their respective `IAggregatorV3`-compatible
///         oracle feeds (KeeperOracle, PythAggregatorV3, etc.). Enables the vault and
///         the off-chain agent to manage multiple price feeds in a single location.
/// @dev    Design decisions:
///         - Each asset maps to exactly one active oracle feed.
///         - Feeds can be disabled without deletion (for hot-swap scenarios).
///         - `getPrice()` reverts if the feed is inactive or missing.
///         - `validateSlippage()` mirrors `ObidotVault._enforceOracleSlippage()` logic
///           but works for any registered asset.
///         - Enumeration via `registeredAssets` array for off-chain indexing.
///         - When Pyth deploys on Polkadot Hub, individual feeds can be swapped
///           without touching the vault contract.
contract OracleRegistry is AccessControl {
    using Math for uint256;

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Basis points denominator for slippage calculations.
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    // ─────────────────────────────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Configuration for a single oracle feed.
    struct OracleFeed {
        /// @notice The IAggregatorV3-compatible oracle contract.
        IAggregatorV3 oracle;
        /// @notice Expected update interval in seconds.
        uint256 heartbeat;
        /// @notice Deviation threshold for alerting (bps). Informational only.
        uint16 deviationBps;
        /// @notice Whether this feed is currently active.
        bool active;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Asset address → OracleFeed configuration.
    mapping(address => OracleFeed) public feeds;

    /// @notice List of all registered asset addresses (for enumeration).
    address[] public registeredAssets;

    /// @notice Quick lookup: has this asset been registered before?
    mapping(address => bool) internal _isRegistered;

    // ─────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a feed is registered or updated.
    event FeedSet(address indexed asset, address indexed oracle, uint256 heartbeat, uint16 deviationBps);

    /// @notice Emitted when a feed is disabled.
    event FeedDisabled(address indexed asset);

    /// @notice Emitted when a feed is re-enabled.
    event FeedEnabled(address indexed asset);

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev The asset address is zero.
    error ZeroAddress();

    /// @dev The oracle address is zero.
    error ZeroOracleAddress();

    /// @dev The heartbeat is zero.
    error ZeroHeartbeat();

    /// @dev No active feed exists for this asset.
    error FeedNotFound(address asset);

    /// @dev The feed is disabled.
    error FeedInactive(address asset);

    /// @dev The oracle returned stale or invalid data.
    error OracleDataInvalid(address asset, int256 answer, uint256 updatedAt);

    /// @dev The minReturn does not meet the oracle-derived slippage bound.
    error SlippageValidationFailed(uint256 minReturn, uint256 oracleMinimum);

    // ─────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────

    /// @param admin_ Address that receives DEFAULT_ADMIN_ROLE.
    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Admin — Feed Management
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Register or update an oracle feed for an asset.
    /// @param asset The ERC-20 asset address.
    /// @param oracle The IAggregatorV3-compatible oracle address.
    /// @param heartbeat_ Expected update interval in seconds.
    /// @param deviationBps_ Deviation alert threshold in basis points.
    function setFeed(address asset, address oracle, uint256 heartbeat_, uint16 deviationBps_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (asset == address(0)) revert ZeroAddress();
        if (oracle == address(0)) revert ZeroOracleAddress();
        if (heartbeat_ == 0) revert ZeroHeartbeat();

        feeds[asset] = OracleFeed({
            oracle: IAggregatorV3(oracle),
            heartbeat: heartbeat_,
            deviationBps: deviationBps_,
            active: true
        });

        // Track in enumeration array (only add once)
        if (!_isRegistered[asset]) {
            registeredAssets.push(asset);
            _isRegistered[asset] = true;
        }

        emit FeedSet(asset, oracle, heartbeat_, deviationBps_);
    }

    /// @notice Disable a feed without removing it.
    /// @param asset The asset whose feed should be disabled.
    function disableFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_isRegistered[asset]) revert FeedNotFound(asset);
        feeds[asset].active = false;
        emit FeedDisabled(asset);
    }

    /// @notice Re-enable a previously disabled feed.
    /// @param asset The asset whose feed should be re-enabled.
    function enableFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_isRegistered[asset]) revert FeedNotFound(asset);
        feeds[asset].active = true;
        emit FeedEnabled(asset);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Core — Price Reading
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Get the latest price for an asset. Reverts if no active feed.
    /// @param asset The asset address to query.
    /// @return price The latest price answer (raw, scaled by oracle decimals).
    /// @return oracleDecimals The number of decimals in the price.
    /// @return updatedAt Timestamp when the price was last updated.
    function getPrice(address asset) external view returns (int256 price, uint8 oracleDecimals, uint256 updatedAt) {
        OracleFeed storage feed = _getActiveFeed(asset);

        (, int256 answer,, uint256 _updatedAt,) = feed.oracle.latestRoundData();

        oracleDecimals = feed.oracle.decimals();
        return (answer, oracleDecimals, _updatedAt);
    }

    /// @notice Get the validated price for an asset, reverting if stale or non-positive.
    /// @dev Unlike `getPrice()`, this enforces freshness and positivity checks.
    /// @param asset The asset address to query.
    /// @return price The validated positive price (guaranteed > 0).
    /// @return oracleDecimals The number of decimals in the price.
    /// @return updatedAt Timestamp when the price was last updated.
    function getPriceStrict(address asset)
        external
        view
        returns (uint256 price, uint8 oracleDecimals, uint256 updatedAt)
    {
        OracleFeed storage feed = _getActiveFeed(asset);

        (, int256 answer,, uint256 _updatedAt,) = feed.oracle.latestRoundData();

        if (answer <= 0 || block.timestamp - _updatedAt > feed.heartbeat) {
            revert OracleDataInvalid(asset, answer, _updatedAt);
        }

        oracleDecimals = feed.oracle.decimals();
        return (uint256(answer), oracleDecimals, _updatedAt);
    }

    /// @notice Validate that a strategy's minReturn meets oracle slippage bounds.
    /// @dev Mirrors `ObidotVault._enforceOracleSlippage()` but works for any registered asset.
    /// @param asset The asset address.
    /// @param amount The strategy deployment amount.
    /// @param minReturn The minimum expected return.
    /// @param maxSlippageBps Maximum slippage in basis points.
    /// @return valid Whether minReturn meets the oracle minimum.
    /// @return oracleMinimum The computed oracle minimum return.
    function validateSlippage(address asset, uint256 amount, uint256 minReturn, uint16 maxSlippageBps)
        external
        view
        returns (bool valid, uint256 oracleMinimum)
    {
        OracleFeed storage feed = _getActiveFeed(asset);

        (, int256 answer,, uint256 updatedAt,) = feed.oracle.latestRoundData();

        // Validate oracle data
        if (answer <= 0 || block.timestamp - updatedAt > feed.heartbeat) {
            revert OracleDataInvalid(asset, answer, updatedAt);
        }

        uint8 oracleDecimals = feed.oracle.decimals();
        uint256 price = uint256(answer);

        // oracleMinimum = amount * price * (BPS - maxSlippage) / (BPS * 10^decimals)
        oracleMinimum = amount.mulDiv(
            price * (BPS_DENOMINATOR - maxSlippageBps), BPS_DENOMINATOR * (10 ** oracleDecimals), Math.Rounding.Ceil
        );

        valid = minReturn >= oracleMinimum;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  View — Feed Status
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Check if a feed's data is stale beyond its heartbeat.
    /// @param asset The asset address to check.
    /// @return stale True if the feed data is older than its heartbeat.
    function isFeedStale(address asset) external view returns (bool stale) {
        OracleFeed storage feed = feeds[asset];
        if (address(feed.oracle) == address(0)) return true;
        if (!feed.active) return true;

        (,,, uint256 updatedAt,) = feed.oracle.latestRoundData();
        return block.timestamp - updatedAt > feed.heartbeat;
    }

    /// @notice Get count of registered assets.
    function feedCount() external view returns (uint256) {
        return registeredAssets.length;
    }

    /// @notice Check if an asset has an active feed registered.
    /// @param asset The asset address to check.
    function hasFeed(address asset) external view returns (bool) {
        return _isRegistered[asset] && feeds[asset].active;
    }

    /// @notice Returns the full list of registered asset addresses.
    /// @dev For off-chain enumeration. May include disabled feeds.
    function getAllRegisteredAssets() external view returns (address[] memory) {
        return registeredAssets;
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Retrieve an active feed or revert.
    function _getActiveFeed(address asset) internal view returns (OracleFeed storage feed) {
        feed = feeds[asset];
        if (address(feed.oracle) == address(0)) revert FeedNotFound(asset);
        if (!feed.active) revert FeedInactive(asset);
    }
}
