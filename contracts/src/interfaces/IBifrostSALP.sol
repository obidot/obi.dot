// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IBifrostSALP — Bifrost Slot Auction Liquidity Protocol Interface
/// @notice Interface for Bifrost's SALP which allows users to participate in
///         Polkadot parachain crowdloans while maintaining liquidity through
///         vsTokens (vsBond derivatives).
/// @dev SALP tokenizes crowdloan contributions into tradeable derivatives:
///      - vsBond: represents the crowdloan contribution + lease period
///      - vsToken: represents the liquid derivative of the contribution
///      Users can participate in crowdloans without locking their capital.
interface IBifrostSALP {
    // ──────────────────────────────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Parameters for contributing to a crowdloan via SALP.
    struct ContributeParams {
        /// The parachain ID of the crowdloan campaign.
        uint32 parachainId;
        /// Amount of tokens to contribute.
        uint256 amount;
        /// Optional referral code.
        bytes32 referralCode;
    }

    /// @notice Information about an active crowdloan campaign.
    struct CrowdloanInfo {
        /// The parachain ID running the crowdloan.
        uint32 parachainId;
        /// Total contributions received so far.
        uint256 totalRaised;
        /// The crowdloan cap (maximum contributions accepted).
        uint256 cap;
        /// The lease period start slot.
        uint32 firstSlot;
        /// The lease period end slot.
        uint32 lastSlot;
        /// Whether the crowdloan is currently accepting contributions.
        bool isActive;
        /// Estimated APY from rewards (in basis points).
        uint256 estimatedApyBps;
    }

    /// @notice Parameters for redeeming expired vsBond tokens.
    struct RedeemParams {
        /// The parachain ID of the expired crowdloan.
        uint32 parachainId;
        /// The lease period (firstSlot-lastSlot encoded).
        uint64 leasePeriod;
        /// Amount of vsBond to redeem.
        uint256 amount;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a user contributes to a crowdloan via SALP.
    event CrowdloanContribution(
        address indexed contributor,
        uint32 indexed parachainId,
        uint256 amount,
        uint256 vsTokenReceived,
        uint256 vsBondReceived
    );

    /// @notice Emitted when vsBond tokens are redeemed after lease expiry.
    event VsBondRedeemed(
        address indexed user,
        uint32 indexed parachainId,
        uint256 vsBondAmount,
        uint256 underlyingReturned
    );

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Contribute to a parachain crowdloan and receive vsToken + vsBond.
    /// @param params The contribution parameters.
    /// @return vsTokenAmount Amount of vsTokens received.
    /// @return vsBondAmount Amount of vsBond tokens received.
    function contribute(
        ContributeParams calldata params
    ) external returns (uint256 vsTokenAmount, uint256 vsBondAmount);

    /// @notice Redeem expired vsBond tokens for the underlying contribution.
    /// @dev Only callable after the lease period has ended.
    /// @param params The redemption parameters.
    /// @return underlyingAmount Amount of underlying tokens returned.
    function redeemVsBond(
        RedeemParams calldata params
    ) external returns (uint256 underlyingAmount);

    /// @notice Get information about an active crowdloan campaign.
    /// @param parachainId The parachain ID.
    /// @return info The crowdloan information.
    function getCrowdloanInfo(
        uint32 parachainId
    ) external view returns (CrowdloanInfo memory info);

    /// @notice Get all currently active crowdloan campaigns.
    /// @return parachainIds Array of parachain IDs with active crowdloans.
    function getActiveCrowdloans()
        external
        view
        returns (uint32[] memory parachainIds);

    /// @notice Check if a crowdloan's lease period has expired (vsBond redeemable).
    /// @param parachainId The parachain ID.
    /// @param leasePeriod The lease period to check.
    /// @return expired True if the lease has expired.
    function isLeaseExpired(
        uint32 parachainId,
        uint64 leasePeriod
    ) external view returns (bool expired);

    /// @notice Get the current vsToken exchange rate for a parachain's crowdloan.
    /// @param parachainId The parachain ID.
    /// @return rate The exchange rate (scaled by 1e18).
    function getVsTokenRate(
        uint32 parachainId
    ) external view returns (uint256 rate);
}
