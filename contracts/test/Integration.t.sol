// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ObidotVault} from "../src/ObidotVault.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {IXcm} from "../src/interfaces/IXcm.sol";

// ── Mock Contracts ──────────────────────────────────────────────────────────

contract MockERC20Integration is ERC20 {
    uint8 private _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }

    function burn(address from, uint256 amt) external {
        _burn(from, amt);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }
}

contract MockOracleIntegration is IAggregatorV3 {
    int256 public price;
    uint8 private _dec;
    uint256 public lastUpdated;
    uint80 public roundId;

    constructor(int256 _price, uint8 dec_) {
        price = _price;
        _dec = dec_;
        lastUpdated = block.timestamp;
        roundId = 1;
    }

    function setPrice(int256 _price) external {
        price = _price;
        lastUpdated = block.timestamp;
        roundId++;
    }

    function decimals() external view override returns (uint8) {
        return _dec;
    }

    function description() external pure override returns (string memory) {
        return "MOCK / USD";
    }

    function version() external pure override returns (uint256) {
        return 3;
    }

    function getRoundData(uint80 _roundId) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, price, block.timestamp, lastUpdated, _roundId);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, price, block.timestamp, lastUpdated, roundId);
    }
}

contract MockXcmIntegration is IXcm {
    uint256 public mockRefTime;
    uint256 public mockProofSize;
    uint256 public sendCallCount;

    constructor() {
        mockRefTime = 500_000_000_000;
        mockProofSize = 524_288;
    }

    function send(bytes calldata, bytes calldata) external {
        sendCallCount++;
    }

    function weighMessage(bytes calldata) external view returns (uint64, uint64) {
        return (uint64(mockRefTime), uint64(mockProofSize));
    }
}

// ── Integration Test Base ───────────────────────────────────────────────────

abstract contract IntegrationTestBase is Test {
    MockERC20Integration internal token;
    MockOracleIntegration internal oracle;
    ObidotVault internal vault;

    address internal admin = makeAddr("admin");
    uint256 internal strategistPk = 0xA11CE;
    address internal strategist;
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal relayer = makeAddr("relayer");
    address internal treasury = makeAddr("treasury");

    uint256 internal constant DEPOSIT_CAP = 1_000_000 ether;
    uint256 internal constant MAX_DAILY_LOSS = 50_000 ether;
    uint64 internal constant MAX_REF_TIME = 1_000_000_000_000;
    uint64 internal constant MAX_PROOF_SIZE = 1_048_576;
    uint32 internal constant PARA_ASTAR = 2006;
    address internal targetProtocol = makeAddr("targetProtocol");
    address internal constant XCM_PRECOMPILE_ADDR = address(0xA0000);

    function setUp() public virtual {
        vm.warp(10_000);

        strategist = vm.addr(strategistPk);

        // Deploy mock token, oracle, and XCM precompile
        token = new MockERC20Integration("Mock DOT", "mDOT", 18);
        oracle = new MockOracleIntegration(1e8, 8); // $1 USD

        MockXcmIntegration xcm = new MockXcmIntegration();
        vm.etch(XCM_PRECOMPILE_ADDR, address(xcm).code);
        _resetXcmMockStorage();

        // Deploy vault
        vault = new ObidotVault(
            IERC20(address(token)), address(oracle), DEPOSIT_CAP, MAX_DAILY_LOSS, MAX_REF_TIME, MAX_PROOF_SIZE, admin
        );

        // Configure vault
        vm.startPrank(admin);
        vault.grantRole(vault.STRATEGIST_ROLE(), strategist);
        vault.grantRole(vault.KEEPER_ROLE(), keeper);
        vault.setParachainAllowed(PARA_ASTAR, true);
        vault.setProtocolAllowed(targetProtocol, true);
        vault.setProtocolExposureCap(targetProtocol, 500_000 ether);
        vault.setWithdrawalTimelock(1 hours);
        vault.setPerformanceFee(1000, treasury); // 10% performance fee
        vm.stopPrank();

        // Fund users
        token.mint(alice, 100_000 ether);
        token.mint(bob, 100_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function _resetXcmMockStorage() internal {
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(0)), bytes32(uint256(500_000_000_000)));
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(1)), bytes32(uint256(524_288)));
    }

    function _defaultIntent(uint256 amount) internal view returns (ObidotVault.StrategyIntent memory) {
        return ObidotVault.StrategyIntent({
            asset: address(token),
            amount: amount,
            minReturn: amount,
            maxSlippageBps: 100,
            deadline: block.timestamp + 1 hours,
            nonce: vault.nonces(strategist),
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_ASTAR,
            targetProtocol: targetProtocol
        });
    }

    function _signIntent(ObidotVault.StrategyIntent memory intent) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                vault.STRATEGY_INTENT_TYPEHASH(),
                intent.asset,
                intent.amount,
                intent.minReturn,
                intent.maxSlippageBps,
                intent.deadline,
                intent.nonce,
                keccak256(intent.xcmCall),
                intent.targetParachain,
                intent.targetProtocol
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(strategistPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _dummyXcmCall() internal pure returns (bytes memory) {
        return hex"000300010300a10f04000101002c01000000000000000000000000000000";
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.prank(user);
        vault.deposit(amount, user);
    }

    function _executeStrategy(uint256 amount) internal returns (uint256 strategyId) {
        ObidotVault.StrategyIntent memory intent = _defaultIntent(amount);
        bytes memory sig = _signIntent(intent);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
        strategyId = 0; // first strategy
        // Burn tokens to simulate XCM transfer
        token.burn(address(vault), amount);
    }
}

// ── Full Lifecycle Integration Test ─────────────────────────────────────────

/**
 * Tests the complete vault lifecycle:
 * 1. Multiple users deposit
 * 2. Strategist sends funds via XCM strategy
 * 3. Keeper reports profitable outcome
 * 4. Performance fees are accrued
 * 5. User requests withdrawal from queue
 * 6. Withdrawal is fulfilled after timelock
 * 7. Second user redeems directly (from idle balance)
 */
contract Integration_FullLifecycle_Test is IntegrationTestBase {
    function test_full_deposit_strategy_outcome_withdraw_lifecycle() public {
        // ── Step 1: Alice and Bob deposit ────────────────────────────────
        uint256 aliceDeposit = 10_000 ether;
        uint256 bobDeposit = 5_000 ether;

        _depositAs(alice, aliceDeposit);
        _depositAs(bob, bobDeposit);

        uint256 totalDeposited = aliceDeposit + bobDeposit;
        assertEq(vault.totalAssets(), totalDeposited, "totalAssets after deposits");
        assertGt(vault.balanceOf(alice), 0, "Alice has shares");
        assertGt(vault.balanceOf(bob), 0, "Bob has shares");

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobShares = vault.balanceOf(bob);

        // ── Step 2: Execute strategy (deploy 8k to Astar DeFi) ──────────
        uint256 strategyAmount = 8_000 ether;
        ObidotVault.StrategyIntent memory intent = _defaultIntent(strategyAmount);
        bytes memory sig = _signIntent(intent);

        vm.prank(relayer);
        vault.executeStrategy(intent, sig);

        // Simulate XCM precompile transferring tokens out
        token.burn(address(vault), strategyAmount);

        // Verify accounting
        uint256 idleAfterStrategy = totalDeposited - strategyAmount;
        assertEq(token.balanceOf(address(vault)), idleAfterStrategy, "idle after strategy");
        assertEq(vault.totalRemoteAssets(), strategyAmount, "remote assets tracked");
        assertEq(vault.totalAssets(), totalDeposited, "totalAssets unchanged (idle + remote)");

        // ── Step 3: Keeper reports profitable outcome (10% gain) ────────
        uint256 returnedAmount = strategyAmount + 800 ether; // 10% profit
        token.mint(address(vault), returnedAmount); // Simulate funds returning

        vm.prank(keeper);
        vault.reportStrategyOutcome(0, true, returnedAmount);

        // Remote assets should be zeroed, idle should have the returned amount
        assertEq(vault.totalRemoteAssets(), 0, "remote zeroed after outcome");
        uint256 expectedTotal = idleAfterStrategy + returnedAmount;
        assertEq(vault.totalAssets(), expectedTotal, "totalAssets includes profit");

        // ── Step 4: Verify PnL tracking ─────────────────────────────────
        assertGt(vault.cumulativePnL(), 0, "cumulative PnL positive");

        // ── Step 5: Alice requests withdrawal via queue ─────────────────
        uint256 aliceSharesToWithdraw = aliceShares / 2;
        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(aliceSharesToWithdraw);

        // Alice's shares should be burned (locked)
        assertEq(vault.balanceOf(alice), aliceShares - aliceSharesToWithdraw, "Alice shares reduced");

        // ── Step 6: Fulfill withdrawal after timelock ───────────────────
        vm.warp(block.timestamp + 1 hours + 1);

        // Refresh oracle to avoid staleness
        oracle.setPrice(1e8);

        uint256 aliceBalanceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.fulfillWithdrawal(requestId);

        assertGt(token.balanceOf(alice), aliceBalanceBefore, "Alice received assets");

        // ── Step 7: Bob redeems directly ────────────────────────────────
        uint256 bobBalanceBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.redeem(bobShares, bob, bob);

        assertGt(token.balanceOf(bob), bobBalanceBefore, "Bob received assets");
        assertEq(vault.balanceOf(bob), 0, "Bob has no shares left");

        // Bob should get more than he deposited (due to profit)
        assertGt(token.balanceOf(bob) - (100_000 ether - bobDeposit), bobDeposit, "Bob profited");
    }

    function test_deposit_strategy_loss_circuit_breaker() public {
        // ── Step 1: Alice deposits ──────────────────────────────────────
        uint256 aliceDeposit = 80_000 ether;
        _depositAs(alice, aliceDeposit);

        // ── Step 2: Execute strategy ────────────────────────────────────
        uint256 strategyAmount = 60_000 ether;
        ObidotVault.StrategyIntent memory intent = _defaultIntent(strategyAmount);
        bytes memory sig = _signIntent(intent);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
        token.burn(address(vault), strategyAmount);

        // ── Step 3: Keeper reports catastrophic loss ─────────────────────
        uint256 returnedAmount = 5_000 ether; // Lost 55k of 60k
        token.mint(address(vault), returnedAmount);

        vm.prank(keeper);
        vault.reportStrategyOutcome(0, false, returnedAmount);

        // ── Step 4: Vault should be paused (circuit breaker) ────────────
        assertTrue(vault.paused(), "Vault paused by circuit breaker");
        assertTrue(vault.emergencyMode(), "Emergency mode activated");

        // ── Step 5: New deposits should be blocked ──────────────────────
        vm.prank(bob);
        vm.expectRevert();
        vault.deposit(1_000 ether, bob);

        // ── Step 6: Emergency withdrawal should still work ──────────────
        uint256 aliceShares = vault.balanceOf(alice);
        assertGt(aliceShares, 0, "Alice has shares");

        uint256 aliceBalBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);

        assertGt(token.balanceOf(alice), aliceBalBefore, "Alice got emergency withdrawal");
        assertEq(vault.balanceOf(alice), 0, "Alice drained shares");
    }

    function test_batch_strategy_execution() public {
        // ── Setup: Alice deposits ───────────────────────────────────────
        _depositAs(alice, 50_000 ether);

        // ── Whitelist a second protocol ─────────────────────────────────
        address protocol2 = makeAddr("protocol2");
        vm.startPrank(admin);
        vault.setProtocolAllowed(protocol2, true);
        vault.setProtocolExposureCap(protocol2, 500_000 ether);
        vm.stopPrank();

        // ── Build two strategy intents ──────────────────────────────────
        ObidotVault.StrategyIntent memory intent1 = _defaultIntent(10_000 ether);
        bytes memory sig1 = _signIntent(intent1);

        ObidotVault.StrategyIntent memory intent2 = ObidotVault.StrategyIntent({
            asset: address(token),
            amount: 5_000 ether,
            minReturn: 5_000 ether,
            maxSlippageBps: 100,
            deadline: block.timestamp + 1 hours,
            nonce: vault.nonces(strategist),
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_ASTAR,
            targetProtocol: protocol2
        });
        // Nonce for intent2 must be 1 (after intent1 increments it)
        // executeStrategies processes sequentially, so nonce auto-increments
        intent2.nonce = intent1.nonce + 1;
        bytes memory sig2 = _signIntent(intent2);

        // ── Execute batch ───────────────────────────────────────────────
        ObidotVault.StrategyIntent[] memory intents = new ObidotVault.StrategyIntent[](2);
        intents[0] = intent1;
        intents[1] = intent2;

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = sig1;
        sigs[1] = sig2;

        vm.prank(relayer);
        vault.executeStrategies(intents, sigs);

        // ── Verify both strategies tracked ──────────────────────────────
        assertEq(vault.totalRemoteAssets(), 15_000 ether, "Both strategy amounts tracked");
        assertEq(vault.nonces(strategist), intent1.nonce + 2, "Nonce incremented twice");
    }

    function test_withdrawal_queue_cancel_and_re_request() public {
        // ── Setup ───────────────────────────────────────────────────────
        _depositAs(alice, 10_000 ether);
        uint256 shares = vault.balanceOf(alice);

        // ── Request withdrawal ──────────────────────────────────────────
        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares / 2);

        uint256 sharesAfterRequest = vault.balanceOf(alice);
        assertEq(sharesAfterRequest, shares - shares / 2, "Half shares burned");

        // ── Cancel withdrawal ───────────────────────────────────────────
        vm.prank(alice);
        vault.cancelWithdrawal(requestId);

        assertEq(vault.balanceOf(alice), shares, "All shares returned after cancel");

        // ── Re-request and fulfill ──────────────────────────────────────
        vm.prank(alice);
        uint256 requestId2 = vault.requestWithdrawal(shares / 4);

        vm.warp(block.timestamp + 1 hours + 1);
        oracle.setPrice(1e8);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.fulfillWithdrawal(requestId2);

        assertGt(token.balanceOf(alice), balBefore, "Alice received assets after re-request");
    }

    function test_performance_fee_accrual_on_profit() public {
        // ── Setup ───────────────────────────────────────────────────────
        _depositAs(alice, 50_000 ether);

        // ── Execute and report profitable strategy ──────────────────────
        uint256 strategyAmount = 30_000 ether;
        ObidotVault.StrategyIntent memory intent = _defaultIntent(strategyAmount);
        bytes memory sig = _signIntent(intent);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
        token.burn(address(vault), strategyAmount);

        // 20% profit
        uint256 returnedAmount = strategyAmount + 6_000 ether;
        token.mint(address(vault), returnedAmount);

        uint256 treasurySharesBefore = vault.balanceOf(treasury);

        vm.prank(keeper);
        vault.reportStrategyOutcome(0, true, returnedAmount);

        // Treasury should have received performance fee shares
        uint256 treasurySharesAfter = vault.balanceOf(treasury);
        assertGt(treasurySharesAfter, treasurySharesBefore, "Treasury received fee shares");

        // High water mark should be updated
        assertGt(vault.highWaterMark(), 50_000 ether, "High water mark increased");
    }

    function test_permissionless_relay_of_signed_intent() public {
        // ── Setup ───────────────────────────────────────────────────────
        _depositAs(alice, 20_000 ether);

        // ── Any address can relay a valid signed strategy ───────────────
        ObidotVault.StrategyIntent memory intent = _defaultIntent(5_000 ether);
        bytes memory sig = _signIntent(intent);

        // Random address relays
        address randomRelayer = makeAddr("random");
        vm.prank(randomRelayer);
        vault.executeStrategy(intent, sig);

        assertEq(vault.totalRemoteAssets(), 5_000 ether, "Strategy executed by random relayer");
    }

    function test_multi_user_proportional_emergency_withdrawal() public {
        // ── Setup: Both users deposit ───────────────────────────────────
        _depositAs(alice, 20_000 ether);
        _depositAs(bob, 10_000 ether);

        // ── Deploy most funds remotely ──────────────────────────────────
        uint256 strategyAmount = 25_000 ether;
        ObidotVault.StrategyIntent memory intent = _defaultIntent(strategyAmount);
        bytes memory sig = _signIntent(intent);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
        token.burn(address(vault), strategyAmount);

        // Only 5k idle, 25k remote
        assertEq(token.balanceOf(address(vault)), 5_000 ether, "5k idle");

        // ── Admin triggers emergency ────────────────────────────────────
        vm.prank(admin);
        vault.enableEmergencyMode();

        // ── Both users withdraw proportionally from idle ────────────────
        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobShares = vault.balanceOf(bob);

        uint256 aliceBalBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);
        uint256 aliceReceived = token.balanceOf(alice) - aliceBalBefore;

        uint256 bobBalBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.redeem(bobShares, bob, bob);
        uint256 bobReceived = token.balanceOf(bob) - bobBalBefore;

        // Alice deposited 2x Bob, so should receive ~2x
        // Allow 1% tolerance for rounding
        assertApproxEqRel(aliceReceived, bobReceived * 2, 0.01e18, "Alice gets ~2x Bob in emergency");
    }
}
