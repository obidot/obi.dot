// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IBifrostSLP — Bifrost Staking Liquidity Protocol Interface
/// @notice Interface for Bifrost's liquid staking functionality.
///         Allows minting vTokens (vDOT, vKSM, vGLMR, etc.) by staking
///         native tokens, and redeeming underlying by burning vTokens.
/// @dev On Polkadot Hub, interactions happen via XCM to Bifrost parachain (2030).
///      On EVM chains, interactions happen via Hyperbridge → XCM relay.
///      vTokens accrue staking rewards automatically (rebasing).
interface IBifrostSLP {
    // ──────────────────────────────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Token type enum matching Bifrost's on-chain representation.
    enum TokenType {
        Native, // 0 — Native token (DOT, KSM)
        VToken, // 1 — Liquid staking derivative (vDOT, vKSM)
        Token2, // 2 — Token2 type
        VSToken, // 3 — VS bond token
        VSBond, // 4 — VS bond
        LPToken, // 5 — LP token
        ForeignAsset, // 6 — Foreign asset
        BLP, // 7 — Bifrost LP token
        StableLPToken // 8 — Stable LP token

    }

    /// @notice Minting parameters for liquid staking.
    struct MintParams {
        /// The token to stake (e.g., DOT currency ID).
        uint32 currencyId;
        /// Amount to stake in the token's smallest denomination.
        uint256 amount;
        /// Minimum vTokens expected (slippage protection).
        uint256 minVTokenAmount;
        /// Optional channel ID for referral tracking.
        uint32 channelId;
    }

    /// @notice Redemption parameters for unstaking.
    struct RedeemParams {
        /// The vToken to burn (e.g., vDOT currency ID).
        uint32 vCurrencyId;
        /// Amount of vTokens to redeem.
        uint256 amount;
        /// Minimum underlying tokens expected.
        uint256 minUnderlyingAmount;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Emitted when vTokens are minted via liquid staking.
    event VTokenMinted(address indexed user, uint32 indexed currencyId, uint256 stakedAmount, uint256 vTokenReceived);

    /// @notice Emitted when vTokens are redeemed for underlying.
    event VTokenRedeemed(
        address indexed user, uint32 indexed vCurrencyId, uint256 vTokenBurned, uint256 underlyingReceived
    );

    // ──────────────────────────────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────────────────────────────

    /// @notice Mint vTokens by staking native tokens.
    /// @param params The minting parameters.
    /// @return vTokenAmount The amount of vTokens minted.
    function mint(MintParams calldata params) external returns (uint256 vTokenAmount);

    /// @notice Redeem underlying tokens by burning vTokens.
    /// @dev Redemption may have an unbonding period depending on the chain.
    /// @param params The redemption parameters.
    /// @return underlyingAmount The amount of underlying tokens returned.
    function redeem(RedeemParams calldata params) external returns (uint256 underlyingAmount);

    /// @notice Get the current exchange rate between a vToken and its underlying.
    /// @param vCurrencyId The vToken currency ID.
    /// @return rate The exchange rate (scaled by 1e18). E.g., 1.05e18 means 1 vDOT = 1.05 DOT.
    function getExchangeRate(uint32 vCurrencyId) external view returns (uint256 rate);

    /// @notice Get the total value locked in the staking pool for a given token.
    /// @param currencyId The underlying token currency ID.
    /// @return totalStaked Total amount staked in the smallest denomination.
    function totalStaked(uint32 currencyId) external view returns (uint256 totalStaked);

    /// @notice Check if minting is available for a given token.
    /// @param currencyId The underlying token currency ID.
    /// @return available True if minting is currently available.
    function isMintingAvailable(uint32 currencyId) external view returns (bool available);

    /// @notice Get the minimum stake amount for a given token.
    /// @param currencyId The underlying token currency ID.
    /// @return minAmount The minimum stake amount.
    function minimumStake(uint32 currencyId) external view returns (uint256 minAmount);
}
