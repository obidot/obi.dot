// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAggregatorV3 — Chainlink-compatible price feed interface
/// @notice Used by ObidotVault to fetch oracle prices for slippage validation.
///         Pyth Network deploys `PythAggregatorV3` adapters that implement this
///         interface, providing Chainlink-compatible access to Pyth price feeds.
/// @dev Only `latestRoundData()` and `decimals()` are consumed by the vault.
///      The remaining functions are included for full interface compatibility.
interface IAggregatorV3 {
    /// @notice Returns the number of decimals in the price feed's answer.
    /// @return The number of decimals (e.g. 8 for USD price feeds).
    function decimals() external view returns (uint8);

    /// @notice Returns a human-readable description of the price feed.
    /// @return A string describing the feed (e.g. "DOT / USD").
    function description() external view returns (string memory);

    /// @notice Returns the version number of the aggregator.
    /// @return The version number.
    function version() external view returns (uint256);

    /// @notice Returns price data for a specific round.
    /// @param _roundId The round ID to retrieve data for.
    /// @return roundId         The round ID.
    /// @return answer          The price answer (scaled by `decimals()`).
    /// @return startedAt       Timestamp when the round started.
    /// @return updatedAt       Timestamp when the answer was last updated.
    /// @return answeredInRound The round in which the answer was computed.
    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    /// @notice Returns the latest price data from the oracle.
    /// @dev Consumers MUST validate that `updatedAt` is recent enough and
    ///      that `answer > 0` before using the returned price.
    /// @return roundId         The most recent round ID.
    /// @return answer          The latest price answer (scaled by `decimals()`).
    /// @return startedAt       Timestamp when the current round started.
    /// @return updatedAt       Timestamp when the answer was last updated.
    /// @return answeredInRound The round in which the answer was computed.
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
