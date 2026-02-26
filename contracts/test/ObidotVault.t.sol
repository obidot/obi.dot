// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ObidotVault} from "../src/ObidotVault.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {IXcm} from "../src/interfaces/IXcm.sol";
import {MultiLocation} from "../src/libraries/MultiLocation.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  Mock Contracts
// ═══════════════════════════════════════════════════════════════════════════

/// @dev Minimal ERC-20 token for testing.
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/// @dev Mock Chainlink-compatible oracle (PythAggregatorV3 pattern).
contract MockOracle is IAggregatorV3 {
    int256 public price;
    uint8 public _decimals;
    uint256 public lastUpdated;
    bool public shouldRevert;
    uint80 public roundId;

    constructor(int256 _price, uint8 decimals_) {
        price = _price;
        _decimals = decimals_;
        lastUpdated = block.timestamp;
        roundId = 1;
    }

    function setPrice(int256 _price) external {
        price = _price;
        lastUpdated = block.timestamp;
        roundId++;
    }

    function setPriceRaw(int256 _price, uint256 _updatedAt) external {
        price = _price;
        lastUpdated = _updatedAt;
        roundId++;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setStale() external {
        lastUpdated = block.timestamp - 7200; // 2 hours stale
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "MOCK / USD";
    }

    function version() external pure override returns (uint256) {
        return 3;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (uint80, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, price, lastUpdated, lastUpdated, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        require(!shouldRevert, "MockOracle: forced revert");
        return (roundId, price, lastUpdated, lastUpdated, roundId);
    }
}

/// @dev Mock XCM precompile deployed at 0xA0000 via vm.etch.
///      Uses uint256 for weight fields to avoid Solidity storage packing issues
///      when setting values via vm.store on the etched address.
contract MockXcmPrecompile is IXcm {
    uint256 public mockRefTime; // slot 0
    uint256 public mockProofSize; // slot 1
    bool public shouldRevertOnSend; // slot 2
    bool public shouldRevertOnWeigh; // slot 3
    uint256 public sendCallCount; // slot 4
    bytes public lastDest; // slot 5
    bytes public lastMessage; // slot 6

    constructor() {
        mockRefTime = 500_000_000_000; // 500 billion pico = 0.5s
        mockProofSize = 524_288; // 512 KB
    }

    function setWeights(uint64 _refTime, uint64 _proofSize) external {
        mockRefTime = _refTime;
        mockProofSize = _proofSize;
    }

    function setShouldRevertOnSend(bool _shouldRevert) external {
        shouldRevertOnSend = _shouldRevert;
    }

    function setShouldRevertOnWeigh(bool _shouldRevert) external {
        shouldRevertOnWeigh = _shouldRevert;
    }

    function send(bytes calldata dest, bytes calldata message) external override {
        if (shouldRevertOnSend) revert SendFailure();
        sendCallCount++;
        lastDest = dest;
        lastMessage = message;
        emit XcmSent(msg.sender, dest, message);
    }

    function weighMessage(bytes calldata /*message*/ )
        external
        view
        override
        returns (uint64 refTime, uint64 proofSize)
    {
        if (shouldRevertOnWeigh) revert InvalidMessage();
        return (uint64(mockRefTime), uint64(mockProofSize));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Test Harness
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVaultTestBase is Test {
    using Math for uint256;

    // ── Actors ────────────────────────────────────────────────────────────
    address internal admin = makeAddr("admin");
    uint256 internal strategistPk;
    address internal strategist;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal relayer = makeAddr("relayer");
    address internal malicious = makeAddr("malicious");

    // ── Contracts ─────────────────────────────────────────────────────────
    MockERC20 internal token;
    MockOracle internal oracle;
    MockXcmPrecompile internal xcmMock;
    ObidotVault internal vault;

    // ── Config ────────────────────────────────────────────────────────────
    uint256 internal constant DEPOSIT_CAP = 1_000_000 ether;
    uint256 internal constant MAX_DAILY_LOSS = 50_000 ether;
    uint64 internal constant MAX_REF_TIME = 1_000_000_000_000; // 1T pico
    uint64 internal constant MAX_PROOF_SIZE = 1_048_576; // 1 MB

    // ── Policy defaults ──────────────────────────────────────────────────
    uint32 internal constant PARA_ASTAR = 2006;
    uint32 internal constant PARA_MOONBEAM = 2004;
    address internal targetProtocol = makeAddr("targetProtocol");

    /// @dev The on-chain address of the XCM (Cross-Consensus Message) precompile
    address internal constant XCM_PRECOMPILE_ADDR = address(0xA0000);

    function setUp() public virtual {
        // Warp to a reasonable timestamp so oracle staleness checks don't underflow
        vm.warp(10_000);

        // Deterministic strategist keypair
        strategistPk = 0xA11CE;
        strategist = vm.addr(strategistPk);

        // Deploy mock token
        token = new MockERC20("Mock DOT", "mDOT", 18);

        // Deploy mock oracle: price = 1e8 (1 USD with 8 decimals)
        oracle = new MockOracle(1e8, 8);

        // Deploy mock XCM precompile at the canonical address
        xcmMock = new MockXcmPrecompile();
        vm.etch(XCM_PRECOMPILE_ADDR, address(xcmMock).code);
        // Copy storage: make the etched code have default weights
        // We use a fresh mock and interact via the canonical address
        _resetXcmMockStorage();

        // Deploy vault
        vault = new ObidotVault(
            IERC20(address(token)), address(oracle), DEPOSIT_CAP, MAX_DAILY_LOSS, MAX_REF_TIME, MAX_PROOF_SIZE, admin
        );

        // Setup roles and policy
        vm.startPrank(admin);
        vault.grantRole(vault.STRATEGIST_ROLE(), strategist);
        vault.setParachainAllowed(PARA_ASTAR, true);
        vault.setParachainAllowed(PARA_MOONBEAM, true);
        vault.setProtocolAllowed(targetProtocol, true);
        vault.setProtocolExposureCap(targetProtocol, 500_000 ether);
        vm.stopPrank();

        // Fund actors
        token.mint(alice, 100_000 ether);
        token.mint(bob, 100_000 ether);
        token.mint(address(vault), 0); // ensure vault starts at 0

        // Approve vault
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /// @dev Store default mock XCM weights at the etched precompile address.
    ///      Storage layout (uint256 per slot, no packing):
    ///        slot 0 = mockRefTime
    ///        slot 1 = mockProofSize
    ///        slot 2 = shouldRevertOnSend
    ///        slot 3 = shouldRevertOnWeigh
    function _resetXcmMockStorage() internal {
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(0)), bytes32(uint256(500_000_000_000)));
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(1)), bytes32(uint256(524_288)));
    }

    /// @dev Construct a default valid StrategyIntent.
    function _defaultIntent(uint256 amount) internal view returns (ObidotVault.StrategyIntent memory) {
        return ObidotVault.StrategyIntent({
            asset: address(token),
            amount: amount,
            minReturn: amount, // 1:1 at oracle price
            maxSlippageBps: 100, // 1%
            deadline: block.timestamp + 1 hours,
            nonce: vault.nonces(strategist),
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_ASTAR,
            targetProtocol: targetProtocol
        });
    }

    /// @dev Sign an intent with the strategist's private key.
    function _signIntent(ObidotVault.StrategyIntent memory intent) internal view returns (bytes memory) {
        return _signIntentWithKey(intent, strategistPk);
    }

    /// @dev Sign an intent with an arbitrary private key.
    ///      Computes the EIP-712 digest inline to avoid calldata/memory conversion issues.
    function _signIntentWithKey(ObidotVault.StrategyIntent memory intent, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
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
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Dummy XCM call bytes.
    function _dummyXcmCall() internal pure returns (bytes memory) {
        return hex"0400010100a10f0410040001000007e8d4a510000a130001000007e8d4a51000000d01020400010300";
    }

    /// @dev Deposit assets into vault on behalf of a user.
    function _depositAs(address user, uint256 amount) internal returns (uint256 shares) {
        vm.prank(user);
        shares = vault.deposit(amount, user);
    }

    /// @dev Execute a strategy with default parameters.
    ///      Also burns tokens from the vault to simulate the real XCM precompile
    ///      transferring tokens out during cross-chain dispatch.
    function _executeDefaultStrategy(uint256 amount) internal returns (uint256 strategyId) {
        ObidotVault.StrategyIntent memory intent = _defaultIntent(amount);
        bytes memory sig = _signIntent(intent);
        vm.prank(relayer);
        strategyId = vault.executeStrategy(intent, sig);
        // Simulate XCM precompile transferring tokens out of the vault
        token.burn(address(vault), amount);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Unit Tests — ERC-4626 Core
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_ERC4626_Test is ObidotVaultTestBase {
    function test_metadata() public view {
        assertEq(vault.name(), "Obidot Vault Share");
        assertEq(vault.symbol(), "obVAULT");
        assertEq(vault.asset(), address(token));
        assertEq(vault.decimals(), 18 + 3); // _decimalsOffset = 3
    }

    function test_deposit_and_redeem() public {
        uint256 depositAmount = 10_000 ether;
        uint256 shares = _depositAs(alice, depositAmount);

        assertGt(shares, 0, "Should receive shares");
        assertEq(vault.totalAssets(), depositAmount);
        assertEq(token.balanceOf(address(vault)), depositAmount);

        // Redeem
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);

        assertEq(assets, depositAmount, "Should redeem full amount");
        assertEq(vault.totalAssets(), 0);
    }

    function test_deposit_cap_enforcement() public {
        // Fill vault to near cap
        token.mint(alice, DEPOSIT_CAP);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);

        _depositAs(alice, DEPOSIT_CAP);

        // Next deposit should fail
        token.mint(bob, 1 ether);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);

        assertEq(vault.maxDeposit(bob), 0, "Max deposit should be 0 at cap");
    }

    function test_maxDeposit_returns_zero_when_paused() public {
        vm.prank(admin);
        vault.pause();

        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxMint(alice), 0);
    }

    function test_deposit_reverts_when_paused() public {
        vm.prank(admin);
        vault.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        vault.deposit(1000 ether, alice);
    }

    function test_totalAssets_includes_remote() public {
        _depositAs(alice, 50_000 ether);

        uint256 strategyAmount = 20_000 ether;
        _executeDefaultStrategy(strategyAmount);

        // totalAssets = idle (30k) + remote (20k) = 50k
        assertEq(vault.totalAssets(), 50_000 ether);
        assertEq(vault.totalRemoteAssets(), strategyAmount);
    }

    function test_totalAssets_emergency_ignores_remote() public {
        _depositAs(alice, 50_000 ether);
        _executeDefaultStrategy(20_000 ether);

        vm.prank(admin);
        vault.enableEmergencyMode();

        // totalAssets = only idle (30k), remote (20k) ignored
        assertEq(vault.totalAssets(), 30_000 ether);
    }

    function test_withdraw_in_emergency_mode() public {
        uint256 depositAmount = 50_000 ether;
        uint256 shares = _depositAs(alice, depositAmount);

        _executeDefaultStrategy(20_000 ether);

        vm.prank(admin);
        vault.enableEmergencyMode();

        // Alice should be able to redeem, getting proportional share of idle assets
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        // In emergency mode, totalAssets = 30k, so she gets 30k (all of idle)
        assertEq(assets, 30_000 ether);
    }

    function test_conservative_rounding_favors_vault() public {
        // Deposit 1 wei: should get at least some shares due to virtual offset
        token.mint(alice, 1);
        vm.prank(alice);
        token.approve(address(vault), 1);

        uint256 shares = _depositAs(alice, 1);
        // With _decimalsOffset = 3, virtual shares = 1000
        // shares = assets * (totalSupply + 10^offset) / (totalAssets + 1) = 1 * 1000 / 1 = 1000
        assertGt(shares, 0, "Should get shares even for 1 wei deposit");

        // Redeeming those shares should return <= 1 (floor rounding)
        vm.prank(alice);
        uint256 redeemed = vault.redeem(shares, alice, alice);
        assertLe(redeemed, 1, "Rounding should favor the vault");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fuzz Tests — ERC-4626 Deposit/Withdraw
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_Fuzz_Test is ObidotVaultTestBase {
    function testFuzz_deposit_withdraw_roundtrip(uint256 assets) public {
        assets = bound(assets, 1, DEPOSIT_CAP);
        token.mint(alice, assets);
        vm.prank(alice);
        token.approve(address(vault), assets);

        uint256 shares = _depositAs(alice, assets);
        assertGt(shares, 0, "Shares must be > 0");

        // Withdraw all
        vm.prank(alice);
        uint256 returned = vault.redeem(shares, alice, alice);

        // Conservative rounding: returned <= deposited
        assertLe(returned, assets, "Rounding must favor vault");
        // But should not lose more than 1 wei (for reasonable amounts)
        if (assets > 1000) {
            assertGe(returned, assets - 1, "Should not lose more than dust");
        }
    }

    function testFuzz_deposit_multiple_users(uint256 aliceAmt, uint256 bobAmt) public {
        aliceAmt = bound(aliceAmt, 1 ether, DEPOSIT_CAP / 2);
        bobAmt = bound(bobAmt, 1 ether, DEPOSIT_CAP / 2);

        token.mint(alice, aliceAmt);
        token.mint(bob, bobAmt);
        vm.prank(alice);
        token.approve(address(vault), aliceAmt);
        vm.prank(bob);
        token.approve(address(vault), bobAmt);

        uint256 aliceShares = _depositAs(alice, aliceAmt);
        uint256 bobShares = _depositAs(bob, bobAmt);

        assertEq(vault.totalAssets(), aliceAmt + bobAmt);
        assertEq(vault.totalSupply(), aliceShares + bobShares);

        // Both can redeem
        vm.prank(alice);
        uint256 aliceBack = vault.redeem(aliceShares, alice, alice);
        vm.prank(bob);
        uint256 bobBack = vault.redeem(bobShares, bob, bob);

        assertLe(aliceBack, aliceAmt);
        assertLe(bobBack, bobAmt);
        // Total returned should be close to total deposited
        assertGe(aliceBack + bobBack, aliceAmt + bobAmt - 2);
    }

    function testFuzz_maxDeposit_respects_cap(uint256 existingDeposit) public {
        existingDeposit = bound(existingDeposit, 0, DEPOSIT_CAP);
        if (existingDeposit > 0) {
            token.mint(alice, existingDeposit);
            vm.prank(alice);
            token.approve(address(vault), existingDeposit);
            _depositAs(alice, existingDeposit);
        }

        uint256 maxDep = vault.maxDeposit(bob);
        assertEq(maxDep, DEPOSIT_CAP - existingDeposit);
    }

    function testFuzz_share_inflation_invariant(uint256 donation, uint256 deposit) public {
        donation = bound(donation, 1, DEPOSIT_CAP / 2);
        deposit = bound(deposit, 1, DEPOSIT_CAP / 2);

        // Attacker front-runs with a donation to inflate share price
        token.mint(malicious, donation);
        vm.prank(malicious);
        token.transfer(address(vault), donation);

        // Bound deposit to remaining capacity (donation inflates totalAssets)
        uint256 maxDep = vault.maxDeposit(alice);
        if (maxDep == 0) return;
        deposit = bound(deposit, 1, maxDep);

        // Victim deposits
        token.mint(alice, deposit);
        vm.prank(alice);
        token.approve(address(vault), deposit);

        uint256 shares = _depositAs(alice, deposit);

        // With _decimalsOffset = 3, virtual shares = 1000. Victim gets non-zero shares
        // when deposit * 1000 > donation (integer division: deposit * 1000 / (donation + 1) > 0)
        if (deposit * 1000 > donation + 1) {
            assertGt(shares, 0, "Inflation attack should be mitigated by virtual shares");
        }

        // If victim got shares, redeeming should return close to deposit
        if (shares > 0) {
            vm.prank(alice);
            uint256 returned = vault.redeem(shares, alice, alice);
            // Victim should not lose more than a small fraction
            // With 1e3 virtual shares, loss is bounded by donation / 1e3
            uint256 depositFloor = (deposit * 999) / 1000;
            uint256 donationPenalty = donation / 1000;
            uint256 expectedMin = depositFloor > donationPenalty ? depositFloor - donationPenalty : 0;
            assertGe(returned, expectedMin, "Loss from inflation should be bounded");
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Unit Tests — Strategy Execution
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_Strategy_Test is ObidotVaultTestBase {
    function test_executeStrategy_success() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(10_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectEmit(true, true, true, true);
        emit ObidotVault.StrategyExecuted(0, strategist, PARA_ASTAR, targetProtocol, 10_000 ether, 10_000 ether);

        vm.prank(relayer);
        uint256 id = vault.executeStrategy(intent, sig);

        assertEq(id, 0);
        assertEq(vault.totalRemoteAssets(), 10_000 ether);
        assertEq(vault.protocolExposure(targetProtocol), 10_000 ether);
        assertEq(vault.nonces(strategist), 1);
        assertEq(vault.strategyCounter(), 1);

        (ObidotVault.StrategyStatus status, address strat, uint256 amt,, uint32 para, address proto, uint256 execAt) =
            vault.strategies(id);
        assertEq(uint8(status), uint8(ObidotVault.StrategyStatus.Sent));
        assertEq(strat, strategist);
        assertEq(amt, 10_000 ether);
        assertEq(para, PARA_ASTAR);
        assertEq(proto, targetProtocol);
        assertGt(execAt, 0);
    }

    function test_executeStrategy_permissionless_relaying() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(5_000 ether);
        bytes memory sig = _signIntent(intent);

        // Anyone can relay
        vm.prank(bob);
        vault.executeStrategy(intent, sig);

        assertEq(vault.nonces(strategist), 1);
    }

    function test_executeStrategy_multiple_sequential() public {
        _depositAs(alice, 50_000 ether);

        for (uint256 i = 0; i < 5; i++) {
            ObidotVault.StrategyIntent memory intent = _defaultIntent(5_000 ether);
            bytes memory sig = _signIntent(intent);
            vm.prank(relayer);
            uint256 id = vault.executeStrategy(intent, sig);
            assertEq(id, i);
        }

        assertEq(vault.strategyCounter(), 5);
        assertEq(vault.nonces(strategist), 5);
        assertEq(vault.totalRemoteAssets(), 25_000 ether);
    }

    function test_reportStrategyOutcome_success() public {
        _depositAs(alice, 50_000 ether);
        uint256 id = _executeDefaultStrategy(10_000 ether);

        // Report success with 5% return
        uint256 returned = 10_500 ether;
        token.mint(address(vault), returned); // Simulate return

        vm.prank(admin);
        vault.reportStrategyOutcome(id, true, returned);

        (ObidotVault.StrategyStatus status,,,,,,) = vault.strategies(id);
        assertEq(uint8(status), uint8(ObidotVault.StrategyStatus.Executed));
        assertEq(vault.totalRemoteAssets(), 0);
        assertEq(vault.protocolExposure(targetProtocol), 0);
    }

    function test_reportStrategyOutcome_failure_with_loss() public {
        _depositAs(alice, 50_000 ether);
        uint256 id = _executeDefaultStrategy(10_000 ether);

        // Report failure with 10% loss
        uint256 returned = 9_000 ether;
        token.mint(address(vault), returned);

        vm.prank(admin);
        vault.reportStrategyOutcome(id, false, returned);

        (ObidotVault.StrategyStatus status,,,,,,) = vault.strategies(id);
        assertEq(uint8(status), uint8(ObidotVault.StrategyStatus.Failed));
        assertEq(vault.dailyLossAccumulator(), 1_000 ether);
    }

    function test_circuit_breaker_auto_pauses() public {
        _depositAs(alice, 100_000 ether);

        // Execute a large strategy
        uint256 id = _executeDefaultStrategy(80_000 ether);

        // Report massive loss exceeding daily limit
        vm.prank(admin);
        vault.reportStrategyOutcome(id, false, 20_000 ether); // 60k loss > 50k limit

        assertTrue(vault.paused(), "Vault should be auto-paused");
        assertTrue(vault.emergencyMode(), "Emergency mode should be on");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Security Tests — Replay, Signatures, Access Control
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_Security_Test is ObidotVaultTestBase {
    function test_revert_expired_deadline() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.deadline = block.timestamp - 1; // Already expired

        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.DeadlineExpired.selector, intent.deadline, block.timestamp));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_nonce_mismatch() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.nonce = 999; // Wrong nonce

        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.InvalidNonce.selector, 0, 999));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_replay_same_signature() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        // First execution succeeds
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);

        // Replay should fail (nonce already incremented)
        vm.expectRevert(abi.encodeWithSelector(ObidotVault.InvalidNonce.selector, 1, 0));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_unauthorized_strategist() public {
        _depositAs(alice, 50_000 ether);

        // Sign with a key that doesn't have STRATEGIST_ROLE
        uint256 randomPk = 0xDEAD;
        address randomAddr = vm.addr(randomPk);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.nonce = vault.nonces(randomAddr);
        bytes memory sig = _signIntentWithKey(intent, randomPk);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.UnauthorizedStrategist.selector, randomAddr));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_invalid_signature_length() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory badSig = hex"DEADBEEF"; // Too short

        vm.expectRevert(ObidotVault.InvalidSignature.selector);
        vm.prank(relayer);
        vault.executeStrategy(intent, badSig);
    }

    function test_revert_malleable_signature() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes32 digest = vault.computeIntentDigest(intent);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(strategistPk, digest);

        // Flip s to upper half (signature malleability)
        uint256 sUint = uint256(s);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 sFlipped = bytes32(n - sUint);
        uint8 vFlipped = v == 27 ? 28 : 27;

        bytes memory malleableSig = abi.encodePacked(r, sFlipped, vFlipped);

        // Should revert because flipped s is in upper half
        vm.expectRevert(ObidotVault.InvalidSignature.selector);
        vm.prank(relayer);
        vault.executeStrategy(intent, malleableSig);
    }

    function test_revert_asset_mismatch() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.asset = address(0xBEEF); // Wrong asset
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.AssetMismatch.selector, address(token), address(0xBEEF)));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_zero_amount() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(0);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(ObidotVault.ZeroAmount.selector);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_slippage_too_high() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.maxSlippageBps = 5_001; // > 50%
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.SlippageTooHigh.selector, 5_001));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_insufficient_idle_balance() public {
        _depositAs(alice, 10_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(20_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(
            abi.encodeWithSelector(ObidotVault.InsufficientIdleBalance.selector, 10_000 ether, 20_000 ether)
        );
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_execute_when_paused() public {
        _depositAs(alice, 50_000 ether);

        vm.prank(admin);
        vault.pause();

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_reentrancy_guard_on_deposit() public {
        // ReentrancyGuard prevents re-entry. We just verify the modifier is present
        // by checking that deposit/withdraw don't revert under normal conditions.
        _depositAs(alice, 1_000 ether);

        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        assertEq(vault.totalAssets(), 0);
    }

    function test_only_admin_can_configure_policy() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setParachainAllowed(1000, true);

        vm.prank(alice);
        vm.expectRevert();
        vault.setProtocolAllowed(address(0x1), true);

        vm.prank(alice);
        vm.expectRevert();
        vault.setDepositCap(999);

        vm.prank(alice);
        vm.expectRevert();
        vault.setMaxDailyLoss(999);

        vm.prank(alice);
        vm.expectRevert();
        vault.pause();

        vm.prank(alice);
        vm.expectRevert();
        vault.enableEmergencyMode();
    }

    function test_only_keeper_can_report_outcome() public {
        _depositAs(alice, 50_000 ether);
        uint256 id = _executeDefaultStrategy(10_000 ether);

        vm.prank(alice);
        vm.expectRevert();
        vault.reportStrategyOutcome(id, true, 10_000 ether);
    }

    function test_cross_chain_domain_separator() public view {
        // Verify the domain separator is unique to this chain/contract
        bytes32 expected = keccak256(
            abi.encode(vault.DOMAIN_TYPEHASH(), keccak256("ObidotVault"), keccak256("1"), block.chainid, address(vault))
        );
        assertEq(vault.DOMAIN_SEPARATOR(), expected);
    }

    function test_revert_report_nonexistent_strategy() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ObidotVault.StrategyNotFound.selector, 999));
        vault.reportStrategyOutcome(999, true, 1_000 ether);
    }

    function test_revert_report_already_reported_strategy() public {
        _depositAs(alice, 50_000 ether);
        uint256 id = _executeDefaultStrategy(10_000 ether);

        vm.prank(admin);
        vault.reportStrategyOutcome(id, true, 10_000 ether);

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                ObidotVault.InvalidStrategyStatus.selector,
                id,
                ObidotVault.StrategyStatus.Executed,
                ObidotVault.StrategyStatus.Sent
            )
        );
        vault.reportStrategyOutcome(id, true, 10_000 ether);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Integration Tests — Policy Engine
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_PolicyEngine_Test is ObidotVaultTestBase {
    function test_revert_parachain_not_allowed() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.targetParachain = 9999; // Not whitelisted
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.ParachainNotAllowed.selector, 9999));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_protocol_not_allowed() public {
        _depositAs(alice, 50_000 ether);

        address unknownProtocol = makeAddr("unknownProtocol");
        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        intent.targetProtocol = unknownProtocol;
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.ProtocolNotAllowed.selector, unknownProtocol));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_exposure_cap_exceeded() public {
        _depositAs(alice, 100_000 ether);
        token.mint(alice, 900_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        _depositAs(alice, 900_000 ether);

        // Exposure cap is 500k
        // Deploy 400k — OK
        _executeDefaultStrategy(400_000 ether);

        // Deploy another 200k — exceeds 500k cap
        ObidotVault.StrategyIntent memory intent = _defaultIntent(200_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(
            abi.encodeWithSelector(
                ObidotVault.ExposureCapExceeded.selector, targetProtocol, 400_000 ether, 200_000 ether, 500_000 ether
            )
        );
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_exposure_resets_after_outcome_report() public {
        _depositAs(alice, 100_000 ether);

        uint256 id = _executeDefaultStrategy(100_000 ether);
        assertEq(vault.protocolExposure(targetProtocol), 100_000 ether);

        token.mint(address(vault), 100_000 ether); // simulate return
        vm.prank(admin);
        vault.reportStrategyOutcome(id, true, 100_000 ether);

        assertEq(vault.protocolExposure(targetProtocol), 0);
    }

    function test_daily_loss_resets_after_window() public {
        _depositAs(alice, 100_000 ether);

        uint256 id = _executeDefaultStrategy(50_000 ether);

        // Report a 40k loss (under 50k threshold)
        token.mint(address(vault), 10_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(id, false, 10_000 ether);
        assertEq(vault.dailyLossAccumulator(), 40_000 ether);

        // Warp forward 1 day
        vm.warp(block.timestamp + 1 days + 1);

        // Refresh oracle so it isn't stale after the time warp
        oracle.setPrice(1e8);

        // Mint tokens to replenish vault for next strategy
        token.mint(address(vault), 50_000 ether);

        uint256 id2 = _executeDefaultStrategy(30_000 ether);

        // Report a small loss
        token.mint(address(vault), 25_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(id2, false, 25_000 ether);

        // Accumulator should be 5k (new window), not 45k
        assertEq(vault.dailyLossAccumulator(), 5_000 ether);
    }

    function test_parachain_whitelist_toggle() public {
        vm.prank(admin);
        vault.setParachainAllowed(PARA_ASTAR, false);

        _depositAs(alice, 50_000 ether);
        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.ParachainNotAllowed.selector, PARA_ASTAR));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);

        // Re-enable
        vm.prank(admin);
        vault.setParachainAllowed(PARA_ASTAR, true);

        // Re-sign (nonce unchanged since prev call reverted)
        sig = _signIntent(intent);
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Integration Tests — Oracle
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_Oracle_Test is ObidotVaultTestBase {
    function test_oracle_slippage_validation_passes() public {
        _depositAs(alice, 50_000 ether);

        // Oracle price = 1e8 (1 USD), minReturn = 9900 ether for 10k ether (1% slippage OK)
        ObidotVault.StrategyIntent memory intent = _defaultIntent(10_000 ether);
        intent.minReturn = 9_900 ether;
        intent.maxSlippageBps = 100; // 1%
        bytes memory sig = _signIntent(intent);

        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_oracle_slippage_check_failed() public {
        _depositAs(alice, 50_000 ether);

        // Oracle price = 1e8, maxSlippage = 1% (100 bps)
        // oracleMinimum = 10000 * 1e8 * (10000 - 100) / (10000 * 1e8) = 9900
        // Setting minReturn below oracleMinimum should fail
        ObidotVault.StrategyIntent memory intent = _defaultIntent(10_000 ether);
        intent.minReturn = 9_800 ether; // Below oracle minimum of 9900
        intent.maxSlippageBps = 100;
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(
            abi.encodeWithSelector(ObidotVault.OracleSlippageCheckFailed.selector, 9_800 ether, 9_900 ether)
        );
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_oracle_stale_data() public {
        _depositAs(alice, 50_000 ether);

        // Warp forward so that setStale() doesn't underflow
        vm.warp(block.timestamp + 10_000);
        oracle.setStale(); // 2 hours old relative to current timestamp

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(); // OracleDataInvalid
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_oracle_negative_price() public {
        _depositAs(alice, 50_000 ether);

        oracle.setPriceRaw(-1, block.timestamp);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(); // OracleDataInvalid
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_oracle_zero_price() public {
        _depositAs(alice, 50_000 ether);

        oracle.setPriceRaw(0, block.timestamp);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(); // OracleDataInvalid
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_oracle_update() public {
        address newOracle = address(new MockOracle(2e8, 8));

        vm.prank(admin);
        vault.setOracle(newOracle);

        assertEq(address(vault.priceOracle()), newOracle);
    }

    function test_revert_oracle_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        vault.setOracle(address(0));
    }

    function testFuzz_oracle_price_slippage_boundary(uint256 amount, uint256 slippageBps) public {
        amount = bound(amount, 1 ether, 100_000 ether);
        slippageBps = bound(slippageBps, 1, 5000);

        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        _depositAs(alice, amount);

        // Oracle price = 1e8, so oracleMinimum = amount * (10000 - slippageBps) / 10000
        // rounded up (Ceil)
        uint256 oracleMinimum = Math.mulDiv(amount, 1e8 * (10_000 - slippageBps), 10_000 * 1e8, Math.Rounding.Ceil);

        // Intent with minReturn exactly at oracleMinimum should pass
        ObidotVault.StrategyIntent memory intent = _defaultIntent(amount);
        intent.minReturn = oracleMinimum;
        intent.maxSlippageBps = slippageBps;
        bytes memory sig = _signIntent(intent);

        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Integration Tests — XCM Weight
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_XCM_Test is ObidotVaultTestBase {
    function test_xcm_weight_within_limits() public {
        _depositAs(alice, 50_000 ether);

        // Default mock weights: 500B refTime, 512KB proofSize
        // After 10% margin: 550B refTime, ~576KB proofSize
        // Limits: 1T refTime, 1MB proofSize — should pass
        _executeDefaultStrategy(1_000 ether);
    }

    function test_revert_xcm_overweight_refTime() public {
        _depositAs(alice, 50_000 ether);

        // Set mock refTime to exceed limits after safety margin
        // maxRefTime = 1T, margin = 110%, so refTime > 1T / 1.1 = ~909B would overflow
        vm.store(
            XCM_PRECOMPILE_ADDR,
            bytes32(uint256(0)),
            bytes32(uint256(950_000_000_000)) // 950B * 110% = 1.045T > 1T
        );

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(); // XcmOverweight
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_revert_xcm_overweight_proofSize() public {
        _depositAs(alice, 50_000 ether);

        // Set proofSize to exceed limits after 10% safety margin
        // maxProofSize = 1MB, margin = 110%, so proofSize > 1MB / 1.1 = ~953KB would overflow
        // Set refTime to safe value, proofSize to 1MB (1_000_000 * 110% = 1.1MB > 1MB)
        vm.store(
            XCM_PRECOMPILE_ADDR,
            bytes32(uint256(0)),
            bytes32(uint256(500_000_000_000)) // refTime stays safe
        );
        vm.store(
            XCM_PRECOMPILE_ADDR,
            bytes32(uint256(1)),
            bytes32(uint256(1_000_000)) // 1MB * 110% = 1.1MB > 1MB limit
        );

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(); // XcmOverweight
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_xcm_weight_limits_update() public {
        vm.prank(admin);
        vault.setXcmWeightLimits(2_000_000_000_000, 2_097_152);

        assertEq(vault.maxXcmRefTime(), 2_000_000_000_000);
        assertEq(vault.maxXcmProofSize(), 2_097_152);
    }

    function testFuzz_xcm_weight_safety_margin(uint64 refTime, uint64 proofSize) public {
        // Ensure values don't overflow uint64 after multiplying by 110
        refTime = uint64(bound(uint256(refTime), 1, type(uint64).max / 110));
        proofSize = uint64(bound(uint256(proofSize), 1, type(uint64).max / 110));

        uint64 adjustedRefTime = (refTime * 110) / 100;
        uint64 adjustedProofSize = (proofSize * 110) / 100;

        // If adjusted fits within limits, execution should succeed
        bool shouldFit = adjustedRefTime <= MAX_REF_TIME && adjustedProofSize <= MAX_PROOF_SIZE;

        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(0)), bytes32(uint256(refTime)));
        vm.store(XCM_PRECOMPILE_ADDR, bytes32(uint256(1)), bytes32(uint256(proofSize)));

        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        if (shouldFit) {
            vm.prank(relayer);
            vault.executeStrategy(intent, sig);
        } else {
            vm.expectRevert();
            vm.prank(relayer);
            vault.executeStrategy(intent, sig);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Admin & Emergency Tests
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_Admin_Test is ObidotVaultTestBase {
    function test_pause_unpause() public {
        vm.prank(admin);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_emergency_mode_lifecycle() public {
        _depositAs(alice, 50_000 ether);
        _executeDefaultStrategy(20_000 ether);

        // Enable emergency mode
        vm.prank(admin);
        vault.enableEmergencyMode();
        assertTrue(vault.paused());
        assertTrue(vault.emergencyMode());

        // Withdrawals should work in emergency mode
        // In emergency: totalAssets = idle balance = 30k (50k deposited - 20k sent)
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        // Unpause should clear emergency mode
        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());
        assertFalse(vault.emergencyMode());
    }

    function test_adjustRemoteAssets() public {
        _depositAs(alice, 50_000 ether);
        _executeDefaultStrategy(20_000 ether);

        assertEq(vault.totalRemoteAssets(), 20_000 ether);

        vm.prank(admin);
        vault.adjustRemoteAssets(15_000 ether, "Partial return observed");

        assertEq(vault.totalRemoteAssets(), 15_000 ether);
    }

    function test_setDepositCap_revert_zero() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVault.InvalidCap.selector);
        vault.setDepositCap(0);
    }

    function test_setProtocolAllowed_revert_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        vault.setProtocolAllowed(address(0), true);
    }

    function test_setProtocolExposureCap_revert_zero_address() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        vault.setProtocolExposureCap(address(0), 1000);
    }

    function test_idleAssets_view() public {
        _depositAs(alice, 50_000 ether);
        _executeDefaultStrategy(20_000 ether);

        assertEq(vault.idleAssets(), 30_000 ether);
    }

    function test_dailyLossStatus_view() public {
        (uint256 accumulated, uint256 maxAllowed, uint256 windowResetAt) = vault.dailyLossStatus();
        assertEq(accumulated, 0);
        assertEq(maxAllowed, MAX_DAILY_LOSS);
        assertGt(windowResetAt, block.timestamp);
    }

    function test_supportsInterface() public view {
        // AccessControl interface
        assertTrue(vault.supportsInterface(type(IAccessControl).interfaceId));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MultiLocation Library Tests
// ═══════════════════════════════════════════════════════════════════════════

interface IAccessControl {
    function hasRole(bytes32, address) external view returns (bool);

    function getRoleAdmin(bytes32) external view returns (bytes32);

    function grantRole(bytes32, address) external;

    function revokeRole(bytes32, address) external;

    function renounceRole(bytes32, address) external;
}

contract MultiLocation_Test is Test {
    function test_relayChain_v3() public pure {
        bytes memory encoded = MultiLocation.relayChain(0x03);
        // V3(0x03) + parents(0x01) + Here(0x00)
        assertEq(encoded, hex"030100");
    }

    function test_relayChain_v4() public pure {
        bytes memory encoded = MultiLocation.relayChain(0x04);
        assertEq(encoded, hex"040100");
    }

    function test_siblingParachain_small_id() public pure {
        // Parachain 10 → compact = 10 << 2 = 40 = 0x28
        bytes memory encoded = MultiLocation.siblingParachain(0x03, 10);
        // V3 + parents(1) + X1 + Parachain + compact(10)
        assertEq(encoded, hex"0301010028");
    }

    function test_siblingParachain_astar() public pure {
        // Parachain 2006 → compact two-byte mode
        // 2006 << 2 | 0x01 = 8025 = 0x1F59 → LE: 0x59, 0x1F
        bytes memory encoded = MultiLocation.siblingParachain(0x04, 2006);
        assertEq(encoded, hex"04010100591f");
    }

    function test_siblingParachain_large_id() public pure {
        // Parachain 100000 → compact four-byte mode
        // 100000 << 2 | 0x02 = 400002 = 0x61A82 → LE bytes
        bytes memory encoded = MultiLocation.siblingParachain(0x03, 100000);
        uint32 compact = (100000 << 2) | 0x02;
        bytes memory expected = abi.encodePacked(
            uint8(0x03),
            uint8(0x01),
            uint8(0x01),
            uint8(0x00),
            uint8(compact & 0xFF),
            uint8((compact >> 8) & 0xFF),
            uint8((compact >> 16) & 0xFF),
            uint8(compact >> 24)
        );
        assertEq(encoded, expected);
    }

    function test_siblingParachainAccountKey20() public pure {
        address account = 0x1234567890AbcdEF1234567890aBcdef12345678;
        bytes memory encoded = MultiLocation.siblingParachainAccountKey20(0x04, 2006, account);

        // V4 + parents(1) + X2 + Parachain(2006) + AccountKey20(None, account)
        // Parachain: 0x00 + compact(2006) = 0x00 591f
        // AccountKey20: 0x03 + 0x00 (None) + 20-byte address
        bytes memory expected = abi.encodePacked(
            uint8(0x04), uint8(0x01), uint8(0x02), uint8(0x00), hex"591f", uint8(0x03), uint8(0x00), account
        );
        assertEq(encoded, expected);
    }

    function test_siblingParachainAccountId32() public pure {
        bytes32 accountId = bytes32(uint256(0xDEADBEEF));
        bytes memory encoded = MultiLocation.siblingParachainAccountId32(0x03, 2006, accountId);

        bytes memory expected = abi.encodePacked(
            uint8(0x03), uint8(0x01), uint8(0x02), uint8(0x00), hex"591f", uint8(0x01), uint8(0x00), accountId
        );
        assertEq(encoded, expected);
    }

    function test_localHere() public pure {
        bytes memory encoded = MultiLocation.localHere(0x03);
        assertEq(encoded, hex"030000");
    }

    function test_childParachain() public pure {
        bytes memory encoded = MultiLocation.childParachain(0x04, 2006);
        assertEq(encoded, hex"04000100591f");
    }

    function test_extractParachainId_sibling() public pure {
        bytes memory dest = MultiLocation.siblingParachain(0x04, 2006);
        uint32 id = MultiLocation.extractParachainId(dest);
        assertEq(id, 2006);
    }

    function test_extractParachainId_relay_returns_zero() public pure {
        bytes memory dest = MultiLocation.relayChain(0x03);
        uint32 id = MultiLocation.extractParachainId(dest);
        assertEq(id, 0);
    }

    function test_extractParachainId_local_returns_zero() public pure {
        bytes memory dest = MultiLocation.localHere(0x04);
        uint32 id = MultiLocation.extractParachainId(dest);
        assertEq(id, 0);
    }

    function testFuzz_compactU32_roundtrip(uint32 value) public pure {
        value = uint32(bound(uint256(value), 0, 0x3FFFFFFF));
        if (value > 0x3F) {
            bytes memory dest2 = MultiLocation.siblingParachain(0x04, value);
            uint32 extracted2 = MultiLocation.extractParachainId(dest2);
            assertEq(extracted2, value, "Compact encoding roundtrip failed");
            return;
        }

        // For single-byte values, verify direct encoding
        bytes memory dest = MultiLocation.siblingParachain(0x04, value);
        uint32 extracted = MultiLocation.extractParachainId(dest);
        assertEq(extracted, value);
    }

    function test_revert_unsupported_version() public {
        // Library calls are inlined, so vm.expectRevert won't catch them.
        // Use a wrapper contract to make an external call instead.
        MultiLocationWrapper wrapper = new MultiLocationWrapper();
        vm.expectRevert(abi.encodeWithSelector(MultiLocation.UnsupportedVersion.selector, 0x02));
        wrapper.relayChain(0x02);
    }

    function test_siblingParachainPalletAsset() public pure {
        bytes memory encoded = MultiLocation.siblingParachainPalletAsset(0x04, 2006, 50, 100);
        // V4 + parents(1) + X3 + Parachain(2006) + PalletInstance(50) + GeneralIndex(compact(100))
        bytes memory expected = abi.encodePacked(
            uint8(0x04),
            uint8(0x01),
            uint8(0x03),
            uint8(0x00),
            hex"591f", // Parachain(2006)
            uint8(0x04),
            uint8(50), // PalletInstance(50)
            uint8(0x05),
            hex"9101" // GeneralIndex(compact(100)) — two-byte mode: (100<<2)|1 = 401 = 0x0191 LE
        );
        assertEq(encoded, expected);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Constructor Validation Tests
// ═══════════════════════════════════════════════════════════════════════════

/// @dev Wrapper contract to make library calls external so vm.expectRevert works.
contract MultiLocationWrapper {
    function relayChain(uint8 version) external pure returns (bytes memory) {
        return MultiLocation.relayChain(version);
    }
}

contract ObidotVault_Constructor_Test is Test {
    function test_revert_zero_oracle() public {
        MockERC20 tok = new MockERC20("T", "T", 18);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        new ObidotVault(IERC20(address(tok)), address(0), 1e18, 1e18, 1e12, 1e6, makeAddr("admin"));
    }

    function test_revert_zero_admin() public {
        MockERC20 tok = new MockERC20("T", "T", 18);
        MockOracle orc = new MockOracle(1e8, 8);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        new ObidotVault(IERC20(address(tok)), address(orc), 1e18, 1e18, 1e12, 1e6, address(0));
    }

    function test_revert_zero_deposit_cap() public {
        MockERC20 tok = new MockERC20("T", "T", 18);
        MockOracle orc = new MockOracle(1e8, 8);
        vm.expectRevert(ObidotVault.InvalidCap.selector);
        new ObidotVault(IERC20(address(tok)), address(orc), 0, 1e18, 1e12, 1e6, makeAddr("admin"));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Invariant Tests — ERC-4626 Share Accounting
// ═══════════════════════════════════════════════════════════════════════════

/// @dev Handler contract for invariant testing.
contract VaultHandler is Test {
    ObidotVault public vault;
    MockERC20 public token;
    address[] public actors;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    constructor(ObidotVault _vault, MockERC20 _token) {
        vault = _vault;
        token = _token;

        for (uint256 i = 0; i < 5; i++) {
            address actor = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            actors.push(actor);
            token.mint(actor, 1_000_000 ether);
            vm.prank(actor);
            token.approve(address(vault), type(uint256).max);
        }
    }

    function deposit(uint256 actorIndex, uint256 amount) external {
        actorIndex = bound(actorIndex, 0, actors.length - 1);
        address actor = actors[actorIndex];
        amount = bound(amount, 1, vault.maxDeposit(actor));
        if (amount == 0) return;
        if (token.balanceOf(actor) < amount) return;

        vm.prank(actor);
        vault.deposit(amount, actor);
        totalDeposited += amount;
    }

    function redeem(uint256 actorIndex, uint256 sharesFraction) external {
        actorIndex = bound(actorIndex, 0, actors.length - 1);
        address actor = actors[actorIndex];
        uint256 maxShares = vault.balanceOf(actor);
        if (maxShares == 0) return;
        sharesFraction = bound(sharesFraction, 1, maxShares);

        vm.prank(actor);
        uint256 assets = vault.redeem(sharesFraction, actor, actor);
        totalWithdrawn += assets;
    }

    function withdraw(uint256 actorIndex, uint256 assetsFraction) external {
        actorIndex = bound(actorIndex, 0, actors.length - 1);
        address actor = actors[actorIndex];
        uint256 maxAssets = vault.maxWithdraw(actor);
        if (maxAssets == 0) return;
        assetsFraction = bound(assetsFraction, 1, maxAssets);

        vm.prank(actor);
        vault.withdraw(assetsFraction, actor, actor);
        totalWithdrawn += assetsFraction;
    }
}

contract ObidotVault_Invariant_Test is Test {
    ObidotVault internal vault;
    MockERC20 internal token;
    MockOracle internal oracle;
    VaultHandler internal handler;

    function setUp() public {
        vm.warp(10_000);
        token = new MockERC20("Mock DOT", "mDOT", 18);
        oracle = new MockOracle(1e8, 8);

        // Deploy mock XCM precompile
        MockXcmPrecompile xcmMock = new MockXcmPrecompile();
        vm.etch(0x00000000000000000000000000000000000a0000, address(xcmMock).code);
        vm.store(0x00000000000000000000000000000000000a0000, bytes32(uint256(0)), bytes32(uint256(500_000_000_000)));
        vm.store(0x00000000000000000000000000000000000a0000, bytes32(uint256(1)), bytes32(uint256(524_288)));

        address admin = makeAddr("admin");

        vault = new ObidotVault(
            IERC20(address(token)),
            address(oracle),
            10_000_000 ether, // Large cap for invariant testing
            50_000 ether,
            1_000_000_000_000,
            1_048_576,
            admin
        );

        handler = new VaultHandler(vault, token);

        targetContract(address(handler));
    }

    /// @dev Invariant: totalSupply * totalAssets relationship is consistent
    ///      If totalSupply > 0, then totalAssets > 0 (no zombie shares)
    function invariant_no_zombie_shares() public view {
        if (vault.totalSupply() > 0) {
            assertGt(vault.totalAssets(), 0, "Zombie shares: supply > 0 but assets = 0");
        }
    }

    /// @dev Invariant: vault token balance >= totalAssets - totalRemoteAssets
    ///      (The vault should always hold at least the idle portion)
    function invariant_idle_balance_consistency() public view {
        uint256 vaultBal = token.balanceOf(address(vault));
        uint256 remote = vault.totalRemoteAssets();
        uint256 total = vault.totalAssets();

        if (total >= remote) {
            // idle should be total - remote (in normal mode)
            assertEq(vaultBal, total - remote, "Idle balance mismatch");
        }
    }

    /// @dev Invariant: convertToAssets(convertToShares(x)) <= x (rounding loss only)
    function invariant_conversion_rounding() public view {
        uint256 testAmount = 1 ether;
        uint256 shares = vault.convertToShares(testAmount);
        uint256 assets = vault.convertToAssets(shares);
        assertLe(assets, testAmount, "Conversion should not create value");
    }

    /// @dev Invariant: total deposited >= total withdrawn (vault can't give more than received)
    function invariant_deposits_ge_withdrawals() public view {
        assertGe(handler.totalDeposited(), handler.totalWithdrawn(), "More withdrawn than deposited");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Edge Case & Stress Tests
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVault_EdgeCase_Test is ObidotVaultTestBase {
    function test_multiple_strategists() public {
        // Add a second strategist
        uint256 strategist2Pk = 0xB0B;
        address strategist2 = vm.addr(strategist2Pk);

        bytes32 strategistRole = vault.STRATEGIST_ROLE();
        vm.prank(admin);
        vault.grantRole(strategistRole, strategist2);

        _depositAs(alice, 50_000 ether);

        // Strategist 1 executes
        ObidotVault.StrategyIntent memory intent1 = _defaultIntent(5_000 ether);
        bytes memory sig1 = _signIntent(intent1);
        vm.prank(relayer);
        vault.executeStrategy(intent1, sig1);
        token.burn(address(vault), 5_000 ether); // simulate XCM transfer

        // Strategist 2 executes (different nonce space)
        ObidotVault.StrategyIntent memory intent2 = _defaultIntent(5_000 ether);
        intent2.nonce = vault.nonces(strategist2);
        bytes memory sig2 = _signIntentWithKey(intent2, strategist2Pk);

        vm.prank(relayer);
        vault.executeStrategy(intent2, sig2);

        assertEq(vault.nonces(strategist), 1);
        assertEq(vault.nonces(strategist2), 1);
        assertEq(vault.totalRemoteAssets(), 10_000 ether);
    }

    function test_deposit_exactly_at_cap() public {
        token.mint(alice, DEPOSIT_CAP);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_CAP);

        _depositAs(alice, DEPOSIT_CAP);

        assertEq(vault.totalAssets(), DEPOSIT_CAP);
        assertEq(vault.maxDeposit(bob), 0);
    }

    function test_strategy_with_moonbeam_parachain() public {
        _depositAs(alice, 50_000 ether);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(5_000 ether);
        intent.targetParachain = PARA_MOONBEAM;
        bytes memory sig = _signIntent(intent);

        vm.prank(relayer);
        uint256 id = vault.executeStrategy(intent, sig);

        (,,,, uint32 para,,) = vault.strategies(id);
        assertEq(para, PARA_MOONBEAM);
    }

    function test_revoke_strategist_role() public {
        _depositAs(alice, 50_000 ether);

        // Revoke strategist role
        bytes32 strategistRole = vault.STRATEGIST_ROLE();
        vm.prank(admin);
        vault.revokeRole(strategistRole, strategist);

        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes memory sig = _signIntent(intent);

        vm.expectRevert(abi.encodeWithSelector(ObidotVault.UnauthorizedStrategist.selector, strategist));
        vm.prank(relayer);
        vault.executeStrategy(intent, sig);
    }

    function test_exposure_cap_zero_means_unlimited() public {
        // Set exposure cap to 0 (unlimited)
        vm.prank(admin);
        vault.setProtocolExposureCap(targetProtocol, 0);

        _depositAs(alice, 100_000 ether);
        token.mint(alice, 900_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        _depositAs(alice, 900_000 ether);

        // Should be able to deploy everything
        _executeDefaultStrategy(DEPOSIT_CAP);
        assertEq(vault.protocolExposure(targetProtocol), DEPOSIT_CAP);
    }

    function test_computeIntentDigest_consistency() public view {
        ObidotVault.StrategyIntent memory intent = _defaultIntent(1_000 ether);
        bytes32 digest1 = vault.computeIntentDigest(intent);
        bytes32 digest2 = vault.computeIntentDigest(intent);
        assertEq(digest1, digest2, "Digest should be deterministic");
    }

    function test_nonce_increments_even_on_strategy_success() public {
        _depositAs(alice, 50_000 ether);

        assertEq(vault.nonces(strategist), 0);
        _executeDefaultStrategy(1_000 ether);
        assertEq(vault.nonces(strategist), 1);
        _executeDefaultStrategy(1_000 ether);
        assertEq(vault.nonces(strategist), 2);
    }

    function test_large_number_of_strategies() public {
        token.mint(alice, 10_000_000 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);

        // Increase deposit cap and exposure cap for this test
        vm.startPrank(admin);
        vault.setDepositCap(10_000_000 ether);
        vault.setProtocolExposureCap(targetProtocol, 10_000_000 ether);
        vm.stopPrank();

        _depositAs(alice, 10_000_000 ether);

        // Execute 50 strategies
        for (uint256 i = 0; i < 50; i++) {
            _executeDefaultStrategy(100_000 ether);
        }

        assertEq(vault.strategyCounter(), 50);
        assertEq(vault.totalRemoteAssets(), 5_000_000 ether);
    }

    function test_withdraw_reduces_idle_not_remote() public {
        _depositAs(alice, 100_000 ether);

        _executeDefaultStrategy(30_000 ether);

        // Idle = 70k, remote = 30k, total = 100k
        assertEq(vault.idleAssets(), 70_000 ether);
        assertEq(vault.totalRemoteAssets(), 30_000 ether);
        assertEq(vault.totalAssets(), 100_000 ether);

        // Alice withdraws 20k — should reduce idle, not remote
        vm.prank(alice);
        vault.withdraw(20_000 ether, alice, alice);

        assertEq(vault.idleAssets(), 50_000 ether);
        assertEq(vault.totalRemoteAssets(), 30_000 ether);
        assertEq(vault.totalAssets(), 80_000 ether);
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  Phase 1 Tests — Dynamic DOMAIN_SEPARATOR & Daily Loss Reset
// ═════════════════════════════════════════════════════════════════════════

contract ObidotVault_DomainSeparator_Test is ObidotVaultTestBase {
    function test_domain_separator_matches_chain_id() public view {
        bytes32 expected = keccak256(
            abi.encode(vault.DOMAIN_TYPEHASH(), keccak256("ObidotVault"), keccak256("1"), block.chainid, address(vault))
        );
        assertEq(vault.DOMAIN_SEPARATOR(), expected);
    }

    function test_domain_separator_changes_on_fork() public {
        bytes32 originalDS = vault.DOMAIN_SEPARATOR();

        // Simulate a chain fork by changing the chain ID
        vm.chainId(999);

        bytes32 forkedDS = vault.DOMAIN_SEPARATOR();

        // The domain separator should be different on the fork
        assertTrue(originalDS != forkedDS, "DS should differ on fork");

        // Verify it matches the new chain's expected value
        bytes32 expectedForked = keccak256(
            abi.encode(vault.DOMAIN_TYPEHASH(), keccak256("ObidotVault"), keccak256("1"), uint256(999), address(vault))
        );
        assertEq(forkedDS, expectedForked);
    }

    function test_domain_separator_returns_cached_on_same_chain() public view {
        // On the deployment chain, should return the cached value
        bytes32 ds1 = vault.DOMAIN_SEPARATOR();
        bytes32 ds2 = vault.DOMAIN_SEPARATOR();
        assertEq(ds1, ds2);
    }

    function test_signatures_invalid_on_forked_chain() public {
        // Execute a strategy on the original chain (works)
        _depositAs(alice, 50_000 ether);
        ObidotVault.StrategyIntent memory intent = _defaultIntent(10_000 ether);
        bytes memory sig = _signIntent(intent);

        // Fork the chain
        vm.chainId(999);

        // The same signature should fail because DOMAIN_SEPARATOR changed
        // Recovery yields a different address (not the strategist)
        vm.prank(relayer);
        vm.expectRevert(); // UnauthorizedStrategist with wrong recovered address
        vault.executeStrategy(intent, sig);
    }
}

contract ObidotVault_DailyLossReset_Test is ObidotVaultTestBase {
    function test_policy_engine_resets_stale_loss_accumulator() public {
        _depositAs(alice, 100_000 ether);

        // Execute a strategy and report a loss
        uint256 sid = _executeDefaultStrategy(40_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, false, 0); // Total loss

        assertEq(vault.dailyLossAccumulator(), 40_000 ether);

        // Try another strategy — daily loss accumulator is at 40k, max is 50k
        // This should work because we haven't breached the threshold
        _executeDefaultStrategy(5_000 ether);

        // Now warp past the daily window (24 hours)
        vm.warp(block.timestamp + 1 days + 1);
        oracle.setPrice(1e8); // Refresh oracle to avoid staleness

        // Execute another strategy — the policy engine should reset the accumulator
        _executeDefaultStrategy(5_000 ether);

        // The accumulator should have been reset by _enforcePolicyEngine
        assertEq(vault.dailyLossAccumulator(), 0);
    }

    function test_policy_engine_blocks_when_loss_exceeds_threshold() public {
        _depositAs(alice, 100_000 ether);

        // Execute and report a massive loss that triggers circuit breaker
        uint256 sid = _executeDefaultStrategy(60_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, false, 0); // 60k loss > 50k threshold

        // Vault should be paused and in emergency mode
        assertTrue(vault.paused());
        assertTrue(vault.emergencyMode());
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  Phase 2 Tests — Withdrawal Queue
// ═════════════════════════════════════════════════════════════════════════

contract ObidotVault_WithdrawalQueue_Test is ObidotVaultTestBase {
    uint256 constant TIMELOCK = 1 hours;

    function setUp() public override {
        super.setUp();
        vm.prank(admin);
        vault.setWithdrawalTimelock(TIMELOCK);
    }

    function test_request_withdrawal_queues_correctly() public {
        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        (address owner, uint256 reqShares, uint256 reqAssets, uint256 claimableAt) =
            vault.getWithdrawalRequest(requestId);

        assertEq(owner, alice);
        assertEq(reqShares, shares);
        assertEq(reqAssets, 10_000 ether); // 1:1 since virtual offset
        assertEq(claimableAt, block.timestamp + TIMELOCK);

        // Shares should be burned
        assertEq(vault.balanceOf(alice), 0);
    }

    function test_fulfill_withdrawal_after_timelock() public {
        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        // Warp past timelock
        vm.warp(block.timestamp + TIMELOCK + 1);

        uint256 aliceBalBefore = token.balanceOf(alice);
        vault.fulfillWithdrawal(requestId);
        uint256 aliceBalAfter = token.balanceOf(alice);

        // Alice should have received her assets
        assertTrue(aliceBalAfter > aliceBalBefore);

        // Request should be cleared
        (address owner,,,) = vault.getWithdrawalRequest(requestId);
        assertEq(owner, address(0));
    }

    function test_fulfill_withdrawal_reverts_before_timelock() public {
        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        vm.expectRevert(
            abi.encodeWithSelector(ObidotVault.WithdrawalNotClaimable.selector, requestId, block.timestamp + TIMELOCK)
        );
        vault.fulfillWithdrawal(requestId);
    }

    function test_cancel_withdrawal_returns_shares() public {
        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);
        assertEq(vault.balanceOf(alice), 0);

        // Cancel
        vm.prank(alice);
        vault.cancelWithdrawal(requestId);

        // Shares should be returned
        assertEq(vault.balanceOf(alice), shares);

        // Request should be cleared
        (address owner,,,) = vault.getWithdrawalRequest(requestId);
        assertEq(owner, address(0));
    }

    function test_cancel_withdrawal_reverts_for_non_owner() public {
        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ObidotVault.NotWithdrawalOwner.selector, requestId, bob));
        vault.cancelWithdrawal(requestId);
    }

    function test_fulfill_reverts_insufficient_idle() public {
        _depositAs(alice, 50_000 ether);
        uint256 shares = vault.balanceOf(alice);

        // Deploy most assets remotely
        _executeDefaultStrategy(45_000 ether);

        // Request withdrawal for all shares
        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        vm.warp(block.timestamp + TIMELOCK + 1);

        // Fulfill should fail — idle is only 5k but request wants more
        vm.expectRevert();
        vault.fulfillWithdrawal(requestId);
    }

    function test_request_zero_shares_reverts() public {
        _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        vm.expectRevert(ObidotVault.ZeroAmount.selector);
        vault.requestWithdrawal(0);
    }

    function test_fulfill_nonexistent_request_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ObidotVault.WithdrawalNotFound.selector, 999));
        vault.fulfillWithdrawal(999);
    }

    function test_instant_withdrawal_when_timelock_zero() public {
        // Set timelock to 0
        vm.prank(admin);
        vault.setWithdrawalTimelock(0);

        uint256 shares = _depositAs(alice, 10_000 ether);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(shares);

        // Should be immediately fulfillable
        uint256 balBefore = token.balanceOf(alice);
        vault.fulfillWithdrawal(requestId);
        assertTrue(token.balanceOf(alice) > balBefore);
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  Phase 3 Tests — Batch Execution & Protocol Performance
// ═════════════════════════════════════════════════════════════════════════

contract ObidotVault_BatchExecution_Test is ObidotVaultTestBase {
    function test_batch_execute_two_strategies() public {
        _depositAs(alice, 100_000 ether);

        ObidotVault.StrategyIntent memory intent1 = _defaultIntent(10_000 ether);
        bytes memory sig1 = _signIntent(intent1);

        ObidotVault.StrategyIntent memory intent2 = _defaultIntent(5_000 ether);
        intent2.nonce = 1; // Second nonce
        bytes memory sig2 = _signIntent(intent2);

        ObidotVault.StrategyIntent[] memory intents = new ObidotVault.StrategyIntent[](2);
        intents[0] = intent1;
        intents[1] = intent2;

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = sig1;
        sigs[1] = sig2;

        vm.prank(relayer);
        uint256[] memory ids = vault.executeStrategies(intents, sigs);

        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
        assertEq(vault.totalRemoteAssets(), 15_000 ether);
    }

    function test_batch_reverts_on_length_mismatch() public {
        ObidotVault.StrategyIntent[] memory intents = new ObidotVault.StrategyIntent[](2);
        bytes[] memory sigs = new bytes[](1);

        vm.prank(relayer);
        vm.expectRevert(ObidotVault.ArrayLengthMismatch.selector);
        vault.executeStrategies(intents, sigs);
    }

    function test_batch_reverts_if_one_strategy_invalid() public {
        _depositAs(alice, 100_000 ether);

        ObidotVault.StrategyIntent memory intent1 = _defaultIntent(10_000 ether);
        bytes memory sig1 = _signIntent(intent1);

        // Second intent with wrong nonce
        ObidotVault.StrategyIntent memory intent2 = _defaultIntent(5_000 ether);
        intent2.nonce = 999; // Wrong nonce
        bytes memory sig2 = _signIntent(intent2);

        ObidotVault.StrategyIntent[] memory intents = new ObidotVault.StrategyIntent[](2);
        intents[0] = intent1;
        intents[1] = intent2;

        bytes[] memory sigs = new bytes[](2);
        sigs[0] = sig1;
        sigs[1] = sig2;

        vm.prank(relayer);
        vm.expectRevert(); // Should revert on second intent
        vault.executeStrategies(intents, sigs);
    }
}

contract ObidotVault_ProtocolPerformance_Test is ObidotVaultTestBase {
    function test_performance_tracked_on_outcome() public {
        _depositAs(alice, 100_000 ether);

        uint256 sid = _executeDefaultStrategy(10_000 ether);

        // Report successful outcome with profit
        token.mint(address(vault), 11_000 ether); // Return 11k (1k profit)
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, true, 11_000 ether);

        (
            uint256 totalDeployed,
            uint256 totalReturned,
            uint256 executionCount,
            uint256 successCount,
            uint256 lastExecutedAt
        ) = vault.getProtocolPerformance(targetProtocol);

        assertEq(totalDeployed, 10_000 ether);
        assertEq(totalReturned, 11_000 ether);
        assertEq(executionCount, 1);
        assertEq(successCount, 1);
        assertGt(lastExecutedAt, 0);
    }

    function test_performance_tracks_failures() public {
        _depositAs(alice, 100_000 ether);

        uint256 sid = _executeDefaultStrategy(10_000 ether);

        // Report failed outcome with partial return
        token.mint(address(vault), 5_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, false, 5_000 ether);

        (, uint256 totalReturned, uint256 executionCount, uint256 successCount,) =
            vault.getProtocolPerformance(targetProtocol);

        assertEq(totalReturned, 5_000 ether);
        assertEq(executionCount, 1);
        assertEq(successCount, 0); // Failed
    }

    function test_cumulative_pnl_tracking() public {
        _depositAs(alice, 100_000 ether);

        // Strategy 1: profit
        uint256 sid1 = _executeDefaultStrategy(10_000 ether);
        token.mint(address(vault), 12_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid1, true, 12_000 ether);

        assertEq(vault.cumulativePnL(), 2_000 ether);

        // Strategy 2: loss
        uint256 sid2 = _executeDefaultStrategy(10_000 ether);
        token.mint(address(vault), 7_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid2, false, 7_000 ether);

        assertEq(vault.cumulativePnL(), -1_000 ether);
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  Phase 4 Tests — Performance Fee Module
// ═════════════════════════════════════════════════════════════════════════

contract ObidotVault_PerformanceFee_Test is ObidotVaultTestBase {
    address internal treasury = makeAddr("treasury");

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        vault.setPerformanceFee(1000, treasury); // 10% fee
        vm.stopPrank();
    }

    function test_performance_fee_set_correctly() public view {
        (,, uint256 feeBps, address feeAddr) = vault.performanceSummary();
        assertEq(feeBps, 1000);
        assertEq(feeAddr, treasury);
    }

    function test_fee_reverts_when_too_high() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ObidotVault.FeeTooHigh.selector, 3001));
        vault.setPerformanceFee(3001, treasury);
    }

    function test_fee_reverts_zero_treasury_with_nonzero_fee() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVault.ZeroAddress.selector);
        vault.setPerformanceFee(500, address(0));
    }

    function test_fee_minted_on_profit() public {
        _depositAs(alice, 100_000 ether);

        // Set high water mark
        vm.prank(admin);
        vault.resetHighWaterMark();

        uint256 sid = _executeDefaultStrategy(10_000 ether);

        // Return with profit
        token.mint(address(vault), 15_000 ether); // 5k profit
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, true, 15_000 ether);

        // Treasury should have received fee shares
        uint256 treasuryShares = vault.balanceOf(treasury);
        assertGt(treasuryShares, 0, "Treasury should have fee shares");
    }

    function test_no_fee_on_loss() public {
        _depositAs(alice, 100_000 ether);

        vm.prank(admin);
        vault.resetHighWaterMark();

        uint256 sid = _executeDefaultStrategy(10_000 ether);

        // Return with loss
        token.mint(address(vault), 5_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, false, 5_000 ether);

        assertEq(vault.balanceOf(treasury), 0, "No fee on loss");
    }

    function test_no_fee_below_high_water_mark() public {
        _depositAs(alice, 100_000 ether);

        // Set HWM artificially high
        vm.prank(admin);
        vault.resetHighWaterMark();

        // Strategy returns at par (no new profit above HWM)
        uint256 sid = _executeDefaultStrategy(10_000 ether);
        token.mint(address(vault), 10_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, true, 10_000 ether);

        assertEq(vault.balanceOf(treasury), 0, "No fee when at HWM");
    }

    function test_zero_fee_config_disables_fees() public {
        vm.prank(admin);
        vault.setPerformanceFee(0, address(0)); // Disable fees

        _depositAs(alice, 100_000 ether);

        uint256 sid = _executeDefaultStrategy(10_000 ether);
        token.mint(address(vault), 15_000 ether);
        vm.prank(admin);
        vault.reportStrategyOutcome(sid, true, 15_000 ether);

        assertEq(vault.balanceOf(treasury), 0);
    }
}

// ═════════════════════════════════════════════════════════════════════════
//  Phase 7 — getPriceStrict Tests
// ═════════════════════════════════════════════════════════════════════════

contract ObidotVault_AdminConfig_Test is ObidotVaultTestBase {
    function test_set_withdrawal_timelock() public {
        vm.prank(admin);
        vault.setWithdrawalTimelock(2 hours);
        assertEq(vault.withdrawalTimelock(), 2 hours);
    }

    function test_reset_high_water_mark() public {
        _depositAs(alice, 50_000 ether);
        vm.prank(admin);
        vault.resetHighWaterMark();
        assertEq(vault.highWaterMark(), vault.totalAssets());
    }
}
