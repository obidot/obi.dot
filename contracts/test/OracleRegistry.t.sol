// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  Mock Oracle for Registry Tests
// ═══════════════════════════════════════════════════════════════════════════

/// @dev Minimal oracle mock that returns configurable prices.
contract MockOracleForRegistry is IAggregatorV3 {
    int256 public price;
    uint8 public immutable dec;
    uint256 public updatedAt;
    uint80 public round;

    constructor(int256 price_, uint8 dec_) {
        price = price_;
        dec = dec_;
        updatedAt = block.timestamp;
        round = 1;
    }

    function setPrice(int256 price_) external {
        price = price_;
        updatedAt = block.timestamp;
        round++;
    }

    function setUpdatedAt(uint256 ts) external {
        updatedAt = ts;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (round, price, updatedAt, updatedAt, round);
    }

    function getRoundData(uint80) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (round, price, updatedAt, updatedAt, round);
    }

    function decimals() external view override returns (uint8) {
        return dec;
    }

    function description() external pure override returns (string memory) {
        return "Mock";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Test Base
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistryTestBase is Test {
    OracleRegistry internal registry;
    MockOracleForRegistry internal dotOracle;
    MockOracleForRegistry internal glmrOracle;

    address internal admin = address(0xAD);
    address internal alice = address(0xA1);
    address internal dotToken = address(0xD07);
    address internal glmrToken = address(0x614);

    int256 internal constant DOT_PRICE = 700_000_000; // $7.00, 8 decimals
    int256 internal constant GLMR_PRICE = 30_000_000; // $0.30, 8 decimals
    uint8 internal constant ORACLE_DECIMALS = 8;
    uint256 internal constant HEARTBEAT = 3600; // 1 hour
    uint16 internal constant DEVIATION_BPS = 100; // 1%

    function setUp() public virtual {
        registry = new OracleRegistry(admin);
        dotOracle = new MockOracleForRegistry(DOT_PRICE, ORACLE_DECIMALS);
        glmrOracle = new MockOracleForRegistry(GLMR_PRICE, ORACLE_DECIMALS);

        // Register DOT feed
        vm.prank(admin);
        registry.setFeed(dotToken, address(dotOracle), HEARTBEAT, DEVIATION_BPS);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Constructor Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_Constructor_Test is OracleRegistryTestBase {
    function test_adminHasRole() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    function testRevert_zeroAddressAdmin() public {
        vm.expectRevert(OracleRegistry.ZeroAddress.selector);
        new OracleRegistry(address(0));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  setFeed Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_SetFeed_Test is OracleRegistryTestBase {
    function test_setFeed_success() public view {
        assertTrue(registry.hasFeed(dotToken));
        assertEq(registry.feedCount(), 1);

        (IAggregatorV3 oracle, uint256 hb, uint16 dev, bool active) = registry.feeds(dotToken);

        assertEq(address(oracle), address(dotOracle));
        assertEq(hb, HEARTBEAT);
        assertEq(dev, DEVIATION_BPS);
        assertTrue(active);
    }

    function test_setFeed_secondAsset() public {
        vm.prank(admin);
        registry.setFeed(glmrToken, address(glmrOracle), 7200, 200);

        assertEq(registry.feedCount(), 2);
        assertTrue(registry.hasFeed(glmrToken));
    }

    function test_setFeed_updateExisting() public {
        // Deploy a new oracle for the same asset
        MockOracleForRegistry newOracle = new MockOracleForRegistry(750_000_000, ORACLE_DECIMALS);

        vm.prank(admin);
        registry.setFeed(dotToken, address(newOracle), 7200, 200);

        // Count should still be 1 (not duplicated)
        assertEq(registry.feedCount(), 1);

        (IAggregatorV3 oracle,,,) = registry.feeds(dotToken);
        assertEq(address(oracle), address(newOracle));
    }

    function testRevert_setFeed_zeroAsset() public {
        vm.prank(admin);
        vm.expectRevert(OracleRegistry.ZeroAddress.selector);
        registry.setFeed(address(0), address(dotOracle), HEARTBEAT, DEVIATION_BPS);
    }

    function testRevert_setFeed_zeroOracle() public {
        vm.prank(admin);
        vm.expectRevert(OracleRegistry.ZeroOracleAddress.selector);
        registry.setFeed(dotToken, address(0), HEARTBEAT, DEVIATION_BPS);
    }

    function testRevert_setFeed_zeroHeartbeat() public {
        vm.prank(admin);
        vm.expectRevert(OracleRegistry.ZeroHeartbeat.selector);
        registry.setFeed(dotToken, address(dotOracle), 0, DEVIATION_BPS);
    }

    function testRevert_setFeed_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.setFeed(glmrToken, address(glmrOracle), HEARTBEAT, DEVIATION_BPS);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  disableFeed / enableFeed Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_ToggleFeed_Test is OracleRegistryTestBase {
    function test_disableFeed() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        assertFalse(registry.hasFeed(dotToken));
    }

    function test_enableFeed() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        vm.prank(admin);
        registry.enableFeed(dotToken);

        assertTrue(registry.hasFeed(dotToken));
    }

    function testRevert_disableFeed_notRegistered() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OracleRegistry.FeedNotFound.selector, glmrToken));
        registry.disableFeed(glmrToken);
    }

    function testRevert_enableFeed_notRegistered() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(OracleRegistry.FeedNotFound.selector, glmrToken));
        registry.enableFeed(glmrToken);
    }

    function testRevert_disableFeed_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.disableFeed(dotToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  getPrice Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_GetPrice_Test is OracleRegistryTestBase {
    function test_getPrice_success() public view {
        (int256 price, uint8 dec, uint256 updatedAt) = registry.getPrice(dotToken);

        assertEq(price, DOT_PRICE);
        assertEq(dec, ORACLE_DECIMALS);
        assertGt(updatedAt, 0);
    }

    function test_getPrice_afterUpdate() public {
        dotOracle.setPrice(720_000_000);

        (int256 price,,) = registry.getPrice(dotToken);
        assertEq(price, 720_000_000);
    }

    function testRevert_getPrice_feedNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(OracleRegistry.FeedNotFound.selector, glmrToken));
        registry.getPrice(glmrToken);
    }

    function testRevert_getPrice_feedInactive() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        vm.expectRevert(abi.encodeWithSelector(OracleRegistry.FeedInactive.selector, dotToken));
        registry.getPrice(dotToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  validateSlippage Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_ValidateSlippage_Test is OracleRegistryTestBase {
    function test_validateSlippage_pass() public view {
        uint256 amount = 1000e18;
        // DOT = $7.00 (8 dec), maxSlippage = 5% (500 bps)
        // oracleMin = 1000e18 * 700_000_000 * (10000 - 500) / (10000 * 1e8)
        //           = 1000e18 * 700_000_000 * 9500 / 1e12
        //           = 1000e18 * 6.65e9 / 1e12
        //           = 6650e18
        uint256 minReturn = 6700e18; // Above minimum

        (bool valid, uint256 oracleMinimum) = registry.validateSlippage(dotToken, amount, minReturn, 500);

        assertTrue(valid);
        assertGt(oracleMinimum, 0);
        assertLe(oracleMinimum, minReturn);
    }

    function test_validateSlippage_fail() public view {
        uint256 amount = 1000e18;
        uint256 minReturn = 1e18; // Way below minimum

        (bool valid,) = registry.validateSlippage(dotToken, amount, minReturn, 500);

        assertFalse(valid);
    }

    function testRevert_validateSlippage_staleData() public {
        // Make oracle stale
        vm.warp(block.timestamp + HEARTBEAT + 1);

        uint256 amount = 1000e18;
        uint256 minReturn = 6700e18;

        vm.expectRevert();
        registry.validateSlippage(dotToken, amount, minReturn, 500);
    }

    function testRevert_validateSlippage_negativePrice() public {
        dotOracle.setPrice(-1);

        uint256 amount = 1000e18;
        uint256 minReturn = 6700e18;

        vm.expectRevert();
        registry.validateSlippage(dotToken, amount, minReturn, 500);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  isFeedStale Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_IsFeedStale_Test is OracleRegistryTestBase {
    function test_freshFeed() public view {
        assertFalse(registry.isFeedStale(dotToken));
    }

    function test_staleFeed() public {
        vm.warp(block.timestamp + HEARTBEAT + 1);
        assertTrue(registry.isFeedStale(dotToken));
    }

    function test_nonExistentFeedIsStale() public view {
        assertTrue(registry.isFeedStale(glmrToken));
    }

    function test_disabledFeedIsStale() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        assertTrue(registry.isFeedStale(dotToken));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Enumeration Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_Enumeration_Test is OracleRegistryTestBase {
    function test_getAllRegisteredAssets_single() public view {
        address[] memory assets = registry.getAllRegisteredAssets();

        assertEq(assets.length, 1);
        assertEq(assets[0], dotToken);
    }

    function test_getAllRegisteredAssets_multi() public {
        vm.prank(admin);
        registry.setFeed(glmrToken, address(glmrOracle), HEARTBEAT, DEVIATION_BPS);

        address[] memory assets = registry.getAllRegisteredAssets();
        assertEq(assets.length, 2);
    }

    function test_disabledFeedStillEnumerated() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        address[] memory assets = registry.getAllRegisteredAssets();
        assertEq(assets.length, 1);
        assertEq(assets[0], dotToken);
    }

    function test_feedCount() public {
        assertEq(registry.feedCount(), 1);

        vm.prank(admin);
        registry.setFeed(glmrToken, address(glmrOracle), HEARTBEAT, DEVIATION_BPS);

        assertEq(registry.feedCount(), 2);
    }

    function test_registeredAssets_indexAccess() public view {
        assertEq(registry.registeredAssets(0), dotToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Event Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_Events_Test is OracleRegistryTestBase {
    function test_emitsFeedSet() public {
        vm.expectEmit(true, true, false, true);
        emit OracleRegistry.FeedSet(glmrToken, address(glmrOracle), 7200, 200);

        vm.prank(admin);
        registry.setFeed(glmrToken, address(glmrOracle), 7200, 200);
    }

    function test_emitsFeedDisabled() public {
        vm.expectEmit(true, false, false, false);
        emit OracleRegistry.FeedDisabled(dotToken);

        vm.prank(admin);
        registry.disableFeed(dotToken);
    }

    function test_emitsFeedEnabled() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        vm.expectEmit(true, false, false, false);
        emit OracleRegistry.FeedEnabled(dotToken);

        vm.prank(admin);
        registry.enableFeed(dotToken);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fuzz Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_Fuzz_Test is OracleRegistryTestBase {
    function testFuzz_validateSlippage_minReturnBound(uint256 amount, uint16 maxSlippageBps) public view {
        amount = bound(amount, 1e18, 1_000_000e18);
        maxSlippageBps = uint16(bound(uint256(maxSlippageBps), 1, 5000));

        (bool valid, uint256 oracleMinimum) = registry.validateSlippage(
            dotToken,
            amount,
            type(uint256).max, // max minReturn — should always pass
            maxSlippageBps
        );

        assertTrue(valid);
        // oracleMinimum should be > 0 since price > 0
        assertGt(oracleMinimum, 0);
    }

    function testFuzz_setFeedDoesNotDuplicate(uint8 numSets) public {
        numSets = uint8(bound(uint256(numSets), 1, 20));

        for (uint256 i = 0; i < numSets; i++) {
            int256 newPrice = DOT_PRICE + int256(i * 1_000_000);
            MockOracleForRegistry freshOracle = new MockOracleForRegistry(newPrice, ORACLE_DECIMALS);

            vm.prank(admin);
            registry.setFeed(dotToken, address(freshOracle), HEARTBEAT, DEVIATION_BPS);
        }

        // Only 1 entry in registeredAssets
        assertEq(registry.feedCount(), 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  getPriceStrict Tests
// ═══════════════════════════════════════════════════════════════════════════

contract OracleRegistry_GetPriceStrict_Test is OracleRegistryTestBase {
    function test_getPriceStrict_returns_valid_price() public view {
        (uint256 price, uint8 dec, uint256 updatedAt) = registry.getPriceStrict(dotToken);
        assertEq(price, uint256(uint256(DOT_PRICE)));
        assertEq(dec, ORACLE_DECIMALS);
        assertGt(updatedAt, 0);
    }

    function test_getPriceStrict_reverts_on_stale_data() public {
        // Warp to a reasonable timestamp to avoid underflow
        vm.warp(10_000);
        dotOracle.setPrice(DOT_PRICE); // Refresh price at current time

        // Make oracle stale (beyond heartbeat)
        dotOracle.setUpdatedAt(block.timestamp - HEARTBEAT - 1);

        vm.expectRevert();
        registry.getPriceStrict(dotToken);
    }

    function test_getPriceStrict_reverts_on_zero_price() public {
        dotOracle.setPrice(0);

        vm.expectRevert();
        registry.getPriceStrict(dotToken);
    }

    function test_getPriceStrict_reverts_on_negative_price() public {
        dotOracle.setPrice(-1);

        vm.expectRevert();
        registry.getPriceStrict(dotToken);
    }

    function test_getPriceStrict_reverts_on_inactive_feed() public {
        vm.prank(admin);
        registry.disableFeed(dotToken);

        vm.expectRevert();
        registry.getPriceStrict(dotToken);
    }

    function test_getPriceStrict_vs_getPrice_difference() public view {
        // getPrice returns int256 (raw), getPriceStrict returns uint256 (validated)
        (int256 rawPrice,,) = registry.getPrice(dotToken);
        (uint256 strictPrice,,) = registry.getPriceStrict(dotToken);
        assertEq(uint256(rawPrice), strictPrice);
    }
}
