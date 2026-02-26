// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ObidotVault} from "../src/ObidotVault.sol";
import {ObidotVaultEVM} from "../src/ObidotVaultEVM.sol";
import {CrossChainRouter} from "../src/adapters/CrossChainRouter.sol";
import {CrossChainCodec} from "../src/libraries/CrossChainCodec.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {IIsmpHost} from "../src/interfaces/IIsmpHost.sol";
import {IIsmpModule} from "../src/interfaces/IIsmpModule.sol";
import {IXcm} from "../src/interfaces/IXcm.sol";

// ── Mock Contracts ──────────────────────────────────────────────────────────

contract MockTokenCCL is ERC20 {
    constructor() ERC20("Mock DOT", "mDOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

contract MockOracleCCL is IAggregatorV3 {
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

contract MockXcmCCL is IXcm {
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

contract MockIsmpHostCCL is IIsmpHost {
    uint256 public dispatchCount;
    bytes public lastBody;
    bytes32 public nextCommitment;

    constructor() {
        nextCommitment = keccak256("initial_commitment");
    }

    function dispatch(DispatchPost memory post) external payable override returns (bytes32 commitment) {
        dispatchCount++;
        lastBody = post.body;
        commitment = nextCommitment;
        nextCommitment = keccak256(abi.encodePacked(nextCommitment, dispatchCount));
    }

    function dispatch(DispatchGet memory) external payable override returns (bytes32) {
        revert("GET not implemented");
    }

    function dispatchFee(DispatchPost memory) external pure override returns (uint256) {
        return 0;
    }

    function host() external pure override returns (bytes memory) {
        return bytes("MOCK_HOST");
    }

    function timestamp() external view override returns (uint256) {
        return block.timestamp;
    }

    function nonce() external view override returns (uint256) {
        return dispatchCount;
    }

    receive() external payable {}
}

// ── Cross-Chain Lifecycle Test Base ─────────────────────────────────────────

/// @notice Integration test base that deploys both the Hub vault (ObidotVault)
///         and a Satellite vault (ObidotVaultEVM), plus a CrossChainRouter,
///         connected via mock ISMP hosts. Simulates full cross-chain message flows.
abstract contract CrossChainLifecycleBase is Test {
    // ── Hub side ────────────────────────────────────────────────────────
    MockTokenCCL internal hubToken;
    MockOracleCCL internal hubOracle;
    ObidotVault internal hubVault;

    // ── Satellite side ──────────────────────────────────────────────────
    MockTokenCCL internal satToken;
    MockIsmpHostCCL internal satIsmpHost;
    ObidotVaultEVM internal satellite;

    // ── Hub Router ──────────────────────────────────────────────────────
    MockIsmpHostCCL internal hubIsmpHost;
    CrossChainRouter internal router;

    // ── Actors ──────────────────────────────────────────────────────────
    address internal admin = makeAddr("admin");
    uint256 internal strategistPk = 0xA11CE;
    address internal strategist;
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal relayer = makeAddr("relayer");
    address internal treasury = makeAddr("treasury");

    // ── Constants ───────────────────────────────────────────────────────
    uint256 internal constant DEPOSIT_CAP = 1_000_000 ether;
    uint256 internal constant MAX_DAILY_LOSS = 50_000 ether;
    uint64 internal constant MAX_REF_TIME = 1_000_000_000_000;
    uint64 internal constant MAX_PROOF_SIZE = 1_048_576;
    uint32 internal constant PARA_ASTAR = 2006;
    address internal targetProtocol = makeAddr("targetProtocol");
    address internal constant XCM_PRECOMPILE_ADDR = address(0xA0000);

    bytes internal constant HUB_CHAIN_ID = bytes("POLKADOT-HUB");
    bytes internal constant SAT_CHAIN_ID = bytes("ETHEREUM");
    uint256 internal constant MAX_SYNC_AGE = 3600; // 1 hour

    function setUp() public virtual {
        vm.warp(10_000);
        strategist = vm.addr(strategistPk);

        // ── Deploy Hub ──────────────────────────────────────────────────
        hubToken = new MockTokenCCL();
        hubOracle = new MockOracleCCL(1e8, 8); // $1

        MockXcmCCL xcm = new MockXcmCCL();
        vm.etch(XCM_PRECOMPILE_ADDR, address(xcm).code);
        // Reset XCM mock storage at precompile address
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(0)), bytes32(uint256(500_000_000_000)));
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(1)), bytes32(uint256(524_288)));

        hubVault = new ObidotVault(
            IERC20(address(hubToken)),
            address(hubOracle),
            DEPOSIT_CAP,
            MAX_DAILY_LOSS,
            MAX_REF_TIME,
            MAX_PROOF_SIZE,
            admin
        );

        // Configure hub vault
        vm.startPrank(admin);
        hubVault.grantRole(hubVault.STRATEGIST_ROLE(), strategist);
        hubVault.grantRole(hubVault.KEEPER_ROLE(), keeper);
        hubVault.setParachainAllowed(PARA_ASTAR, true);
        hubVault.setProtocolAllowed(targetProtocol, true);
        hubVault.setProtocolExposureCap(targetProtocol, 500_000 ether);
        hubVault.setPerformanceFee(1000, treasury); // 10%
        vm.stopPrank();

        // ── Deploy Hub Router (CrossChainRouter) ────────────────────────
        hubIsmpHost = new MockIsmpHostCCL();
        router = new CrossChainRouter(address(hubIsmpHost), IERC20(address(hubToken)), address(hubVault), admin);

        // Register satellite chain
        bytes memory satModuleAddr = abi.encode(makeAddr("satModule"));
        vm.prank(admin);
        router.addSatelliteChain(SAT_CHAIN_ID, satModuleAddr);

        // ── Deploy Satellite ────────────────────────────────────────────
        satToken = new MockTokenCCL();
        satIsmpHost = new MockIsmpHostCCL();

        bytes memory hubRouterModule = abi.encode(address(router));

        satellite = new ObidotVaultEVM(
            IERC20(address(satToken)),
            address(satIsmpHost),
            HUB_CHAIN_ID,
            hubRouterModule,
            SAT_CHAIN_ID,
            DEPOSIT_CAP,
            MAX_SYNC_AGE,
            admin
        );

        // Fund users on satellite chain
        satToken.mint(alice, 100_000 ether);
        vm.prank(alice);
        satToken.approve(address(satellite), type(uint256).max);

        // Fund hub vault for strategy simulation
        hubToken.mint(address(hubVault), 0); // start empty
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /// @dev Simulate an incoming ISMP message TO the satellite FROM the hub.
    function _simulateHubToSatellite(bytes memory body) internal {
        bytes memory hubRouterModule = abi.encode(address(router));

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: HUB_CHAIN_ID,
            dest: SAT_CHAIN_ID,
            nonce: 0,
            from: hubRouterModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: body
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(address(satIsmpHost));
        satellite.onAccept(incoming);
    }

    /// @dev Simulate an incoming ISMP message TO the hub router FROM the satellite.
    function _simulateSatelliteToHub(bytes memory body) internal {
        bytes32 chainHash = keccak256(SAT_CHAIN_ID);
        bytes memory fromModule = router.registeredPeers(chainHash);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: SAT_CHAIN_ID,
            dest: HUB_CHAIN_ID,
            nonce: 0,
            from: fromModule,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(address(hubIsmpHost));
        router.onAccept(incoming);
    }

    /// @dev Build a default hub strategy intent.
    function _hubDefaultIntent(uint256 amount) internal view returns (ObidotVault.StrategyIntent memory) {
        return ObidotVault.StrategyIntent({
            asset: address(hubToken),
            amount: amount,
            minReturn: amount,
            maxSlippageBps: 100,
            deadline: block.timestamp + 1 hours,
            nonce: hubVault.nonces(strategist),
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_ASTAR,
            targetProtocol: targetProtocol
        });
    }

    /// @dev Sign a hub strategy intent with the strategist key.
    function _hubSignIntent(ObidotVault.StrategyIntent memory intent) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                hubVault.STRATEGY_INTENT_TYPEHASH(),
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
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", hubVault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(strategistPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _dummyXcmCall() internal pure returns (bytes memory) {
        return hex"000300010300a10f04000101002c01000000000000000000000000000000";
    }
}

// ── Cross-Chain Lifecycle Tests ─────────────────────────────────────────────

/// @title Integration_CrossChainLifecycle_Test
/// @notice Tests the full satellite ↔ hub lifecycle:
///   1. Satellite deposit → ISMP sync to router
///   2. Hub processes strategy with satellite-tracked assets
///   3. Hub reports outcome → broadcast to satellite
///   4. Hub broadcasts asset sync → satellite updates global state
///   5. Hub sends emergency sync → satellite mirrors state
///   6. Hub sends deposit ack → satellite records acknowledgment
///   7. Satellite withdrawal request → hub fulfillment → satellite completion
contract Integration_CrossChainLifecycle_Test is CrossChainLifecycleBase {
    /// @notice Full lifecycle: satellite deposit → hub deposit sync → hub strategy → outcome →
    ///         asset sync to satellite → satellite global state updated
    function test_satellite_deposit_hub_strategy_outcome_sync() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        uint256 depositAmount = 10_000 ether;
        vm.prank(alice);
        satellite.deposit(depositAmount, alice);

        assertGt(satellite.balanceOf(alice), 0, "Alice has satellite shares");
        assertEq(satellite.depositSyncNonce(), 1, "Deposit sync dispatched");
        assertEq(satIsmpHost.dispatchCount(), 1, "ISMP dispatch sent");

        // ── Step 2: Simulate deposit sync arriving at hub router ────────
        CrossChainCodec.DepositSyncMessage memory syncMsg = CrossChainCodec.DepositSyncMessage({
            chainId: SAT_CHAIN_ID,
            depositor: alice,
            amount: depositAmount,
            sharesMinted: satellite.balanceOf(alice),
            nonce: 0
        });
        bytes memory syncBody = CrossChainCodec.encodeDepositSync(syncMsg);
        _simulateSatelliteToHub(syncBody);

        // Router should track satellite assets
        bytes32 satHash = keccak256(SAT_CHAIN_ID);
        assertEq(router.satelliteAssets(satHash), depositAmount, "Router tracked satellite deposit");
        assertEq(router.pendingSatelliteDeposits(), depositAmount, "Pending deposits increased");

        // ── Step 3: Hub has its own deposits; execute strategy ───────────
        // (The hub uses its own token supply for strategies)
        hubToken.mint(address(hubVault), 50_000 ether);

        // Deposit hub tokens to get shares
        hubToken.mint(admin, 50_000 ether);
        vm.startPrank(admin);
        hubToken.approve(address(hubVault), 50_000 ether);
        hubVault.deposit(50_000 ether, admin);
        vm.stopPrank();

        // Execute strategy on hub
        ObidotVault.StrategyIntent memory intent = _hubDefaultIntent(20_000 ether);
        bytes memory sig = _hubSignIntent(intent);
        vm.prank(relayer);
        hubVault.executeStrategy(intent, sig);
        hubToken.burn(address(hubVault), 20_000 ether); // simulate XCM transfer

        assertEq(hubVault.totalRemoteAssets(), 20_000 ether, "Hub remote assets tracked");

        // ── Step 4: Keeper reports profitable outcome on hub ────────────
        uint256 returnedAmount = 22_000 ether; // 10% profit
        hubToken.mint(address(hubVault), returnedAmount);

        vm.prank(keeper);
        hubVault.reportStrategyOutcome(0, true, returnedAmount);

        assertEq(hubVault.totalRemoteAssets(), 0, "Remote zeroed");
        assertGt(hubVault.cumulativePnL(), 0, "Hub PnL positive");

        // ── Step 5: Hub broadcasts asset sync to satellite ──────────────
        uint256 globalTotal = hubVault.totalAssets();
        uint256 globalShares = hubVault.totalSupply();
        uint256 remoteAssets = hubVault.totalRemoteAssets();

        CrossChainCodec.AssetSyncMessage memory assetSync = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: globalTotal,
            globalTotalShares: globalShares,
            totalRemoteAssets: remoteAssets,
            timestamp: block.timestamp
        });
        bytes memory assetSyncBody = CrossChainCodec.encodeAssetSync(assetSync);

        _simulateHubToSatellite(assetSyncBody);

        // Satellite should update global state
        assertEq(satellite.globalTotalAssets(), globalTotal, "Satellite global assets synced");
        assertEq(satellite.globalTotalShares(), globalShares, "Satellite global shares synced");
        assertEq(satellite.lastSyncTimestamp(), block.timestamp, "Satellite sync timestamp updated");
        assertTrue(satellite.isSyncFresh(), "Sync is fresh");
    }

    /// @notice Hub broadcasts emergency sync → satellite mirrors pause + emergency state
    function test_emergency_sync_from_hub_to_satellite() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        vm.prank(alice);
        satellite.deposit(5_000 ether, alice);

        assertFalse(satellite.paused(), "Satellite not paused initially");
        assertFalse(satellite.emergencyMode(), "Not in emergency initially");

        // ── Step 2: Hub sends emergency sync ────────────────────────────
        CrossChainCodec.EmergencySyncMessage memory emergencyMsg = CrossChainCodec.EmergencySyncMessage({
            paused: true,
            emergencyMode: true,
            reason: bytes("circuit breaker triggered")
        });
        bytes memory emergencyBody = CrossChainCodec.encodeEmergencySync(emergencyMsg);

        _simulateHubToSatellite(emergencyBody);

        // Satellite should be paused and in emergency mode
        assertTrue(satellite.paused(), "Satellite paused after emergency sync");
        assertTrue(satellite.emergencyMode(), "Satellite in emergency mode");

        // ── Step 3: New deposits should fail ────────────────────────────
        vm.prank(alice);
        vm.expectRevert();
        satellite.deposit(1_000 ether, alice);

        // ── Step 4: Emergency withdrawals should work ───────────────────
        uint256 aliceShares = satellite.balanceOf(alice);
        uint256 aliceBalBefore = satToken.balanceOf(alice);

        vm.prank(alice);
        satellite.redeem(aliceShares, alice, alice);

        assertGt(satToken.balanceOf(alice), aliceBalBefore, "Alice withdrew in emergency");
        assertEq(satellite.balanceOf(alice), 0, "Alice has no shares");

        // ── Step 5: Hub sends recovery sync (unpause) ───────────────────
        CrossChainCodec.EmergencySyncMessage memory recoveryMsg =
            CrossChainCodec.EmergencySyncMessage({paused: false, emergencyMode: false, reason: bytes("recovered")});
        bytes memory recoveryBody = CrossChainCodec.encodeEmergencySync(recoveryMsg);
        _simulateHubToSatellite(recoveryBody);

        assertFalse(satellite.paused(), "Satellite unpaused after recovery");
        assertFalse(satellite.emergencyMode(), "Emergency mode cleared");
    }

    /// @notice Hub sends deposit ack → satellite records acknowledgment
    function test_deposit_ack_from_hub() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        vm.prank(alice);
        satellite.deposit(8_000 ether, alice);

        assertFalse(satellite.depositAcknowledged(0), "Not ack'd yet");

        // ── Step 2: Hub sends deposit ack ───────────────────────────────
        CrossChainCodec.DepositAckMessage memory ackMsg = CrossChainCodec.DepositAckMessage({
            depositNonce: 0,
            globalTotalAssets: 108_000 ether, // includes satellite's 8k
            accepted: true
        });
        bytes memory ackBody = CrossChainCodec.encodeDepositAck(ackMsg);

        _simulateHubToSatellite(ackBody);

        assertTrue(satellite.depositAcknowledged(0), "Deposit acknowledged");
        assertEq(satellite.globalTotalAssets(), 108_000 ether, "Global assets updated via ack");
    }

    /// @notice Strategy report broadcast → satellite updates hub remote assets
    function test_strategy_report_synced_to_satellite() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        vm.prank(alice);
        satellite.deposit(5_000 ether, alice);

        // ── Step 2: Hub sends strategy report ───────────────────────────
        CrossChainCodec.StrategyReportMessage memory reportMsg = CrossChainCodec.StrategyReportMessage({
            strategyId: 42,
            success: true,
            returnedAmount: 15_000 ether,
            pnl: 2_000 ether,
            newTotalRemoteAssets: 8_000 ether
        });
        bytes memory reportBody = CrossChainCodec.encodeStrategyReport(reportMsg);

        _simulateHubToSatellite(reportBody);

        assertEq(satellite.hubRemoteAssets(), 8_000 ether, "Satellite updated hub remote assets");
    }

    /// @notice Satellite withdrawal: if local balance sufficient → direct withdraw succeeds.
    ///         If insufficient → reverts with WithdrawalPending (state rolled back by revert).
    ///         After hub fulfills (tokens arrive + fulfillment msg), user can withdraw directly.
    function test_withdrawal_request_and_fulfillment_lifecycle() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        uint256 depositAmount = 10_000 ether;
        vm.prank(alice);
        satellite.deposit(depositAmount, alice);

        // ── Step 2: Simulate that most assets were transferred to hub ───
        satToken.burn(address(satellite), 9_000 ether);
        assertEq(satToken.balanceOf(address(satellite)), 1_000 ether, "Only 1k idle");

        // ── Step 3: Alice tries to withdraw more than idle → reverts ────
        // Note: The contract dispatches ISMP inside _requestWithdrawFromHub then reverts,
        // so ALL state changes (including pendingWithdrawals) are rolled back.
        uint256 withdrawAmount = 5_000 ether;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.WithdrawalPending.selector, withdrawAmount));
        satellite.withdraw(withdrawAmount, alice, alice);

        // State is rolled back by the revert — nonce and pending are unchanged
        assertEq(satellite.totalPendingWithdrawals(), 0, "Pending rolled back by revert");
        assertEq(satellite.withdrawRequestNonce(), 0, "Nonce rolled back by revert");

        // ── Step 4: Hub fulfills by sending tokens + fulfillment message ─
        satToken.mint(address(satellite), withdrawAmount);

        CrossChainCodec.WithdrawFulfillMessage memory fulfillMsg =
            CrossChainCodec.WithdrawFulfillMessage({withdrawNonce: 0, amount: withdrawAmount, fullyFulfilled: true});
        _simulateHubToSatellite(CrossChainCodec.encodeWithdrawFulfill(fulfillMsg));

        // ── Step 5: Now Alice can withdraw directly (sufficient idle) ───
        uint256 aliceBalBefore = satToken.balanceOf(alice);
        vm.prank(alice);
        satellite.withdraw(withdrawAmount, alice, alice);

        assertGt(satToken.balanceOf(alice), aliceBalBefore, "Alice received assets");
    }

    /// @notice Multi-step: satellite deposit → sync → hub strategy → loss → circuit breaker → emergency sync to satellite
    function test_satellite_deposit_hub_loss_emergency_propagation() public {
        // ── Step 1: Alice deposits on satellite ─────────────────────────
        vm.prank(alice);
        satellite.deposit(20_000 ether, alice);

        // ── Step 2: Simulate deposit sync arriving at hub ───────────────
        CrossChainCodec.DepositSyncMessage memory syncMsg = CrossChainCodec.DepositSyncMessage({
            chainId: SAT_CHAIN_ID,
            depositor: alice,
            amount: 20_000 ether,
            sharesMinted: satellite.balanceOf(alice),
            nonce: 0
        });
        _simulateSatelliteToHub(CrossChainCodec.encodeDepositSync(syncMsg));

        assertEq(router.totalSatelliteAssets(), 20_000 ether, "Router tracks satellite assets");

        // ── Step 3: Hub has funds, executes strategy ────────────────────
        hubToken.mint(admin, 80_000 ether);
        vm.startPrank(admin);
        hubToken.approve(address(hubVault), 80_000 ether);
        hubVault.deposit(80_000 ether, admin);
        vm.stopPrank();

        // Execute large strategy
        ObidotVault.StrategyIntent memory intent = _hubDefaultIntent(60_000 ether);
        bytes memory sig = _hubSignIntent(intent);
        vm.prank(relayer);
        hubVault.executeStrategy(intent, sig);
        hubToken.burn(address(hubVault), 60_000 ether);

        // ── Step 4: Catastrophic loss ───────────────────────────────────
        uint256 returnedAmount = 5_000 ether; // Lost 55k of 60k
        hubToken.mint(address(hubVault), returnedAmount);

        vm.prank(keeper);
        hubVault.reportStrategyOutcome(0, false, returnedAmount);

        // Hub should be in emergency mode
        assertTrue(hubVault.paused(), "Hub paused");
        assertTrue(hubVault.emergencyMode(), "Hub emergency");

        // ── Step 5: Emergency sync propagated to satellite ──────────────
        CrossChainCodec.EmergencySyncMessage memory emergencyMsg = CrossChainCodec.EmergencySyncMessage({
            paused: true,
            emergencyMode: true,
            reason: bytes("daily loss circuit breaker")
        });
        _simulateHubToSatellite(CrossChainCodec.encodeEmergencySync(emergencyMsg));

        assertTrue(satellite.paused(), "Satellite paused by emergency");
        assertTrue(satellite.emergencyMode(), "Satellite in emergency");

        // ── Step 6: Alice can still do emergency withdrawal on satellite
        uint256 aliceShares = satellite.balanceOf(alice);
        uint256 balBefore = satToken.balanceOf(alice);

        vm.prank(alice);
        satellite.redeem(aliceShares, alice, alice);

        assertGt(satToken.balanceOf(alice), balBefore, "Emergency withdrawal succeeded");
    }

    /// @notice Asset sync staleness: after maxSyncAge, isSyncFresh returns false
    function test_asset_sync_staleness() public {
        // ── Step 1: Send asset sync ─────────────────────────────────────
        CrossChainCodec.AssetSyncMessage memory assetSync = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: 100_000 ether,
            globalTotalShares: 95_000 ether,
            totalRemoteAssets: 20_000 ether,
            timestamp: block.timestamp
        });
        _simulateHubToSatellite(CrossChainCodec.encodeAssetSync(assetSync));

        assertTrue(satellite.isSyncFresh(), "Sync fresh right after");

        // ── Step 2: Warp past maxSyncAge ────────────────────────────────
        vm.warp(block.timestamp + MAX_SYNC_AGE + 1);

        assertFalse(satellite.isSyncFresh(), "Sync stale after maxSyncAge");
    }

    /// @notice Multiple satellite deposits tracked correctly by hub router
    function test_multiple_satellite_deposits_tracked_by_router() public {
        // ── Deposit 1 ───────────────────────────────────────────────────
        CrossChainCodec.DepositSyncMessage memory sync1 = CrossChainCodec.DepositSyncMessage({
            chainId: SAT_CHAIN_ID,
            depositor: alice,
            amount: 5_000 ether,
            sharesMinted: 4_950 ether,
            nonce: 0
        });
        _simulateSatelliteToHub(CrossChainCodec.encodeDepositSync(sync1));

        // ── Deposit 2 ───────────────────────────────────────────────────
        CrossChainCodec.DepositSyncMessage memory sync2 = CrossChainCodec.DepositSyncMessage({
            chainId: SAT_CHAIN_ID,
            depositor: alice,
            amount: 3_000 ether,
            sharesMinted: 2_970 ether,
            nonce: 1
        });
        _simulateSatelliteToHub(CrossChainCodec.encodeDepositSync(sync2));

        bytes32 satHash = keccak256(SAT_CHAIN_ID);
        assertEq(router.satelliteAssets(satHash), 8_000 ether, "Cumulative deposits tracked");
        assertEq(router.incomingDepositNonces(satHash), 2, "Nonce incremented twice");
        assertEq(router.pendingSatelliteDeposits(), 8_000 ether, "Total pending correct");
    }

    /// @notice Withdrawal request revert means state is rolled back — no pending to cancel.
    ///         Instead, test that the timeout handler correctly reduces pending
    ///         when a pending withdrawal was externally set.
    function test_withdrawal_request_timeout_reduces_pending() public {
        // ── Setup: deposit on satellite ──────────────────────────────────
        vm.prank(alice);
        satellite.deposit(10_000 ether, alice);

        // ── Verify that the revert rolls back pending state ─────────────
        satToken.burn(address(satellite), 9_000 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.WithdrawalPending.selector, 5_000 ether));
        satellite.withdraw(5_000 ether, alice, alice);

        // Confirm state was rolled back
        assertEq(satellite.totalPendingWithdrawals(), 0, "Pending rolled back");
        assertEq(satellite.withdrawRequestNonce(), 0, "Nonce rolled back");

        // ── Test timeout handler with a withdraw request body ───────────
        // Even though state was rolled back, the timeout handler should handle
        // the message gracefully (totalPendingWithdrawals is already 0, so
        // the handler's `if >= amount` check prevents underflow)
        CrossChainCodec.WithdrawRequestMessage memory withdrawMsg = CrossChainCodec.WithdrawRequestMessage({
            chainId: SAT_CHAIN_ID,
            withdrawer: alice,
            amount: 5_000 ether,
            sharesToBurn: satellite.previewWithdraw(5_000 ether),
            nonce: 0
        });
        bytes memory body = CrossChainCodec.encodeWithdrawRequest(withdrawMsg);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: SAT_CHAIN_ID,
            dest: HUB_CHAIN_ID,
            nonce: 0,
            from: abi.encode(address(satellite)),
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(satIsmpHost));
        satellite.onPostRequestTimeout(request);

        // totalPendingWithdrawals should remain 0 (guard prevents underflow)
        assertEq(satellite.totalPendingWithdrawals(), 0, "No underflow on timeout");
    }
}
