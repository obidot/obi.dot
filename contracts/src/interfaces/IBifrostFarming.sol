// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IBifrostFarming — Bifrost Yield Farming Interface
/// @notice Interface for Bifrost's farming/liquidity mining protocol.
///         Allows depositing LP tokens or vTokens into farming pools
///         to earn additional yield rewards.
/// @dev Farming pools have configurable reward rates and lock periods.
///      Interactions from Polkadot Hub occur via XCM. From EVM chains,
///      they are relayed through Hyperbridge → XCM.
interface IBifrostFarming {
    // ──────────────────────────────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Parameters for depositing into a farming pool.
    struct DepositParams {
        /// The farming pool ID.
        uint256 poolId;
        /// Amount of LP/vTokens to deposit.
        uint256 amount;
        /// Optional lock duration in seconds (0 = no lock, higher lock = more rewards).
        uint256 lockDuration;
    }

    /// @notice Parameters for withdrawing from a farming pool.
    struct WithdrawParams {
        /// The farming pool ID.
        uint256 poolId;
        /// Amount of LP/vTokens to withdraw.
        uint256 amount;
    }

    /// @notice Information about a farming pool.
    struct FarmingPool {
        /// Unique pool identifier.
        uint256 poolId;
        /// Currency ID of the staking token (LP or vToken).
        uint32 stakeCurrencyId;
        /// Currency ID of the reward token.
        uint32 rewardCurrencyId;
        /// Total tokens staked in this pool.
        uint256 totalStaked;
        /// Current reward rate per second (scaled by 1e18).
        uint256 rewardPerSecond;
        /// Minimum deposit amount.
        uint256 minDeposit;
        /// Whether the pool is currently active.
        bool isActive;
        /// Pool APY in basis points (informational, may be stale).
        uint256 apyBps;
    }

    /// @notice User position in a farming pool.
    struct UserPosition {
        /// Amount staked.
        uint256 stakedAmount;
        /// Accumulated unclaimed rewards.
        uint256 pendingRewards;
        /// Timestamp when the lock expires (0 = no lock).
        uint256 lockExpiry;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emitted when tokens are deposited into a farming pool.
    event Deposited(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount,
        uint256 lockDuration
    );

    /// @notice Emitted when tokens are withdrawn from a farming pool.
    event Withdrawn(
        address indexed user,
        uint256 indexed poolId,
        uint256 amount
    );

    /// @notice Emitted when rewards are claimed.
    event RewardsClaimed(
        address indexed user,
        uint256 indexed poolId,
        uint256 rewardAmount
    );

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Deposit tokens into a farming pool.
    /// @param params The deposit parameters.
    function deposit(DepositParams calldata params) external;

    /// @notice Withdraw tokens from a farming pool.
    /// @dev May fail if tokens are still locked.
    /// @param params The withdrawal parameters.
    function withdraw(WithdrawParams calldata params) external;

    /// @notice Claim accumulated farming rewards.
    /// @param poolId The farming pool ID.
    /// @return rewardAmount The amount of reward tokens claimed.
    function claimRewards(
        uint256 poolId
    ) external returns (uint256 rewardAmount);

    /// @notice Get information about a farming pool.
    /// @param poolId The farming pool ID.
    /// @return pool The pool information.
    function getPoolInfo(
        uint256 poolId
    ) external view returns (FarmingPool memory pool);

    /// @notice Get a user's position in a farming pool.
    /// @param poolId The farming pool ID.
    /// @param user The user address.
    /// @return position The user's position.
    function getUserPosition(
        uint256 poolId,
        address user
    ) external view returns (UserPosition memory position);

    /// @notice Get all active farming pool IDs.
    /// @return poolIds Array of active pool IDs.
    function getActivePools() external view returns (uint256[] memory poolIds);

    /// @notice Get pending rewards for a user in a pool.
    /// @param poolId The farming pool ID.
    /// @param user The user address.
    /// @return pending The pending reward amount.
    function pendingRewards(
        uint256 poolId,
        address user
    ) external view returns (uint256 pending);
}
