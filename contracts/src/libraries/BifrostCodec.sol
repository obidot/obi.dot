// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MultiLocation} from "./MultiLocation.sol";

/// @title BifrostCodec — Encoding helpers for Bifrost XCM interactions
/// @notice Provides pure Solidity functions to construct SCALE-encoded XCM
///         instruction payloads targeting Bifrost parachain (2030) for DeFi operations.
/// @dev Each encoder builds a VersionedXcm V4 message with the appropriate instructions
///      for the target Bifrost pallet. The generated payloads are passed to the XCM
///      precompile's `send()` function along with a destination MultiLocation.
///
///      Bifrost Parachain ID: 2030
///      Key Pallet Indices:
///        - SLP (vtokenMinting): pallet index 60
///        - DEX (zenlinkProtocol): pallet index 61
///        - Farming: pallet index 62
///        - SALP: pallet index 63
library BifrostCodec {
    using MultiLocation for *;

    // ─────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Bifrost parachain ID on Polkadot.
    uint32 internal constant BIFROST_PARA_ID = 2030;

    /// @dev Pallet index for vToken Minting (SLP).
    uint8 internal constant PALLET_VTOKEN_MINTING = 60;

    /// @dev Pallet index for Zenlink DEX.
    uint8 internal constant PALLET_ZENLINK_DEX = 61;

    /// @dev Pallet index for Farming.
    uint8 internal constant PALLET_FARMING = 62;

    /// @dev Pallet index for SALP.
    uint8 internal constant PALLET_SALP = 63;

    /// @dev XCM instruction: Transact.
    uint8 internal constant XCM_TRANSACT = 0x06;

    /// @dev XCM instruction: WithdrawAsset.
    uint8 internal constant XCM_WITHDRAW_ASSET = 0x00;

    /// @dev XCM instruction: BuyExecution.
    uint8 internal constant XCM_BUY_EXECUTION = 0x0c;

    /// @dev XCM instruction: DepositAsset.
    uint8 internal constant XCM_DEPOSIT_ASSET = 0x04;

    /// @dev XCM instruction: SetAppendix (for error handling/refund).
    uint8 internal constant XCM_SET_APPENDIX = 0x09;

    /// @dev XCM V4 version byte.
    uint8 internal constant XCM_V4 = 0x04;

    /// @dev Bifrost DOT currency ID.
    uint32 internal constant CURRENCY_DOT = 0;

    /// @dev Bifrost vDOT currency ID.
    uint32 internal constant CURRENCY_VDOT = 1;

    /// @dev Bifrost KSM currency ID.
    uint32 internal constant CURRENCY_KSM = 2;

    /// @dev Bifrost vKSM currency ID.
    uint32 internal constant CURRENCY_VKSM = 3;

    /// @dev Bifrost BNC (native) currency ID.
    uint32 internal constant CURRENCY_BNC = 4;

    // ─────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────

    /// @dev The currency ID is not supported for this operation.
    error UnsupportedCurrency(uint32 currencyId);

    /// @dev The amount is zero.
    error ZeroAmount();

    // ─────────────────────────────────────────────────────────────────────
    //  SLP — vToken Minting
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode an XCM Transact call to mint vTokens on Bifrost.
    /// @dev Builds a VersionedXcm V4 message:
    ///      [WithdrawAsset, BuyExecution, Transact(vtokenMinting.mint(currencyId, amount)), DepositAsset]
    /// @param currencyId The underlying token currency ID (e.g., CURRENCY_DOT).
    /// @param amount The amount to stake.
    /// @param beneficiary The AccountId32 on Bifrost to receive vTokens.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeMintVToken(uint32 currencyId, uint256 amount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory xcmMessage)
    {
        if (amount == 0) revert ZeroAmount();

        // Encode the Bifrost pallet call: vtokenMinting.mint(token_id, amount, remark)
        bytes memory palletCall = _encodeSLPMintCall(currencyId, amount);

        // Build the full XCM message with fee handling
        xcmMessage = _buildTransactXcm(palletCall, amount, beneficiary);
    }

    /// @notice Encode an XCM Transact call to redeem vTokens on Bifrost.
    /// @param vCurrencyId The vToken currency ID (e.g., CURRENCY_VDOT).
    /// @param amount The amount of vTokens to redeem.
    /// @param beneficiary The AccountId32 on Bifrost receiving underlying tokens.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeRedeemVToken(uint32 vCurrencyId, uint256 amount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory xcmMessage)
    {
        if (amount == 0) revert ZeroAmount();

        bytes memory palletCall = _encodeSLPRedeemCall(vCurrencyId, amount);
        xcmMessage = _buildTransactXcm(palletCall, amount, beneficiary);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  DEX — Swaps
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode an XCM Transact call to execute a swap on Bifrost DEX.
    /// @param currencyIn Input currency ID.
    /// @param currencyOut Output currency ID.
    /// @param amountIn Amount of input tokens.
    /// @param amountOutMin Minimum output tokens (slippage protection).
    /// @param beneficiary The AccountId32 on Bifrost receiving output tokens.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeDEXSwap(
        uint32 currencyIn,
        uint32 currencyOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes32 beneficiary
    ) internal pure returns (bytes memory xcmMessage) {
        if (amountIn == 0) revert ZeroAmount();

        bytes memory palletCall = _encodeDEXSwapCall(currencyIn, currencyOut, amountIn, amountOutMin);
        xcmMessage = _buildTransactXcm(palletCall, amountIn, beneficiary);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Farming
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode an XCM Transact call to deposit into a Bifrost farming pool.
    /// @param poolId The farming pool ID.
    /// @param amount Amount of tokens to deposit.
    /// @param beneficiary The AccountId32 on Bifrost.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeFarmingDeposit(uint256 poolId, uint256 amount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory xcmMessage)
    {
        if (amount == 0) revert ZeroAmount();

        bytes memory palletCall = _encodeFarmingDepositCall(poolId, amount);
        xcmMessage = _buildTransactXcm(palletCall, amount, beneficiary);
    }

    /// @notice Encode an XCM Transact call to withdraw from a Bifrost farming pool.
    /// @param poolId The farming pool ID.
    /// @param amount Amount of tokens to withdraw.
    /// @param beneficiary The AccountId32 on Bifrost.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeFarmingWithdraw(uint256 poolId, uint256 amount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory xcmMessage)
    {
        bytes memory palletCall = _encodeFarmingWithdrawCall(poolId, amount);
        xcmMessage = _buildTransactXcm(palletCall, amount, beneficiary);
    }

    /// @notice Encode an XCM Transact call to claim farming rewards.
    /// @param poolId The farming pool ID.
    /// @param beneficiary The AccountId32 on Bifrost.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeFarmingClaim(uint256 poolId, bytes32 beneficiary) internal pure returns (bytes memory xcmMessage) {
        bytes memory palletCall = _encodeFarmingClaimCall(poolId);
        xcmMessage = _buildTransactXcm(palletCall, 0, beneficiary);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  SALP — Crowdloan
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Encode an XCM Transact call to contribute to a crowdloan via SALP.
    /// @param parachainId The target parachain's crowdloan.
    /// @param amount Amount to contribute.
    /// @param beneficiary The AccountId32 on Bifrost.
    /// @return xcmMessage The SCALE-encoded VersionedXcm V4 message.
    function encodeSALPContribute(uint32 parachainId, uint256 amount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory xcmMessage)
    {
        if (amount == 0) revert ZeroAmount();

        bytes memory palletCall = _encodeSALPContributeCall(parachainId, amount);
        xcmMessage = _buildTransactXcm(palletCall, amount, beneficiary);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Destination Helper
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Build the SCALE-encoded destination MultiLocation for Bifrost.
    /// @return dest SCALE-encoded VersionedMultiLocation targeting Bifrost.
    function bifrostDestination() internal pure returns (bytes memory dest) {
        return MultiLocation.siblingParachain(MultiLocation.VERSION_V4, BIFROST_PARA_ID);
    }

    /// @notice Build destination with a specific account on Bifrost.
    /// @param accountId The 32-byte substrate account.
    /// @return dest SCALE-encoded VersionedMultiLocation.
    function bifrostAccountDestination(bytes32 accountId) internal pure returns (bytes memory dest) {
        return MultiLocation.siblingParachainAccountId32(MultiLocation.VERSION_V4, BIFROST_PARA_ID, accountId);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — Pallet Call Encoders
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Encode SLP mint call: pallet_index(60) . call_index(0) . currency_id . amount
    function _encodeSLPMintCall(uint32 currencyId, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_VTOKEN_MINTING,
            uint8(0x00), // call index: mint
            _encodeU32LE(currencyId),
            _encodeCompactBalance(amount),
            bytes1(0x00) // remark: None
        );
    }

    /// @dev Encode SLP redeem call: pallet_index(60) . call_index(1) . v_currency_id . amount
    function _encodeSLPRedeemCall(uint32 vCurrencyId, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_VTOKEN_MINTING,
            uint8(0x01), // call index: redeem
            _encodeU32LE(vCurrencyId),
            _encodeCompactBalance(amount)
        );
    }

    /// @dev Encode DEX swap call: pallet_index(61) . call_index(0) . in . out . amount_in . amount_out_min
    function _encodeDEXSwapCall(uint32 currencyIn, uint32 currencyOut, uint256 amountIn, uint256 amountOutMin)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            PALLET_ZENLINK_DEX,
            uint8(0x00), // call index: swap_exact_tokens_for_tokens
            _encodeU32LE(currencyIn),
            _encodeU32LE(currencyOut),
            _encodeCompactBalance(amountIn),
            _encodeCompactBalance(amountOutMin)
        );
    }

    /// @dev Encode farming deposit call: pallet_index(62) . call_index(0) . pool_id . amount
    function _encodeFarmingDepositCall(uint256 poolId, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_FARMING,
            uint8(0x00), // call index: deposit
            _encodeCompactBalance(poolId),
            _encodeCompactBalance(amount)
        );
    }

    /// @dev Encode farming withdraw call: pallet_index(62) . call_index(1) . pool_id . amount
    function _encodeFarmingWithdrawCall(uint256 poolId, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_FARMING,
            uint8(0x01), // call index: withdraw
            _encodeCompactBalance(poolId),
            _encodeCompactBalance(amount)
        );
    }

    /// @dev Encode farming claim call: pallet_index(62) . call_index(2) . pool_id
    function _encodeFarmingClaimCall(uint256 poolId) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_FARMING,
            uint8(0x02), // call index: claim
            _encodeCompactBalance(poolId)
        );
    }

    /// @dev Encode SALP contribute call: pallet_index(63) . call_index(0) . para_id . amount
    function _encodeSALPContributeCall(uint32 parachainId, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            PALLET_SALP,
            uint8(0x00), // call index: contribute
            _encodeU32LE(parachainId),
            _encodeCompactBalance(amount)
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — XCM Message Builder
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Build a complete XCM V4 Transact message with fee handling.
    ///      Structure: V4([WithdrawAsset, BuyExecution, Transact, RefundSurplus, DepositAsset])
    function _buildTransactXcm(bytes memory palletCall, uint256 feeAmount, bytes32 beneficiary)
        internal
        pure
        returns (bytes memory)
    {
        // Encode the Transact instruction
        bytes memory transactInstruction = abi.encodePacked(
            XCM_TRANSACT,
            uint8(0x02), // OriginKind::SovereignAccount
            _encodeCompactBalance(feeAmount), // require_weight_at_most (ref_time)
            _encodeCompactBalance(0), // require_weight_at_most (proof_size)
            _encodeCompactVec(palletCall) // encoded call
        );

        // Encode the beneficiary for DepositAsset
        bytes memory beneficiaryLocation = abi.encodePacked(
            uint8(0x00), // parents = 0
            uint8(0x01), // interior = X1
            uint8(0x01), // Junction::AccountId32
            uint8(0x00), // network = None
            beneficiary // account_id
        );

        // Build the full instruction sequence as V4 XCM
        return abi.encodePacked(
            XCM_V4,
            uint8(0x14), // Compact length = 5 instructions
            // 1. WithdrawAsset
            XCM_WITHDRAW_ASSET,
            _encodeNativeAsset(feeAmount),
            // 2. BuyExecution
            XCM_BUY_EXECUTION,
            _encodeNativeAsset(feeAmount),
            uint8(0x00), // WeightLimit::Unlimited
            // 3. Transact
            transactInstruction,
            // 4. RefundSurplus
            uint8(0x0a), // RefundSurplus instruction
            // 5. DepositAsset
            XCM_DEPOSIT_ASSET,
            uint8(0x00), // Wild::All filter
            beneficiaryLocation
        );
    }

    /// @dev Encode a native asset representation for XCM.
    function _encodeNativeAsset(uint256 amount) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(0x04), // Vec length = 1 asset
            uint8(0x00), // parents = 0
            uint8(0x00), // interior = Here
            uint8(0x00), // Fungibility::Fungible
            _encodeCompactBalance(amount)
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Internal — SCALE Encoding Helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Encode a uint32 as 4-byte little-endian.
    function _encodeU32LE(uint32 value) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(value & 0xFF), uint8((value >> 8) & 0xFF), uint8((value >> 16) & 0xFF), uint8(value >> 24)
        );
    }

    /// @dev Encode a u128 value in SCALE compact form for balance values.
    ///      Mirrors the MultiLocation compact encoding but extended for u128.
    function _encodeCompactBalance(uint256 value) internal pure returns (bytes memory) {
        if (value <= 0x3F) {
            return abi.encodePacked(uint8(uint8(value) << 2));
        } else if (value <= 0x3FFF) {
            uint16 encoded = uint16(value << 2) | 0x01;
            return abi.encodePacked(uint8(encoded & 0xFF), uint8(encoded >> 8));
        } else if (value <= 0x3FFFFFFF) {
            uint32 encoded = uint32(value << 2) | 0x02;
            return abi.encodePacked(
                uint8(encoded & 0xFF), uint8((encoded >> 8) & 0xFF), uint8((encoded >> 16) & 0xFF), uint8(encoded >> 24)
            );
        } else {
            // Big integer mode
            uint256 temp = value;
            uint8 byteLen = 0;
            while (temp > 0) {
                byteLen++;
                temp >>= 8;
            }
            bytes memory result = new bytes(1 + byteLen);
            result[0] = bytes1(((byteLen - 4) << 2) | 0x03);
            temp = value;
            for (uint8 i = 0; i < byteLen; i++) {
                result[1 + i] = bytes1(uint8(temp & 0xFF));
                temp >>= 8;
            }
            return result;
        }
    }

    /// @dev Encode a byte vector with compact length prefix (SCALE Vec<u8>).
    function _encodeCompactVec(bytes memory data) internal pure returns (bytes memory) {
        return abi.encodePacked(_encodeCompactBalance(data.length), data);
    }
}
