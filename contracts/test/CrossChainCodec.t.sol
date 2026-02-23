// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CrossChainCodec} from "../src/libraries/CrossChainCodec.sol";

/// @dev Wrapper contract to make library functions external for revert testing.
contract CrossChainCodecWrapper {
    function messageType(bytes calldata body) external pure returns (uint8) {
        return CrossChainCodec.messageType(body);
    }

    function decodeDepositSync(
        bytes calldata body
    ) external pure returns (CrossChainCodec.DepositSyncMessage memory) {
        return CrossChainCodec.decodeDepositSync(body);
    }

    function decodeWithdrawRequest(
        bytes calldata body
    ) external pure returns (CrossChainCodec.WithdrawRequestMessage memory) {
        return CrossChainCodec.decodeWithdrawRequest(body);
    }

    function decodeAssetSync(
        bytes calldata body
    ) external pure returns (CrossChainCodec.AssetSyncMessage memory) {
        return CrossChainCodec.decodeAssetSync(body);
    }

    function decodeStrategyReport(
        bytes calldata body
    ) external pure returns (CrossChainCodec.StrategyReportMessage memory) {
        return CrossChainCodec.decodeStrategyReport(body);
    }

    function decodeEmergencySync(
        bytes calldata body
    ) external pure returns (CrossChainCodec.EmergencySyncMessage memory) {
        return CrossChainCodec.decodeEmergencySync(body);
    }

    function decodeDepositAck(
        bytes calldata body
    ) external pure returns (CrossChainCodec.DepositAckMessage memory) {
        return CrossChainCodec.decodeDepositAck(body);
    }

    function decodeWithdrawFulfill(
        bytes calldata body
    ) external pure returns (CrossChainCodec.WithdrawFulfillMessage memory) {
        return CrossChainCodec.decodeWithdrawFulfill(body);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Roundtrip Tests
// ═══════════════════════════════════════════════════════════════════════════

contract CrossChainCodec_Roundtrip_Test is Test {
    CrossChainCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new CrossChainCodecWrapper();
    }

    // ── Deposit Sync ────────────────────────────────────────────────────

    function test_depositSync_roundtrip() public view {
        CrossChainCodec.DepositSyncMessage memory original = CrossChainCodec
            .DepositSyncMessage({
                chainId: bytes("ETHEREUM"),
                depositor: address(0xdead),
                amount: 100 ether,
                sharesMinted: 95 ether,
                nonce: 42
            });

        bytes memory encoded = CrossChainCodec.encodeDepositSync(original);
        CrossChainCodec.DepositSyncMessage memory decoded = wrapper
            .decodeDepositSync(encoded);

        assertEq(decoded.chainId, original.chainId);
        assertEq(decoded.depositor, original.depositor);
        assertEq(decoded.amount, original.amount);
        assertEq(decoded.sharesMinted, original.sharesMinted);
        assertEq(decoded.nonce, original.nonce);
    }

    function test_depositSync_messageTypeByte() public view {
        CrossChainCodec.DepositSyncMessage memory msg_ = CrossChainCodec
            .DepositSyncMessage({
                chainId: bytes("ETHEREUM"),
                depositor: address(0xdead),
                amount: 1 ether,
                sharesMinted: 1 ether,
                nonce: 0
            });
        bytes memory encoded = CrossChainCodec.encodeDepositSync(msg_);
        assertEq(
            wrapper.messageType(encoded),
            CrossChainCodec.MSG_DEPOSIT_SYNC
        );
    }

    function testFuzz_depositSync_roundtrip(
        address depositor,
        uint256 amount,
        uint256 sharesMinted,
        uint256 nonce
    ) public view {
        CrossChainCodec.DepositSyncMessage memory original = CrossChainCodec
            .DepositSyncMessage({
                chainId: bytes("ARBITRUM"),
                depositor: depositor,
                amount: amount,
                sharesMinted: sharesMinted,
                nonce: nonce
            });

        bytes memory encoded = CrossChainCodec.encodeDepositSync(original);
        CrossChainCodec.DepositSyncMessage memory decoded = wrapper
            .decodeDepositSync(encoded);

        assertEq(decoded.depositor, depositor);
        assertEq(decoded.amount, amount);
        assertEq(decoded.sharesMinted, sharesMinted);
        assertEq(decoded.nonce, nonce);
    }

    // ── Withdraw Request ────────────────────────────────────────────────

    function test_withdrawRequest_roundtrip() public view {
        CrossChainCodec.WithdrawRequestMessage memory original = CrossChainCodec
            .WithdrawRequestMessage({
                chainId: bytes("OPTIMISM"),
                withdrawer: address(0xbeef),
                amount: 50 ether,
                sharesToBurn: 48 ether,
                nonce: 7
            });

        bytes memory encoded = CrossChainCodec.encodeWithdrawRequest(original);
        CrossChainCodec.WithdrawRequestMessage memory decoded = wrapper
            .decodeWithdrawRequest(encoded);

        assertEq(decoded.chainId, original.chainId);
        assertEq(decoded.withdrawer, original.withdrawer);
        assertEq(decoded.amount, original.amount);
        assertEq(decoded.sharesToBurn, original.sharesToBurn);
        assertEq(decoded.nonce, original.nonce);
    }

    function test_withdrawRequest_messageTypeByte() public view {
        CrossChainCodec.WithdrawRequestMessage memory msg_ = CrossChainCodec
            .WithdrawRequestMessage({
                chainId: bytes("BASE"),
                withdrawer: address(0xbeef),
                amount: 1 ether,
                sharesToBurn: 1 ether,
                nonce: 0
            });
        bytes memory encoded = CrossChainCodec.encodeWithdrawRequest(msg_);
        assertEq(
            wrapper.messageType(encoded),
            CrossChainCodec.MSG_WITHDRAW_REQUEST
        );
    }

    // ── Asset Sync ──────────────────────────────────────────────────────

    function test_assetSync_roundtrip() public view {
        CrossChainCodec.AssetSyncMessage memory original = CrossChainCodec
            .AssetSyncMessage({
                globalTotalAssets: 10_000_000 ether,
                globalTotalShares: 9_500_000 ether,
                totalRemoteAssets: 5_000_000 ether,
                timestamp: block.timestamp
            });

        bytes memory encoded = CrossChainCodec.encodeAssetSync(original);
        CrossChainCodec.AssetSyncMessage memory decoded = wrapper
            .decodeAssetSync(encoded);

        assertEq(decoded.globalTotalAssets, original.globalTotalAssets);
        assertEq(decoded.globalTotalShares, original.globalTotalShares);
        assertEq(decoded.totalRemoteAssets, original.totalRemoteAssets);
        assertEq(decoded.timestamp, original.timestamp);
    }

    function test_assetSync_messageTypeByte() public view {
        CrossChainCodec.AssetSyncMessage memory msg_ = CrossChainCodec
            .AssetSyncMessage({
                globalTotalAssets: 1,
                globalTotalShares: 1,
                totalRemoteAssets: 0,
                timestamp: 1
            });
        bytes memory encoded = CrossChainCodec.encodeAssetSync(msg_);
        assertEq(wrapper.messageType(encoded), CrossChainCodec.MSG_ASSET_SYNC);
    }

    function testFuzz_assetSync_roundtrip(
        uint256 globalTotalAssets,
        uint256 globalTotalShares,
        uint256 totalRemoteAssets,
        uint256 timestamp
    ) public view {
        CrossChainCodec.AssetSyncMessage memory original = CrossChainCodec
            .AssetSyncMessage({
                globalTotalAssets: globalTotalAssets,
                globalTotalShares: globalTotalShares,
                totalRemoteAssets: totalRemoteAssets,
                timestamp: timestamp
            });

        bytes memory encoded = CrossChainCodec.encodeAssetSync(original);
        CrossChainCodec.AssetSyncMessage memory decoded = wrapper
            .decodeAssetSync(encoded);

        assertEq(decoded.globalTotalAssets, globalTotalAssets);
        assertEq(decoded.globalTotalShares, globalTotalShares);
        assertEq(decoded.totalRemoteAssets, totalRemoteAssets);
        assertEq(decoded.timestamp, timestamp);
    }

    // ── Strategy Report ─────────────────────────────────────────────────

    function test_strategyReport_roundtrip() public view {
        CrossChainCodec.StrategyReportMessage memory original = CrossChainCodec
            .StrategyReportMessage({
                strategyId: 99,
                success: true,
                returnedAmount: 105 ether,
                pnl: 5 ether,
                newTotalRemoteAssets: 4_500_000 ether
            });

        bytes memory encoded = CrossChainCodec.encodeStrategyReport(original);
        CrossChainCodec.StrategyReportMessage memory decoded = wrapper
            .decodeStrategyReport(encoded);

        assertEq(decoded.strategyId, original.strategyId);
        assertEq(decoded.success, original.success);
        assertEq(decoded.returnedAmount, original.returnedAmount);
        assertEq(decoded.pnl, original.pnl);
        assertEq(decoded.newTotalRemoteAssets, original.newTotalRemoteAssets);
    }

    function test_strategyReport_negativePnl() public view {
        CrossChainCodec.StrategyReportMessage memory original = CrossChainCodec
            .StrategyReportMessage({
                strategyId: 1,
                success: false,
                returnedAmount: 90 ether,
                pnl: -10 ether,
                newTotalRemoteAssets: 0
            });

        bytes memory encoded = CrossChainCodec.encodeStrategyReport(original);
        CrossChainCodec.StrategyReportMessage memory decoded = wrapper
            .decodeStrategyReport(encoded);

        assertEq(decoded.pnl, -10 ether);
        assertFalse(decoded.success);
    }

    function test_strategyReport_messageTypeByte() public view {
        CrossChainCodec.StrategyReportMessage memory msg_ = CrossChainCodec
            .StrategyReportMessage({
                strategyId: 0,
                success: true,
                returnedAmount: 0,
                pnl: 0,
                newTotalRemoteAssets: 0
            });
        bytes memory encoded = CrossChainCodec.encodeStrategyReport(msg_);
        assertEq(
            wrapper.messageType(encoded),
            CrossChainCodec.MSG_STRATEGY_REPORT
        );
    }

    // ── Emergency Sync ──────────────────────────────────────────────────

    function test_emergencySync_roundtrip() public view {
        CrossChainCodec.EmergencySyncMessage memory original = CrossChainCodec
            .EmergencySyncMessage({
                paused: true,
                emergencyMode: true,
                reason: bytes("circuit breaker triggered")
            });

        bytes memory encoded = CrossChainCodec.encodeEmergencySync(original);
        CrossChainCodec.EmergencySyncMessage memory decoded = wrapper
            .decodeEmergencySync(encoded);

        assertEq(decoded.paused, original.paused);
        assertEq(decoded.emergencyMode, original.emergencyMode);
        assertEq(decoded.reason, original.reason);
    }

    function test_emergencySync_emptyReason() public view {
        CrossChainCodec.EmergencySyncMessage memory original = CrossChainCodec
            .EmergencySyncMessage({
                paused: false,
                emergencyMode: false,
                reason: bytes("")
            });

        bytes memory encoded = CrossChainCodec.encodeEmergencySync(original);
        CrossChainCodec.EmergencySyncMessage memory decoded = wrapper
            .decodeEmergencySync(encoded);

        assertFalse(decoded.paused);
        assertFalse(decoded.emergencyMode);
        assertEq(decoded.reason.length, 0);
    }

    function test_emergencySync_messageTypeByte() public view {
        CrossChainCodec.EmergencySyncMessage memory msg_ = CrossChainCodec
            .EmergencySyncMessage({
                paused: true,
                emergencyMode: false,
                reason: bytes("")
            });
        bytes memory encoded = CrossChainCodec.encodeEmergencySync(msg_);
        assertEq(
            wrapper.messageType(encoded),
            CrossChainCodec.MSG_EMERGENCY_SYNC
        );
    }

    // ── Deposit Ack ─────────────────────────────────────────────────────

    function test_depositAck_roundtrip() public view {
        CrossChainCodec.DepositAckMessage memory original = CrossChainCodec
            .DepositAckMessage({
                depositNonce: 42,
                globalTotalAssets: 10_000_000 ether,
                accepted: true
            });

        bytes memory encoded = CrossChainCodec.encodeDepositAck(original);
        CrossChainCodec.DepositAckMessage memory decoded = wrapper
            .decodeDepositAck(encoded);

        assertEq(decoded.depositNonce, original.depositNonce);
        assertEq(decoded.globalTotalAssets, original.globalTotalAssets);
        assertEq(decoded.accepted, original.accepted);
    }

    function test_depositAck_rejected() public view {
        CrossChainCodec.DepositAckMessage memory original = CrossChainCodec
            .DepositAckMessage({
                depositNonce: 0,
                globalTotalAssets: 0,
                accepted: false
            });

        bytes memory encoded = CrossChainCodec.encodeDepositAck(original);
        CrossChainCodec.DepositAckMessage memory decoded = wrapper
            .decodeDepositAck(encoded);

        assertFalse(decoded.accepted);
    }

    function test_depositAck_messageTypeByte() public view {
        CrossChainCodec.DepositAckMessage memory msg_ = CrossChainCodec
            .DepositAckMessage({
                depositNonce: 0,
                globalTotalAssets: 0,
                accepted: true
            });
        bytes memory encoded = CrossChainCodec.encodeDepositAck(msg_);
        assertEq(wrapper.messageType(encoded), CrossChainCodec.MSG_DEPOSIT_ACK);
    }

    // ── Withdraw Fulfill ────────────────────────────────────────────────

    function test_withdrawFulfill_roundtrip() public view {
        CrossChainCodec.WithdrawFulfillMessage memory original = CrossChainCodec
            .WithdrawFulfillMessage({
                withdrawNonce: 3,
                amount: 25 ether,
                fullyFulfilled: true
            });

        bytes memory encoded = CrossChainCodec.encodeWithdrawFulfill(original);
        CrossChainCodec.WithdrawFulfillMessage memory decoded = wrapper
            .decodeWithdrawFulfill(encoded);

        assertEq(decoded.withdrawNonce, original.withdrawNonce);
        assertEq(decoded.amount, original.amount);
        assertEq(decoded.fullyFulfilled, original.fullyFulfilled);
    }

    function test_withdrawFulfill_partial() public view {
        CrossChainCodec.WithdrawFulfillMessage memory original = CrossChainCodec
            .WithdrawFulfillMessage({
                withdrawNonce: 1,
                amount: 10 ether,
                fullyFulfilled: false
            });

        bytes memory encoded = CrossChainCodec.encodeWithdrawFulfill(original);
        CrossChainCodec.WithdrawFulfillMessage memory decoded = wrapper
            .decodeWithdrawFulfill(encoded);

        assertFalse(decoded.fullyFulfilled);
    }

    function test_withdrawFulfill_messageTypeByte() public view {
        CrossChainCodec.WithdrawFulfillMessage memory msg_ = CrossChainCodec
            .WithdrawFulfillMessage({
                withdrawNonce: 0,
                amount: 0,
                fullyFulfilled: true
            });
        bytes memory encoded = CrossChainCodec.encodeWithdrawFulfill(msg_);
        assertEq(
            wrapper.messageType(encoded),
            CrossChainCodec.MSG_WITHDRAW_FULFILL
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Error Tests
// ═══════════════════════════════════════════════════════════════════════════

contract CrossChainCodec_Error_Test is Test {
    CrossChainCodecWrapper internal wrapper;

    function setUp() public {
        wrapper = new CrossChainCodecWrapper();
    }

    function testRevert_messageType_emptyBody() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                0,
                1
            )
        );
        wrapper.messageType(bytes(""));
    }

    function testRevert_decodeDepositSync_tooShort() public {
        bytes memory tooShort = new bytes(20);
        tooShort[0] = bytes1(CrossChainCodec.MSG_DEPOSIT_SYNC);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                20,
                33
            )
        );
        wrapper.decodeDepositSync(tooShort);
    }

    function testRevert_decodeAssetSync_tooShort() public {
        bytes memory tooShort = new bytes(10);
        tooShort[0] = bytes1(CrossChainCodec.MSG_ASSET_SYNC);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                10,
                33
            )
        );
        wrapper.decodeAssetSync(tooShort);
    }

    function testRevert_decodeWithdrawRequest_tooShort() public {
        bytes memory tooShort = new bytes(5);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                5,
                33
            )
        );
        wrapper.decodeWithdrawRequest(tooShort);
    }

    function testRevert_decodeStrategyReport_tooShort() public {
        bytes memory tooShort = new bytes(32);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                32,
                33
            )
        );
        wrapper.decodeStrategyReport(tooShort);
    }

    function testRevert_decodeEmergencySync_tooShort() public {
        bytes memory tooShort = new bytes(1);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                1,
                33
            )
        );
        wrapper.decodeEmergencySync(tooShort);
    }

    function testRevert_decodeDepositAck_tooShort() public {
        bytes memory tooShort = new bytes(16);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                16,
                33
            )
        );
        wrapper.decodeDepositAck(tooShort);
    }

    function testRevert_decodeWithdrawFulfill_tooShort() public {
        bytes memory tooShort = new bytes(2);
        vm.expectRevert(
            abi.encodeWithSelector(
                CrossChainCodec.MessageTooShort.selector,
                2,
                33
            )
        );
        wrapper.decodeWithdrawFulfill(tooShort);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Message Type Constants Test
// ═══════════════════════════════════════════════════════════════════════════

contract CrossChainCodec_Constants_Test is Test {
    function test_messageTypeConstants_unique() public pure {
        uint8[7] memory types = [
            CrossChainCodec.MSG_DEPOSIT_SYNC,
            CrossChainCodec.MSG_WITHDRAW_REQUEST,
            CrossChainCodec.MSG_ASSET_SYNC,
            CrossChainCodec.MSG_STRATEGY_REPORT,
            CrossChainCodec.MSG_EMERGENCY_SYNC,
            CrossChainCodec.MSG_DEPOSIT_ACK,
            CrossChainCodec.MSG_WITHDRAW_FULFILL
        ];

        for (uint256 i = 0; i < types.length; i++) {
            for (uint256 j = i + 1; j < types.length; j++) {
                assertTrue(
                    types[i] != types[j],
                    "Message type constants must be unique"
                );
            }
        }
    }

    function test_messageTypeConstants_values() public pure {
        assertEq(CrossChainCodec.MSG_DEPOSIT_SYNC, 0x01);
        assertEq(CrossChainCodec.MSG_WITHDRAW_REQUEST, 0x02);
        assertEq(CrossChainCodec.MSG_ASSET_SYNC, 0x03);
        assertEq(CrossChainCodec.MSG_STRATEGY_REPORT, 0x04);
        assertEq(CrossChainCodec.MSG_EMERGENCY_SYNC, 0x05);
        assertEq(CrossChainCodec.MSG_DEPOSIT_ACK, 0x06);
        assertEq(CrossChainCodec.MSG_WITHDRAW_FULFILL, 0x07);
    }
}
