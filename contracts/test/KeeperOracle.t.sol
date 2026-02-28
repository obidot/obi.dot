// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {KeeperOracle} from "../src/KeeperOracle.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  Test Base
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracleTestBase is Test {
    KeeperOracle internal oracle;

    address internal admin = address(0xAD);
    address internal keeper = address(0xBE);
    address internal keeper2 = address(0xBF);
    address internal alice = address(0xA1);

    int256 internal constant INITIAL_PRICE = 700_000_000; // $7.00, 8 decimals
    uint8 internal constant DECIMALS = 8;
    uint256 internal constant HEARTBEAT = 3600; // 1 hour
    uint16 internal constant DEVIATION_THRESHOLD = 100; // 1%
    uint16 internal constant MAX_DEVIATION = 1000; // 10%

    function setUp() public virtual {
        oracle = new KeeperOracle(
            admin, keeper, DECIMALS, "DOT / USD", HEARTBEAT, INITIAL_PRICE, DEVIATION_THRESHOLD, MAX_DEVIATION
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Constructor Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_Constructor_Test is KeeperOracleTestBase {
    function test_initialState() public view {
        assertEq(oracle.decimals(), DECIMALS);
        assertEq(oracle.description(), "DOT / USD");
        assertEq(oracle.heartbeat(), HEARTBEAT);
        assertEq(oracle.latestAnswer(), INITIAL_PRICE);
        assertEq(oracle.currentRoundId(), 1);
        assertEq(oracle.deviationThresholdBps(), DEVIATION_THRESHOLD);
        assertEq(oracle.maxDeviationBps(), MAX_DEVIATION);
        assertEq(oracle.requiredSignatures(), 1);
        assertEq(oracle.version(), 2);
    }

    function test_initialRoundStored() public view {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            oracle.getRoundData(1);

        assertEq(roundId, 1);
        assertEq(answer, INITIAL_PRICE);
        assertGt(startedAt, 0);
        assertEq(updatedAt, startedAt);
        assertEq(answeredInRound, 1);
    }

    function test_roles() public view {
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(oracle.hasRole(oracle.KEEPER_ROLE(), keeper));
    }

    function testRevert_invalidInitialPrice() public {
        vm.expectRevert(abi.encodeWithSelector(KeeperOracle.InvalidPrice.selector, int256(0)));
        new KeeperOracle(admin, keeper, DECIMALS, "X", HEARTBEAT, 0, 0, 0);
    }

    function testRevert_negativeInitialPrice() public {
        vm.expectRevert(abi.encodeWithSelector(KeeperOracle.InvalidPrice.selector, int256(-1)));
        new KeeperOracle(admin, keeper, DECIMALS, "X", HEARTBEAT, -1, 0, 0);
    }

    function testRevert_zeroHeartbeat() public {
        vm.expectRevert(KeeperOracle.InvalidHeartbeat.selector);
        new KeeperOracle(admin, keeper, DECIMALS, "X", 0, INITIAL_PRICE, 0, 0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Price Update Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_UpdatePrice_Test is KeeperOracleTestBase {
    function test_updateAfterHeartbeat() public {
        // Warp past heartbeat
        vm.warp(block.timestamp + HEARTBEAT);

        vm.prank(keeper);
        oracle.updatePrice(710_000_000); // $7.10

        assertEq(oracle.latestAnswer(), 710_000_000);
        assertEq(oracle.currentRoundId(), 2);
    }

    function test_updateWithSufficientDeviation() public {
        // Don't warp — heartbeat not expired
        // But price deviates > 1% (threshold)
        int256 newPrice = 715_000_000; // $7.15 = +2.14% from $7.00

        vm.prank(keeper);
        oracle.updatePrice(newPrice);

        assertEq(oracle.latestAnswer(), newPrice);
        assertEq(oracle.currentRoundId(), 2);
    }

    function testRevert_updateNotNeeded() public {
        // Price within 1% deviation and heartbeat not expired
        int256 newPrice = 700_500_000; // $7.005 = +0.07% from $7.00

        vm.prank(keeper);
        vm.expectRevert(KeeperOracle.UpdateNotNeeded.selector);
        oracle.updatePrice(newPrice);
    }

    function testRevert_deviationTooLarge() public {
        // Warp past heartbeat to avoid UpdateNotNeeded
        vm.warp(block.timestamp + HEARTBEAT);

        // Price deviates > 10% (maxDeviationBps)
        int256 newPrice = 800_000_000; // $8.00 = +14.3% from $7.00

        vm.prank(keeper);
        vm.expectRevert(); // DeviationTooLarge
        oracle.updatePrice(newPrice);
    }

    function testRevert_invalidPrice() public {
        vm.warp(block.timestamp + HEARTBEAT);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperOracle.InvalidPrice.selector, int256(0)));
        oracle.updatePrice(0);
    }

    function testRevert_negativePrice() public {
        vm.warp(block.timestamp + HEARTBEAT);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(KeeperOracle.InvalidPrice.selector, int256(-100)));
        oracle.updatePrice(-100);
    }

    function testRevert_unauthorizedKeeper() public {
        vm.warp(block.timestamp + HEARTBEAT);

        vm.prank(alice);
        vm.expectRevert();
        oracle.updatePrice(710_000_000);
    }

    function test_updateWithZeroDeviationThreshold() public {
        // Deploy oracle with no deviation threshold (backward-compatible mode)
        KeeperOracle permissive = new KeeperOracle(
            admin,
            keeper,
            DECIMALS,
            "DOT / USD",
            HEARTBEAT,
            INITIAL_PRICE,
            0, // No deviation threshold
            MAX_DEVIATION
        );

        // Should accept any update even within heartbeat
        vm.prank(keeper);
        permissive.updatePrice(700_100_000); // tiny change

        assertEq(permissive.latestAnswer(), 700_100_000);
    }

    function test_deviationCapDisabled() public {
        // Deploy with maxDeviationBps = 0 (no cap)
        KeeperOracle noCap = new KeeperOracle(
            admin,
            keeper,
            DECIMALS,
            "DOT / USD",
            HEARTBEAT,
            INITIAL_PRICE,
            0,
            0 // No deviation cap
        );

        vm.prank(keeper);
        noCap.updatePrice(1_400_000_000); // $14.00 = +100% — should pass

        assertEq(noCap.latestAnswer(), 1_400_000_000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Force Update Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_ForceUpdate_Test is KeeperOracleTestBase {
    function test_adminForceUpdate() public {
        // Large price move that would exceed maxDeviationBps
        vm.prank(admin);
        oracle.forceUpdatePrice(1_000_000_000); // $10.00

        assertEq(oracle.latestAnswer(), 1_000_000_000);
    }

    function testRevert_keeperCannotForceUpdate() public {
        vm.prank(keeper);
        vm.expectRevert();
        oracle.forceUpdatePrice(1_000_000_000);
    }

    function testRevert_forceUpdateInvalidPrice() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(KeeperOracle.InvalidPrice.selector, int256(0)));
        oracle.forceUpdatePrice(0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Ring Buffer & Historical Data Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_RingBuffer_Test is KeeperOracleTestBase {
    function test_historicalRoundData() public {
        // Push 3 updates
        vm.startPrank(keeper);
        vm.warp(block.timestamp + HEARTBEAT);
        oracle.updatePrice(710_000_000);

        vm.warp(block.timestamp + HEARTBEAT);
        oracle.updatePrice(720_000_000);

        vm.warp(block.timestamp + HEARTBEAT);
        oracle.updatePrice(730_000_000);
        vm.stopPrank();

        // Round 1 = initial, Round 2 = 710, Round 3 = 720, Round 4 = 730
        assertEq(oracle.currentRoundId(), 4);

        (, int256 answer2,,,) = oracle.getRoundData(2);
        assertEq(answer2, 710_000_000);

        (, int256 answer3,,,) = oracle.getRoundData(3);
        assertEq(answer3, 720_000_000);

        (, int256 answer4,,,) = oracle.getRoundData(4);
        assertEq(answer4, 730_000_000);
    }

    function test_nonExistentRoundReturnsZero() public view {
        // Round 99 doesn't exist
        (, int256 answer,, uint256 updatedAt,) = oracle.getRoundData(99);
        assertEq(answer, 0);
        assertEq(updatedAt, 0);
    }

    function test_roundUpdater() public {
        vm.warp(block.timestamp + HEARTBEAT);
        vm.prank(keeper);
        oracle.updatePrice(710_000_000);

        assertEq(oracle.roundUpdater(2), keeper);
    }

    function test_oldestAvailableRound() public view {
        // Only 1 round, less than MAX_HISTORY
        assertEq(oracle.oldestAvailableRound(), 1);
    }

    function test_oldestRoundAfterManyUpdates() public {
        // Push MAX_HISTORY + 10 updates
        vm.startPrank(keeper);
        for (uint256 i = 0; i < 74; i++) {
            vm.warp(block.timestamp + HEARTBEAT);
            oracle.updatePrice(
                INITIAL_PRICE + int256(i * 100_000) // Small increments within deviation cap
            );
        }
        vm.stopPrank();

        // currentRoundId = 1 + 74 = 75
        assertEq(oracle.currentRoundId(), 75);
        // oldest = 75 - 64 + 1 = 12
        assertEq(oracle.oldestAvailableRound(), 12);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Strict Read & Staleness Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_Staleness_Test is KeeperOracleTestBase {
    function test_latestRoundDataStrict_fresh() public view {
        (uint80 roundId, int256 answer,, uint256 updatedAt,) = oracle.latestRoundDataStrict();

        assertEq(roundId, 1);
        assertEq(answer, INITIAL_PRICE);
        assertGt(updatedAt, 0);
    }

    function testRevert_latestRoundDataStrict_stale() public {
        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.expectRevert(KeeperOracle.OracleStale.selector);
        oracle.latestRoundDataStrict();
    }

    function test_isStale_fresh() public view {
        assertFalse(oracle.isStale());
    }

    function test_isStale_stale() public {
        vm.warp(block.timestamp + HEARTBEAT + 1);
        assertTrue(oracle.isStale());
    }

    function test_isStale_exactlyAtHeartbeat() public {
        vm.warp(block.timestamp + HEARTBEAT);
        // At exactly heartbeat, not stale (uses >)
        assertFalse(oracle.isStale());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Admin Configuration Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_Admin_Test is KeeperOracleTestBase {
    function test_setHeartbeat() public {
        vm.prank(admin);
        oracle.setHeartbeat(7200);
        assertEq(oracle.heartbeat(), 7200);
    }

    function testRevert_setHeartbeat_zero() public {
        vm.prank(admin);
        vm.expectRevert(KeeperOracle.InvalidHeartbeat.selector);
        oracle.setHeartbeat(0);
    }

    function test_setDeviationThreshold() public {
        vm.prank(admin);
        oracle.setDeviationThreshold(200); // 2%
        assertEq(oracle.deviationThresholdBps(), 200);
    }

    function test_setDeviationCap() public {
        vm.prank(admin);
        oracle.setDeviationCap(2000); // 20%
        assertEq(oracle.maxDeviationBps(), 2000);
    }

    function test_setRequiredSignatures() public {
        vm.prank(admin);
        oracle.setRequiredSignatures(3);
        assertEq(oracle.requiredSignatures(), 3);
    }

    function testRevert_setRequiredSignatures_zero() public {
        vm.prank(admin);
        vm.expectRevert(KeeperOracle.InvalidRequiredSignatures.selector);
        oracle.setRequiredSignatures(0);
    }

    function testRevert_nonAdminSetHeartbeat() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.setHeartbeat(7200);
    }

    function testRevert_nonAdminSetDeviationThreshold() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.setDeviationThreshold(200);
    }

    function testRevert_nonAdminSetDeviationCap() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.setDeviationCap(2000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Deviation Cap Boundary Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_DeviationCap_Test is KeeperOracleTestBase {
    function test_updateAtExactDeviationCap() public {
        vm.warp(block.timestamp + HEARTBEAT);

        // maxDeviationBps = 1000 (10%)
        // Current price: 700_000_000
        // 10% up = 770_000_000
        vm.prank(keeper);
        oracle.updatePrice(770_000_000);

        assertEq(oracle.latestAnswer(), 770_000_000);
    }

    function testRevert_updateJustOverDeviationCap() public {
        vm.warp(block.timestamp + HEARTBEAT);

        // 10.01% up = 770_070_000 (just over 10%)
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(770_100_000);
    }

    function test_updateDownwardWithinCap() public {
        vm.warp(block.timestamp + HEARTBEAT);

        // Current: 700_000_000, 10% down = 630_000_000
        vm.prank(keeper);
        oracle.updatePrice(630_000_000);

        assertEq(oracle.latestAnswer(), 630_000_000);
    }

    function test_adminCanBypassCap() public {
        // 50% jump — exceeds cap but admin can force
        vm.prank(admin);
        oracle.forceUpdatePrice(1_050_000_000);

        assertEq(oracle.latestAnswer(), 1_050_000_000);
    }

    function test_adjustCapAndUpdateLargeDeviation() public {
        // Raise cap to 50%
        vm.prank(admin);
        oracle.setDeviationCap(5000);

        vm.warp(block.timestamp + HEARTBEAT);

        // 40% up — now within cap
        vm.prank(keeper);
        oracle.updatePrice(980_000_000);

        assertEq(oracle.latestAnswer(), 980_000_000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IAggregatorV3 Compatibility Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_AggregatorV3_Test is KeeperOracleTestBase {
    function test_latestRoundData() public view {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            oracle.latestRoundData();

        assertEq(roundId, 1);
        assertEq(answer, INITIAL_PRICE);
        assertGt(startedAt, 0);
        assertEq(updatedAt, startedAt);
        assertEq(answeredInRound, 1);
    }

    function test_decimals() public view {
        assertEq(oracle.decimals(), DECIMALS);
    }

    function test_description() public view {
        assertEq(oracle.description(), "DOT / USD");
    }

    function test_version() public view {
        assertEq(oracle.version(), 2);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fuzz Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_Fuzz_Test is KeeperOracleTestBase {
    function testFuzz_deviationCapBoundary(int256 newPrice, uint16 maxDev) public {
        // Bound inputs
        newPrice = bound(newPrice, 1, type(int128).max);
        maxDev = uint16(bound(uint256(maxDev), 1, 9999));

        // Deploy with specific cap
        KeeperOracle fuzzOracle = new KeeperOracle(
            admin,
            keeper,
            DECIMALS,
            "FUZZ",
            HEARTBEAT,
            INITIAL_PRICE,
            0, // no deviation threshold
            maxDev
        );

        vm.warp(block.timestamp + HEARTBEAT);

        // Calculate expected deviation
        int256 diff = newPrice - INITIAL_PRICE;
        if (diff < 0) diff = -diff;
        uint256 deviation = (uint256(diff) * 10_000) / uint256(INITIAL_PRICE);

        vm.prank(keeper);
        if (deviation > maxDev) {
            vm.expectRevert();
        }
        fuzzOracle.updatePrice(newPrice);
    }

    function testFuzz_ringBufferConsistency(uint8 numUpdates) public {
        numUpdates = uint8(bound(uint256(numUpdates), 1, 100));

        vm.startPrank(keeper);
        for (uint256 i = 0; i < numUpdates; i++) {
            vm.warp(block.timestamp + HEARTBEAT);
            int256 price = INITIAL_PRICE + int256(i * 50_000); // Small increments
            oracle.updatePrice(price);
        }
        vm.stopPrank();

        // Verify latest
        assertEq(oracle.currentRoundId(), uint80(1 + numUpdates));
        int256 expectedLatest = INITIAL_PRICE + int256(uint256(numUpdates - 1) * 50_000);
        assertEq(oracle.latestAnswer(), expectedLatest);

        // Verify the last round in history matches latest
        (, int256 lastRoundAnswer,,,) = oracle.getRoundData(oracle.currentRoundId());
        assertEq(lastRoundAnswer, expectedLatest);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Multi-Keeper Role Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_MultiKeeper_Test is KeeperOracleTestBase {
    function setUp() public override {
        super.setUp();

        // Cache role hash before pranking (vm.prank is consumed by external view calls)
        bytes32 keeperRole = oracle.KEEPER_ROLE();
        vm.prank(admin);
        oracle.grantRole(keeperRole, keeper2);
    }

    function test_multipleKeepersCanUpdate() public {
        vm.warp(block.timestamp + HEARTBEAT);
        vm.prank(keeper);
        oracle.updatePrice(710_000_000);

        assertEq(oracle.roundUpdater(2), keeper);

        vm.warp(block.timestamp + HEARTBEAT);
        vm.prank(keeper2);
        oracle.updatePrice(720_000_000);

        assertEq(oracle.roundUpdater(3), keeper2);
    }

    function test_revokeKeeperRole() public {
        bytes32 keeperRole = oracle.KEEPER_ROLE();
        vm.prank(admin);
        oracle.revokeRole(keeperRole, keeper);

        vm.warp(block.timestamp + HEARTBEAT);
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(710_000_000);

        // keeper2 still works
        vm.prank(keeper2);
        oracle.updatePrice(710_000_000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Event Tests
// ═══════════════════════════════════════════════════════════════════════════

contract KeeperOracle_Events_Test is KeeperOracleTestBase {
    function test_emitsPriceUpdated() public {
        vm.warp(block.timestamp + HEARTBEAT);

        vm.expectEmit(true, true, false, true);
        emit KeeperOracle.PriceUpdated(2, 710_000_000, block.timestamp, keeper);

        vm.prank(keeper);
        oracle.updatePrice(710_000_000);
    }

    function test_emitsHeartbeatUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit KeeperOracle.HeartbeatUpdated(7200);

        vm.prank(admin);
        oracle.setHeartbeat(7200);
    }

    function test_emitsDeviationThresholdUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit KeeperOracle.DeviationThresholdUpdated(200);

        vm.prank(admin);
        oracle.setDeviationThreshold(200);
    }

    function test_emitsDeviationCapUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit KeeperOracle.DeviationCapUpdated(2000);

        vm.prank(admin);
        oracle.setDeviationCap(2000);
    }

    function test_emitsRequiredSignaturesUpdated() public {
        vm.expectEmit(false, false, false, true);
        emit KeeperOracle.RequiredSignaturesUpdated(3);

        vm.prank(admin);
        oracle.setRequiredSignatures(3);
    }
}
