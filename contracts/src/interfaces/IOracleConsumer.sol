// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IOracleConsumer — Standard interface for oracle-consuming contracts
/// @notice Enables composability between contracts that read oracle data.
///         Implementors (e.g. ObidotVault) expose their oracle configuration
///         so external systems can query oracle health status.
interface IOracleConsumer {
    /// @notice Returns the oracle registry used by this contract.
    /// @return The address of the OracleRegistry (address(0) if not set).
    function oracleRegistry() external view returns (address);

    /// @notice Returns the single legacy price oracle.
    /// @return The address of the IAggregatorV3 oracle.
    function priceOracle() external view returns (address);

    /// @notice Check if the oracle data for a given asset is fresh.
    /// @param asset The ERC-20 asset address to check.
    /// @return True if the oracle data is within the staleness threshold.
    function isOracleFresh(address asset) external view returns (bool);
}
