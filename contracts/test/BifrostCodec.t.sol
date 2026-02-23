// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BifrostCodec} from "../src/libraries/BifrostCodec.sol";
import {MultiLocation} from "../src/libraries/MultiLocation.sol";

/// @dev Wrapper for revert testing on pure library functions.
contract BifrostCodecWrapper {
    function encodeMintVToken(
        uint32 currencyId,
        uint256 amount,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return BifrostCodec.encodeMintVToken(currencyId, amount, beneficiary);
    }

    function encodeRedeemVToken(
        uint32 vCurrencyId,
        uint256 amount,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return
            BifrostCodec.encodeRedeemVToken(vCurrencyId, amount, beneficiary);
    }

    function encodeDEXSwap(
        uint32 currencyIn,
        uint32 currencyOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return
            BifrostCodec.encodeDEXSwap(
                currencyIn,
                currencyOut,
                amountIn,
                amountOutMin,
                beneficiary
            );
    }

    function encodeFarmingDeposit(
        uint256 poolId,
        uint256 amount,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return BifrostCodec.encodeFarmingDeposit(poolId, amount, beneficiary);
    }

    function encodeFarmingWithdraw(
        uint256 poolId,
        uint256 amount,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return BifrostCodec.encodeFarmingWithdraw(poolId, amount, beneficiary);
    }

    function encodeFarmingClaim(
        uint256 poolId,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return BifrostCodec.encodeFarmingClaim(poolId, beneficiary);
    }

    function encodeSALPContribute(
        uint32 parachainId,
        uint256 amount,
        bytes32 beneficiary
    ) external pure returns (bytes memory) {
        return
            BifrostCodec.encodeSALPContribute(parachainId, amount, beneficiary);
    }

    function bifrostDestination() external pure returns (bytes memory) {
        return BifrostCodec.bifrostDestination();
    }

    function bifrostAccountDestination(
        bytes32 accountId
    ) external pure returns (bytes memory) {
        return BifrostCodec.bifrostAccountDestination(accountId);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_Constants_Test is Test {
    function test_bifrostParaId() public pure {
        assertEq(BifrostCodec.BIFROST_PARA_ID, 2030);
    }

    function test_palletIndices() public pure {
        assertEq(BifrostCodec.PALLET_VTOKEN_MINTING, 60);
        assertEq(BifrostCodec.PALLET_ZENLINK_DEX, 61);
        assertEq(BifrostCodec.PALLET_FARMING, 62);
        assertEq(BifrostCodec.PALLET_SALP, 63);
    }

    function test_currencyIds() public pure {
        assertEq(BifrostCodec.CURRENCY_DOT, 0);
        assertEq(BifrostCodec.CURRENCY_VDOT, 1);
        assertEq(BifrostCodec.CURRENCY_KSM, 2);
        assertEq(BifrostCodec.CURRENCY_VKSM, 3);
        assertEq(BifrostCodec.CURRENCY_BNC, 4);
    }

    function test_xcmVersion() public pure {
        assertEq(BifrostCodec.XCM_V4, 0x04);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Encoding Tests — SLP
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_SLP_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    function test_encodeMintVToken_nonZero() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            100 ether,
            beneficiary
        );
        assertTrue(result.length > 0, "Encoded message must be non-empty");
        // First byte should be XCM V4 marker
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function test_encodeMintVToken_containsPalletIndex() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            1 ether,
            beneficiary
        );
        // The result should contain the SLP pallet index (60) somewhere in the Transact instruction
        bool found = false;
        for (uint256 i = 0; i < result.length; i++) {
            if (uint8(result[i]) == BifrostCodec.PALLET_VTOKEN_MINTING) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Encoded message should contain SLP pallet index");
    }

    function testRevert_encodeMintVToken_zeroAmount() public {
        bytes32 beneficiary = keccak256("alice");
        vm.expectRevert(BifrostCodec.ZeroAmount.selector);
        wrapper.encodeMintVToken(BifrostCodec.CURRENCY_DOT, 0, beneficiary);
    }

    function test_encodeRedeemVToken_nonZero() public view {
        bytes32 beneficiary = keccak256("bob");
        bytes memory result = wrapper.encodeRedeemVToken(
            BifrostCodec.CURRENCY_VDOT,
            50 ether,
            beneficiary
        );
        assertTrue(result.length > 0);
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function testRevert_encodeRedeemVToken_zeroAmount() public {
        bytes32 beneficiary = keccak256("bob");
        vm.expectRevert(BifrostCodec.ZeroAmount.selector);
        wrapper.encodeRedeemVToken(BifrostCodec.CURRENCY_VDOT, 0, beneficiary);
    }

    function testFuzz_encodeMintVToken_nonZeroProducesOutput(
        uint256 amount
    ) public view {
        vm.assume(amount > 0);
        bytes32 beneficiary = keccak256("fuzz_user");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            amount,
            beneficiary
        );
        assertTrue(
            result.length > 10,
            "Encoded message should have substantial length"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Encoding Tests — DEX
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_DEX_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    function test_encodeDEXSwap_nonZero() public view {
        bytes32 beneficiary = keccak256("trader");
        bytes memory result = wrapper.encodeDEXSwap(
            BifrostCodec.CURRENCY_DOT,
            BifrostCodec.CURRENCY_VDOT,
            10 ether,
            9 ether,
            beneficiary
        );
        assertTrue(result.length > 0);
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function test_encodeDEXSwap_containsDEXPalletIndex() public view {
        bytes32 beneficiary = keccak256("trader");
        bytes memory result = wrapper.encodeDEXSwap(
            BifrostCodec.CURRENCY_DOT,
            BifrostCodec.CURRENCY_BNC,
            5 ether,
            4 ether,
            beneficiary
        );
        bool found = false;
        for (uint256 i = 0; i < result.length; i++) {
            if (uint8(result[i]) == BifrostCodec.PALLET_ZENLINK_DEX) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Encoded message should contain DEX pallet index");
    }

    function testRevert_encodeDEXSwap_zeroAmountIn() public {
        bytes32 beneficiary = keccak256("trader");
        vm.expectRevert(BifrostCodec.ZeroAmount.selector);
        wrapper.encodeDEXSwap(
            BifrostCodec.CURRENCY_DOT,
            BifrostCodec.CURRENCY_VDOT,
            0,
            0,
            beneficiary
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Encoding Tests — Farming
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_Farming_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    function test_encodeFarmingDeposit_nonZero() public view {
        bytes32 beneficiary = keccak256("farmer");
        bytes memory result = wrapper.encodeFarmingDeposit(
            0,
            100 ether,
            beneficiary
        );
        assertTrue(result.length > 0);
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function testRevert_encodeFarmingDeposit_zeroAmount() public {
        bytes32 beneficiary = keccak256("farmer");
        vm.expectRevert(BifrostCodec.ZeroAmount.selector);
        wrapper.encodeFarmingDeposit(0, 0, beneficiary);
    }

    function test_encodeFarmingWithdraw_nonZero() public view {
        bytes32 beneficiary = keccak256("farmer");
        bytes memory result = wrapper.encodeFarmingWithdraw(
            1,
            50 ether,
            beneficiary
        );
        assertTrue(result.length > 0);
    }

    function test_encodeFarmingClaim_producesOutput() public view {
        bytes32 beneficiary = keccak256("farmer");
        bytes memory result = wrapper.encodeFarmingClaim(0, beneficiary);
        assertTrue(result.length > 0);
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function test_encodeFarmingDeposit_containsFarmingPalletIndex()
        public
        view
    {
        bytes32 beneficiary = keccak256("farmer");
        bytes memory result = wrapper.encodeFarmingDeposit(
            0,
            1 ether,
            beneficiary
        );
        bool found = false;
        for (uint256 i = 0; i < result.length; i++) {
            if (uint8(result[i]) == BifrostCodec.PALLET_FARMING) {
                found = true;
                break;
            }
        }
        assertTrue(
            found,
            "Encoded message should contain Farming pallet index"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Encoding Tests — SALP
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_SALP_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    function test_encodeSALPContribute_nonZero() public view {
        bytes32 beneficiary = keccak256("contributor");
        bytes memory result = wrapper.encodeSALPContribute(
            2030,
            500 ether,
            beneficiary
        );
        assertTrue(result.length > 0);
        assertEq(uint8(result[0]), BifrostCodec.XCM_V4);
    }

    function testRevert_encodeSALPContribute_zeroAmount() public {
        bytes32 beneficiary = keccak256("contributor");
        vm.expectRevert(BifrostCodec.ZeroAmount.selector);
        wrapper.encodeSALPContribute(2030, 0, beneficiary);
    }

    function test_encodeSALPContribute_containsSALPPalletIndex() public view {
        bytes32 beneficiary = keccak256("contributor");
        bytes memory result = wrapper.encodeSALPContribute(
            2030,
            1 ether,
            beneficiary
        );
        bool found = false;
        for (uint256 i = 0; i < result.length; i++) {
            if (uint8(result[i]) == BifrostCodec.PALLET_SALP) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Encoded message should contain SALP pallet index");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Destination Tests
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_Destination_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    function test_bifrostDestination_nonEmpty() public view {
        bytes memory dest = wrapper.bifrostDestination();
        assertTrue(dest.length > 0, "Destination must not be empty");
    }

    function test_bifrostAccountDestination_nonEmpty() public view {
        bytes32 accountId = keccak256("some_account");
        bytes memory dest = wrapper.bifrostAccountDestination(accountId);
        assertTrue(dest.length > 0, "Account destination must not be empty");
    }

    function test_bifrostDestination_deterministic() public view {
        bytes memory dest1 = wrapper.bifrostDestination();
        bytes memory dest2 = wrapper.bifrostDestination();
        assertEq(
            keccak256(dest1),
            keccak256(dest2),
            "Destination encoding should be deterministic"
        );
    }

    function test_bifrostAccountDestination_different_accounts() public view {
        bytes32 accountA = keccak256("alice");
        bytes32 accountB = keccak256("bob");
        bytes memory destA = wrapper.bifrostAccountDestination(accountA);
        bytes memory destB = wrapper.bifrostAccountDestination(accountB);
        assertTrue(
            keccak256(destA) != keccak256(destB),
            "Different accounts should produce different destinations"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Compact Encoding Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostCodec_CompactEncoding_Test is Test {
    BifrostCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new BifrostCodecWrapper();
    }

    /// @dev Test small value (single-mode compact) produces valid XCM
    function test_encodeMintVToken_smallAmount() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            1,
            beneficiary
        );
        assertTrue(result.length > 0);
    }

    /// @dev Test medium value (two-byte compact) produces valid XCM
    function test_encodeMintVToken_mediumAmount() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            16000,
            beneficiary
        );
        assertTrue(result.length > 0);
    }

    /// @dev Test large value (four-byte compact) produces valid XCM
    function test_encodeMintVToken_largeAmount() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            1_000_000_000,
            beneficiary
        );
        assertTrue(result.length > 0);
    }

    /// @dev Test very large value (big integer compact) produces valid XCM
    function test_encodeMintVToken_veryLargeAmount() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory result = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            type(uint128).max,
            beneficiary
        );
        assertTrue(result.length > 0);
    }

    /// @dev Test boundary values for compact encoding modes.
    function test_encodeMintVToken_compactBoundaries() public view {
        bytes32 beneficiary = keccak256("alice");

        // Single byte mode: 0-63
        bytes memory r1 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            63,
            beneficiary
        );
        assertTrue(r1.length > 0);

        // Two byte mode: 64-16383
        bytes memory r2 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            64,
            beneficiary
        );
        assertTrue(r2.length > 0);
        bytes memory r3 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            16383,
            beneficiary
        );
        assertTrue(r3.length > 0);

        // Four byte mode: 16384 - 1073741823
        bytes memory r4 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            16384,
            beneficiary
        );
        assertTrue(r4.length > 0);
        bytes memory r5 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            1073741823,
            beneficiary
        );
        assertTrue(r5.length > 0);

        // Big integer mode: >= 1073741824
        bytes memory r6 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            1073741824,
            beneficiary
        );
        assertTrue(r6.length > 0);
    }

    /// @dev Encoding with different amounts should produce different results.
    function test_encodeMintVToken_differentAmounts() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory r1 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            100,
            beneficiary
        );
        bytes memory r2 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            200,
            beneficiary
        );
        assertTrue(
            keccak256(r1) != keccak256(r2),
            "Different amounts should produce different encodings"
        );
    }

    /// @dev Encoding with different currency IDs should produce different results.
    function test_encodeMintVToken_differentCurrencies() public view {
        bytes32 beneficiary = keccak256("alice");
        bytes memory r1 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_DOT,
            100,
            beneficiary
        );
        bytes memory r2 = wrapper.encodeMintVToken(
            BifrostCodec.CURRENCY_KSM,
            100,
            beneficiary
        );
        assertTrue(
            keccak256(r1) != keccak256(r2),
            "Different currencies should produce different encodings"
        );
    }
}
