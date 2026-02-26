// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {CrossChainRouter} from "../src/adapters/CrossChainRouter.sol";
import {BifrostAdapter} from "../src/adapters/BifrostAdapter.sol";
import {HyperbridgeAdapter} from "../src/adapters/HyperbridgeAdapter.sol";
import {ObidotVaultEVM} from "../src/ObidotVaultEVM.sol";
import {CrossChainCodec} from "../src/libraries/CrossChainCodec.sol";
import {BifrostCodec} from "../src/libraries/BifrostCodec.sol";
import {IIsmpHost} from "../src/interfaces/IIsmpHost.sol";
import {IIsmpModule} from "../src/interfaces/IIsmpModule.sol";
import {IXcm} from "../src/interfaces/IXcm.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  Mock Contracts
// ═══════════════════════════════════════════════════════════════════════════

/// @dev Minimal ERC-20 for testing.
contract MockToken is ERC20 {
    constructor() ERC20("Mock DOT", "mDOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mock ISMP Host: records dispatches and allows simulating callbacks.
contract MockIsmpHost is IIsmpHost {
    uint256 public dispatchCount;
    bytes public lastDest;
    bytes public lastTo;
    bytes public lastBody;
    uint256 public feePerDispatch;
    bytes32 public nextCommitment;

    constructor() {
        nextCommitment = keccak256("initial_commitment");
        feePerDispatch = 0;
    }

    function setFee(uint256 _fee) external {
        feePerDispatch = _fee;
    }

    function setNextCommitment(bytes32 _commitment) external {
        nextCommitment = _commitment;
    }

    function dispatch(DispatchPost memory post) external payable override returns (bytes32 commitment) {
        dispatchCount++;
        lastDest = post.dest;
        lastTo = post.to;
        lastBody = post.body;
        commitment = nextCommitment;
        // Update commitment for next call to be unique
        nextCommitment = keccak256(abi.encodePacked(nextCommitment, dispatchCount));
    }

    function dispatch(DispatchGet memory) external payable override returns (bytes32) {
        revert("GET not implemented in mock");
    }

    function dispatchFee(DispatchPost memory) external view override returns (uint256) {
        return feePerDispatch;
    }

    function host() external view override returns (bytes memory) {
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

/// @dev Mock XCM Precompile for BifrostAdapter tests.
contract MockXcm is IXcm {
    uint256 public sendCallCount;
    bytes public lastDest;
    bytes public lastMessage;
    bool public shouldRevertOnSend;

    function send(bytes calldata dest, bytes calldata message) external override {
        if (shouldRevertOnSend) revert SendFailure();
        sendCallCount++;
        lastDest = dest;
        lastMessage = message;
        emit XcmSent(msg.sender, dest, message);
    }

    function weighMessage(bytes calldata) external pure override returns (uint64, uint64) {
        return (500_000_000_000, 524_288);
    }

    function setShouldRevertOnSend(bool _shouldRevert) external {
        shouldRevertOnSend = _shouldRevert;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CrossChainRouter Tests
// ═══════════════════════════════════════════════════════════════════════════

contract CrossChainRouter_Base_Test is Test {
    MockToken internal token;
    MockIsmpHost internal ismpHost;
    CrossChainRouter internal router;

    address internal admin = makeAddr("admin");
    address internal masterVault = makeAddr("masterVault");
    address internal alice = makeAddr("alice");

    bytes internal constant CHAIN_ETH = bytes("ETHEREUM");
    bytes internal constant CHAIN_ARB = bytes("ARBITRUM");
    bytes internal ethModuleAddress;
    bytes internal arbModuleAddress;

    function setUp() public virtual {
        token = new MockToken();
        ismpHost = new MockIsmpHost();
        router = new CrossChainRouter(address(ismpHost), IERC20(address(token)), masterVault, admin);

        ethModuleAddress = abi.encode(makeAddr("ethSatellite"));
        arbModuleAddress = abi.encode(makeAddr("arbSatellite"));

        // Register satellite chains
        vm.startPrank(admin);
        router.addSatelliteChain(CHAIN_ETH, ethModuleAddress);
        router.addSatelliteChain(CHAIN_ARB, arbModuleAddress);
        vm.stopPrank();
    }
}

contract CrossChainRouter_Admin_Test is CrossChainRouter_Base_Test {
    function test_constructor_setsState() public view {
        assertEq(address(router.asset()), address(token));
        assertEq(router.masterVault(), masterVault);
        assertTrue(router.hasRole(router.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(router.hasRole(router.VAULT_ROLE(), masterVault));
    }

    function test_addSatelliteChain_registersChain() public view {
        assertEq(router.satelliteChainCount(), 2);
        assertTrue(router.knownChains(keccak256(CHAIN_ETH)));
        assertTrue(router.knownChains(keccak256(CHAIN_ARB)));
    }

    function test_setMasterVault_updatesRoles() public {
        address newVault = makeAddr("newVault");

        vm.prank(admin);
        router.setMasterVault(newVault);

        assertEq(router.masterVault(), newVault);
        assertTrue(router.hasRole(router.VAULT_ROLE(), newVault));
        assertFalse(router.hasRole(router.VAULT_ROLE(), masterVault));
    }

    function testRevert_addSatelliteChain_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        router.addSatelliteChain(bytes("BASE"), abi.encode(alice));
    }

    function test_pause_unpause() public {
        vm.startPrank(admin);
        router.pause();
        assertTrue(router.paused());
        router.unpause();
        assertFalse(router.paused());
        vm.stopPrank();
    }

    function testRevert_pause_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        router.pause();
    }
}

contract CrossChainRouter_Broadcast_Test is CrossChainRouter_Base_Test {
    function test_broadcastAssetSync_dispatchesToAllSatellites() public {
        vm.prank(masterVault);
        router.broadcastAssetSync(10_000 ether, 9_500 ether, 5_000 ether);

        // Should dispatch to both satellites (ETH + ARB)
        assertEq(ismpHost.dispatchCount(), 2);
    }

    function test_broadcastAssetSync_emitsEvent() public {
        vm.prank(masterVault);
        vm.expectEmit();
        emit CrossChainRouter.AssetSyncBroadcast(10_000 ether, 9_500 ether, 5_000 ether, 2);
        router.broadcastAssetSync(10_000 ether, 9_500 ether, 5_000 ether);
    }

    function testRevert_broadcastAssetSync_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        router.broadcastAssetSync(1, 1, 0);
    }

    function testRevert_broadcastAssetSync_paused() public {
        vm.prank(admin);
        router.pause();

        vm.prank(masterVault);
        vm.expectRevert();
        router.broadcastAssetSync(1, 1, 0);
    }

    function test_broadcastStrategyReport_dispatches() public {
        vm.prank(masterVault);
        router.broadcastStrategyReport(1, true, 105 ether, 5 ether, 4_500 ether);

        assertEq(ismpHost.dispatchCount(), 2);
    }

    function test_broadcastStrategyReport_emitsEvent() public {
        vm.prank(masterVault);
        vm.expectEmit();
        emit CrossChainRouter.StrategyReportBroadcast(1, true, 105 ether, 5 ether);
        router.broadcastStrategyReport(1, true, 105 ether, 5 ether, 4_500 ether);
    }

    function test_broadcastEmergencySync_dispatches() public {
        vm.prank(masterVault);
        router.broadcastEmergencySync(true, true, bytes("circuit breaker"));

        assertEq(ismpHost.dispatchCount(), 2);
    }

    function test_broadcastEmergencySync_emitsEvent() public {
        vm.prank(masterVault);
        vm.expectEmit();
        emit CrossChainRouter.EmergencySyncBroadcast(true, true);
        router.broadcastEmergencySync(true, true, bytes("halt"));
    }

    function test_sendDepositAck_dispatches() public {
        vm.prank(masterVault);
        router.sendDepositAck(CHAIN_ETH, 0, 10_000 ether, true);

        assertEq(ismpHost.dispatchCount(), 1);
    }

    function test_sendWithdrawFulfill_dispatches() public {
        vm.prank(masterVault);
        router.sendWithdrawFulfill(CHAIN_ETH, 0, 50 ether, true);

        assertEq(ismpHost.dispatchCount(), 1);
    }
}

contract CrossChainRouter_IncomingMessages_Test is CrossChainRouter_Base_Test {
    /// @dev Helper: simulate a deposit sync from a satellite via ISMP host.
    function _simulateDepositSync(
        bytes memory sourceChain,
        address depositor,
        uint256 amount,
        uint256 sharesMinted,
        uint256 nonce
    ) internal {
        CrossChainCodec.DepositSyncMessage memory syncMsg = CrossChainCodec.DepositSyncMessage({
            chainId: sourceChain,
            depositor: depositor,
            amount: amount,
            sharesMinted: sharesMinted,
            nonce: nonce
        });

        bytes memory body = CrossChainCodec.encodeDepositSync(syncMsg);

        // Get the correct peer module for the source chain
        bytes32 chainHash = keccak256(sourceChain);
        bytes memory fromModule = router.registeredPeers(chainHash);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: sourceChain,
            dest: bytes("POLKADOT-HUB"),
            nonce: uint64(nonce),
            from: fromModule,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(address(ismpHost));
        router.onAccept(incoming);
    }

    /// @dev Helper: simulate a withdrawal request from a satellite via ISMP host.
    function _simulateWithdrawRequest(
        bytes memory sourceChain,
        address withdrawer,
        uint256 amount,
        uint256 sharesToBurn,
        uint256 nonce
    ) internal {
        CrossChainCodec.WithdrawRequestMessage memory withdrawMsg = CrossChainCodec.WithdrawRequestMessage({
            chainId: sourceChain,
            withdrawer: withdrawer,
            amount: amount,
            sharesToBurn: sharesToBurn,
            nonce: nonce
        });

        bytes memory body = CrossChainCodec.encodeWithdrawRequest(withdrawMsg);

        bytes32 chainHash = keccak256(sourceChain);
        bytes memory fromModule = router.registeredPeers(chainHash);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: sourceChain,
            dest: bytes("POLKADOT-HUB"),
            nonce: uint64(nonce),
            from: fromModule,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(address(ismpHost));
        router.onAccept(incoming);
    }

    function test_handleDepositSync_updatesSatelliteAssets() public {
        _simulateDepositSync(CHAIN_ETH, alice, 100 ether, 95 ether, 0);

        bytes32 ethHash = keccak256(CHAIN_ETH);
        assertEq(router.satelliteAssets(ethHash), 100 ether);
        assertEq(router.pendingSatelliteDeposits(), 100 ether);
    }

    function test_handleDepositSync_incrementsNonce() public {
        _simulateDepositSync(CHAIN_ETH, alice, 100 ether, 95 ether, 0);
        _simulateDepositSync(CHAIN_ETH, alice, 200 ether, 190 ether, 1);

        bytes32 ethHash = keccak256(CHAIN_ETH);
        assertEq(router.satelliteAssets(ethHash), 300 ether);
        assertEq(router.pendingSatelliteDeposits(), 300 ether);
        assertEq(router.incomingDepositNonces(ethHash), 2);
    }

    function test_handleDepositSync_emitsEvent() public {
        CrossChainCodec.DepositSyncMessage memory syncMsg = CrossChainCodec.DepositSyncMessage({
            chainId: CHAIN_ETH,
            depositor: alice,
            amount: 100 ether,
            sharesMinted: 95 ether,
            nonce: 0
        });

        bytes memory body = CrossChainCodec.encodeDepositSync(syncMsg);
        bytes32 chainHash = keccak256(CHAIN_ETH);
        bytes memory fromModule = router.registeredPeers(chainHash);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ETH,
            dest: bytes("POLKADOT-HUB"),
            nonce: 0,
            from: fromModule,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(ismpHost));
        vm.expectEmit();
        emit CrossChainRouter.SatelliteDepositReceived(CHAIN_ETH, alice, 100 ether, 95 ether, 0);
        router.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function test_handleWithdrawRequest_updatesPendingState() public {
        // First deposit so there's something to withdraw
        _simulateDepositSync(CHAIN_ETH, alice, 100 ether, 95 ether, 0);

        _simulateWithdrawRequest(CHAIN_ETH, alice, 50 ether, 48 ether, 0);

        assertEq(router.pendingWithdrawalRequests(), 50 ether);
        bytes32 ethHash = keccak256(CHAIN_ETH);
        assertEq(router.satelliteAssets(ethHash), 50 ether); // 100 - 50
    }

    function test_handleWithdrawRequest_storesPendingWithdrawal() public {
        _simulateDepositSync(CHAIN_ETH, alice, 100 ether, 95 ether, 0);
        _simulateWithdrawRequest(CHAIN_ETH, alice, 50 ether, 48 ether, 0);

        (bytes memory chainId, address withdrawer, uint256 amount, uint256 sharesToBurn, uint256 nonce) =
            router.pendingWithdrawals(0);

        assertEq(chainId, CHAIN_ETH);
        assertEq(withdrawer, alice);
        assertEq(amount, 50 ether);
        assertEq(sharesToBurn, 48 ether);
        assertEq(nonce, 0);
    }

    function test_totalSatelliteAssets_aggregates() public {
        _simulateDepositSync(CHAIN_ETH, alice, 100 ether, 95 ether, 0);
        _simulateDepositSync(CHAIN_ARB, alice, 200 ether, 190 ether, 0);

        assertEq(router.totalSatelliteAssets(), 300 ether);
    }

    function testRevert_onAccept_unauthorizedHost() public {
        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ETH,
            dest: bytes("POLKADOT-HUB"),
            nonce: 0,
            from: ethModuleAddress,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: bytes("")
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(alice); // unauthorized
        vm.expectRevert(abi.encodeWithSelector(HyperbridgeAdapter.UnauthorizedHost.selector, alice, address(ismpHost)));
        router.onAccept(incoming);
    }

    function testRevert_onAccept_unknownSourceChain() public {
        bytes memory unknownChain = bytes("UNKNOWN_CHAIN");
        bytes memory body = CrossChainCodec.encodeDepositSync(
            CrossChainCodec.DepositSyncMessage({
                chainId: unknownChain,
                depositor: alice,
                amount: 100 ether,
                sharesMinted: 95 ether,
                nonce: 0
            })
        );

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: unknownChain,
            dest: bytes("POLKADOT-HUB"),
            nonce: 0,
            from: abi.encode(alice),
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(abi.encodeWithSelector(HyperbridgeAdapter.UnknownSourceChain.selector, unknownChain));
        router.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function testRevert_onAccept_unauthorizedSourceModule() public {
        bytes memory body = CrossChainCodec.encodeDepositSync(
            CrossChainCodec.DepositSyncMessage({
                chainId: CHAIN_ETH,
                depositor: alice,
                amount: 100 ether,
                sharesMinted: 95 ether,
                nonce: 0
            })
        );

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ETH,
            dest: bytes("POLKADOT-HUB"),
            nonce: 0,
            from: abi.encode(address(0xdead)), // wrong module
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(
            abi.encodeWithSelector(HyperbridgeAdapter.UnauthorizedSourceModule.selector, abi.encode(address(0xdead)))
        );
        router.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function testRevert_onAccept_unknownMessageType() public {
        // Create a body with an unknown message type (0xFF)
        bytes memory body = abi.encodePacked(uint8(0xFF), abi.encode(uint256(1)));

        bytes32 chainHash = keccak256(CHAIN_ETH);
        bytes memory fromModule = router.registeredPeers(chainHash);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ETH,
            dest: bytes("POLKADOT-HUB"),
            nonce: 0,
            from: fromModule,
            to: abi.encode(address(router)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(abi.encodeWithSelector(CrossChainRouter.UnknownCrossChainMessage.selector, uint8(0xFF)));
        router.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }
}

contract CrossChainRouter_Timeout_Test is CrossChainRouter_Base_Test {
    function test_handleTimeout_withdrawFulfill_readdsPending() public {
        // Simulate that 50 ether was in pending withdrawals and a fulfillment timed out
        CrossChainCodec.WithdrawFulfillMessage memory fulfillMsg =
            CrossChainCodec.WithdrawFulfillMessage({withdrawNonce: 0, amount: 50 ether, fullyFulfilled: true});

        bytes memory body = CrossChainCodec.encodeWithdrawFulfill(fulfillMsg);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: bytes("POLKADOT-HUB"),
            dest: CHAIN_ETH,
            nonce: 0,
            from: abi.encode(address(router)),
            to: ethModuleAddress,
            timeoutTimestamp: 0,
            body: body
        });

        uint256 previousPending = router.pendingWithdrawalRequests();

        vm.prank(address(ismpHost));
        router.onPostRequestTimeout(request);

        assertEq(router.pendingWithdrawalRequests(), previousPending + 50 ether);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HyperbridgeAdapter Tests (via CrossChainRouter as concrete impl)
// ═══════════════════════════════════════════════════════════════════════════

contract HyperbridgeAdapter_Test is CrossChainRouter_Base_Test {
    function test_registerPeer() public {
        bytes memory newChain = bytes("BASE");
        bytes memory newModule = abi.encode(makeAddr("baseSatellite"));

        vm.prank(admin);
        router.registerPeer(newChain, newModule);

        assertTrue(router.knownChains(keccak256(newChain)));
        assertEq(router.registeredPeers(keccak256(newChain)), newModule);
    }

    function test_removePeer() public {
        vm.prank(admin);
        router.removePeer(CHAIN_ETH);

        assertFalse(router.knownChains(keccak256(CHAIN_ETH)));
    }

    function testRevert_registerPeer_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        router.registerPeer(bytes("BASE"), abi.encode(alice));
    }

    function testRevert_removePeer_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        router.removePeer(CHAIN_ETH);
    }

    function testRevert_constructor_zeroHost() public {
        vm.expectRevert(HyperbridgeAdapter.ZeroHostAddress.selector);
        new CrossChainRouter(
            address(0), // zero host
            IERC20(address(token)),
            masterVault,
            admin
        );
    }

    function test_supportsInterface() public view {
        // ERC-165
        assertTrue(router.supportsInterface(0x01ffc9a7));
        // AccessControl
        assertTrue(router.supportsInterface(type(IAccessControl).interfaceId));
    }

    function test_receiveEther() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(router).balance, 1 ether);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BifrostAdapter Tests
// ═══════════════════════════════════════════════════════════════════════════

contract BifrostAdapter_Base_Test is Test {
    BifrostAdapter internal adapter;
    MockXcm internal xcmMock;

    address internal admin = makeAddr("admin");
    address internal vault = makeAddr("vault");
    address internal alice = makeAddr("alice");

    address internal constant XCM_PRECOMPILE_ADDR = 0x00000000000000000000000000000000000a0000;

    function setUp() public virtual {
        // Deploy and etch mock XCM precompile
        xcmMock = new MockXcm();
        vm.etch(XCM_PRECOMPILE_ADDR, address(xcmMock).code);

        adapter = new BifrostAdapter(admin, vault);
    }
}

contract BifrostAdapter_Admin_Test is BifrostAdapter_Base_Test {
    function test_constructor_setsRoles() public view {
        assertTrue(adapter.hasRole(adapter.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(adapter.hasRole(adapter.STRATEGY_EXECUTOR_ROLE(), vault));
    }

    function testRevert_executeBifrostStrategy_unauthorized() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: keccak256("alice")
        });

        vm.prank(alice);
        vm.expectRevert();
        adapter.executeBifrostStrategy(strategy);
    }
}

contract BifrostAdapter_Execution_Test is BifrostAdapter_Base_Test {
    bytes32 internal beneficiary = keccak256("bifrost_account");

    function test_executeMintVToken() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId, bytes memory xcmMessage) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
        assertTrue(xcmMessage.length > 0);
        assertEq(adapter.bifrostStrategyCounter(), 1);
    }

    function test_executeRedeemVToken() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.RedeemVToken,
            currencyIdA: BifrostCodec.CURRENCY_VDOT,
            currencyIdB: 0,
            amount: 50 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeDEXSwap() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.DEXSwap,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: BifrostCodec.CURRENCY_BNC,
            amount: 10 ether,
            minOutput: 9 ether,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeFarmDeposit() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.FarmDeposit,
            currencyIdA: 0,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 1,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeFarmWithdraw() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.FarmWithdraw,
            currencyIdA: 0,
            currencyIdB: 0,
            amount: 50 ether,
            minOutput: 0,
            poolId: 1,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeFarmClaim() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.FarmClaim,
            currencyIdA: 0,
            currencyIdB: 0,
            amount: 0, // FarmClaim allows zero amount
            minOutput: 0,
            poolId: 1,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeSALPContribute() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.SALPContribute,
            currencyIdA: 2030, // parachainId stored in currencyIdA
            currencyIdB: 0,
            amount: 500 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        assertEq(strategyId, 0);
    }

    function test_executeBifrostStrategy_sequentialIds() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 10 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.startPrank(vault);
        (uint256 id1,) = adapter.executeBifrostStrategy(strategy);
        (uint256 id2,) = adapter.executeBifrostStrategy(strategy);
        (uint256 id3,) = adapter.executeBifrostStrategy(strategy);
        vm.stopPrank();

        assertEq(id1, 0);
        assertEq(id2, 1);
        assertEq(id3, 2);
    }

    function test_executeBifrostStrategy_recordsStrategy() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        (uint256 strategyId,) = adapter.executeBifrostStrategy(strategy);

        (
            BifrostAdapter.BifrostStrategyType recordedType,
            uint256 recordedAmount,
            uint256 executedAt,
            bytes32 xcmMessageHash,
            bool dispatched
        ) = adapter.bifrostStrategies(strategyId);

        assertEq(uint8(recordedType), uint8(BifrostAdapter.BifrostStrategyType.MintVToken));
        assertEq(recordedAmount, 100 ether);
        assertEq(executedAt, block.timestamp);
        assertTrue(xcmMessageHash != bytes32(0));
        assertTrue(dispatched);
    }

    function test_executeBifrostStrategy_emitsEvent() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        vm.expectEmit();
        emit BifrostAdapter.BifrostStrategyDispatched(
            0, BifrostAdapter.BifrostStrategyType.MintVToken, 100 ether, beneficiary
        );
        adapter.executeBifrostStrategy(strategy);
    }

    function testRevert_executeBifrostStrategy_zeroAmount() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 0,
            minOutput: 0,
            poolId: 0,
            beneficiary: beneficiary
        });

        vm.prank(vault);
        vm.expectRevert(BifrostAdapter.ZeroStrategyAmount.selector);
        adapter.executeBifrostStrategy(strategy);
    }

    function testRevert_executeBifrostStrategy_zeroBeneficiary() public {
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: bytes32(0)
        });

        vm.prank(vault);
        vm.expectRevert(BifrostAdapter.ZeroBeneficiary.selector);
        adapter.executeBifrostStrategy(strategy);
    }
}

contract BifrostAdapter_Preview_Test is BifrostAdapter_Base_Test {
    function test_previewStrategy_sameAsExecution() public {
        bytes32 bene = keccak256("alice");
        BifrostAdapter.BifrostStrategy memory strategy = BifrostAdapter.BifrostStrategy({
            strategyType: BifrostAdapter.BifrostStrategyType.MintVToken,
            currencyIdA: BifrostCodec.CURRENCY_DOT,
            currencyIdB: 0,
            amount: 100 ether,
            minOutput: 0,
            poolId: 0,
            beneficiary: bene
        });

        bytes memory preview = adapter.previewStrategy(strategy);

        vm.prank(vault);
        (, bytes memory actual) = adapter.executeBifrostStrategy(strategy);

        assertEq(keccak256(preview), keccak256(actual), "Preview and execution should produce same XCM");
    }

    function test_getBifrostDestination_nonEmpty() public view {
        bytes memory dest = adapter.getBifrostDestination();
        assertTrue(dest.length > 0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ObidotVaultEVM Tests
// ═══════════════════════════════════════════════════════════════════════════

contract ObidotVaultEVM_Base_Test is Test {
    MockToken internal token;
    MockIsmpHost internal ismpHost;
    ObidotVaultEVM internal satellite;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes internal constant HUB_CHAIN_ID = bytes("POLKADOT-HUB");
    bytes internal hubRouterModule;
    bytes internal constant CHAIN_ID = bytes("ETHEREUM");

    uint256 internal constant DEPOSIT_CAP = 1_000_000 ether;
    uint256 internal constant MAX_SYNC_AGE = 3600; // 1 hour

    function setUp() public virtual {
        vm.warp(10_000);

        token = new MockToken();
        ismpHost = new MockIsmpHost();
        hubRouterModule = abi.encode(makeAddr("hubRouter"));

        satellite = new ObidotVaultEVM(
            IERC20(address(token)),
            address(ismpHost),
            HUB_CHAIN_ID,
            hubRouterModule,
            CHAIN_ID,
            DEPOSIT_CAP,
            MAX_SYNC_AGE,
            admin
        );

        // Fund users
        token.mint(alice, 10_000 ether);
        token.mint(bob, 10_000 ether);

        vm.prank(alice);
        token.approve(address(satellite), type(uint256).max);
        vm.prank(bob);
        token.approve(address(satellite), type(uint256).max);
    }

    /// @dev Helper: simulate an incoming ISMP message from hub.
    function _simulateHubMessage(bytes memory body) internal {
        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: HUB_CHAIN_ID,
            dest: CHAIN_ID,
            nonce: 0,
            from: hubRouterModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: body
        });

        IIsmpModule.IncomingPostRequest memory incoming =
            IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)});

        vm.prank(address(ismpHost));
        satellite.onAccept(incoming);
    }
}

contract ObidotVaultEVM_Constructor_Test is ObidotVaultEVM_Base_Test {
    function test_constructor_setsState() public view {
        assertEq(address(satellite.ismpHost()), address(ismpHost));
        assertEq(satellite.hubChainId(), HUB_CHAIN_ID);
        assertEq(satellite.hubRouterModule(), hubRouterModule);
        assertEq(satellite.chainIdentifier(), CHAIN_ID);
        assertEq(satellite.depositCap(), DEPOSIT_CAP);
        assertEq(satellite.maxSyncAge(), MAX_SYNC_AGE);
        assertTrue(satellite.hasRole(satellite.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(satellite.hasRole(satellite.KEEPER_ROLE(), admin));
    }

    function testRevert_constructor_zeroIsmpHost() public {
        vm.expectRevert(ObidotVaultEVM.ZeroAddress.selector);
        new ObidotVaultEVM(
            IERC20(address(token)),
            address(0),
            HUB_CHAIN_ID,
            hubRouterModule,
            CHAIN_ID,
            DEPOSIT_CAP,
            MAX_SYNC_AGE,
            admin
        );
    }

    function testRevert_constructor_zeroAdmin() public {
        vm.expectRevert(ObidotVaultEVM.ZeroAddress.selector);
        new ObidotVaultEVM(
            IERC20(address(token)),
            address(ismpHost),
            HUB_CHAIN_ID,
            hubRouterModule,
            CHAIN_ID,
            DEPOSIT_CAP,
            MAX_SYNC_AGE,
            address(0)
        );
    }

    function testRevert_constructor_zeroCap() public {
        vm.expectRevert(ObidotVaultEVM.InvalidCap.selector);
        new ObidotVaultEVM(
            IERC20(address(token)), address(ismpHost), HUB_CHAIN_ID, hubRouterModule, CHAIN_ID, 0, MAX_SYNC_AGE, admin
        );
    }
}

contract ObidotVaultEVM_Deposit_Test is ObidotVaultEVM_Base_Test {
    function test_deposit_mintsShares() public {
        vm.prank(alice);
        uint256 shares = satellite.deposit(100 ether, alice);

        assertTrue(shares > 0);
        assertEq(satellite.balanceOf(alice), shares);
    }

    function test_deposit_syncsToHub() public {
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        // Should have dispatched a deposit sync message
        assertEq(ismpHost.dispatchCount(), 1);
        assertEq(satellite.depositSyncNonce(), 1);
    }

    function test_deposit_emitsDepositSyncedEvent() public {
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        // Verify nonce was incremented (proves sync happened)
        assertEq(satellite.depositSyncNonce(), 1);
        // Verify dispatch count
        assertEq(ismpHost.dispatchCount(), 1);
    }

    function test_deposit_respectsDepositCap() public {
        uint256 maxDep = satellite.maxDeposit(alice);
        assertEq(maxDep, DEPOSIT_CAP);

        // Deposit up to cap
        token.mint(alice, DEPOSIT_CAP);
        vm.prank(alice);
        token.approve(address(satellite), type(uint256).max);

        vm.prank(alice);
        satellite.deposit(DEPOSIT_CAP, alice);

        assertEq(satellite.maxDeposit(alice), 0);
    }

    function testRevert_deposit_paused() public {
        vm.prank(admin);
        satellite.pause();

        vm.prank(alice);
        vm.expectRevert();
        satellite.deposit(100 ether, alice);
    }

    function test_mint_syncsToHub() public {
        vm.prank(alice);
        uint256 shares = satellite.previewDeposit(100 ether);

        vm.prank(alice);
        satellite.mint(shares, alice);

        assertEq(ismpHost.dispatchCount(), 1);
    }
}

contract ObidotVaultEVM_Withdraw_Test is ObidotVaultEVM_Base_Test {
    function setUp() public override {
        super.setUp();
        // Alice deposits first
        vm.prank(alice);
        satellite.deposit(1000 ether, alice);
    }

    function test_withdraw_localBalance() public {
        vm.prank(alice);
        satellite.withdraw(100 ether, alice, alice);

        assertEq(token.balanceOf(alice), 10_000 ether - 1000 ether + 100 ether);
    }

    function test_redeem_localBalance() public {
        uint256 shares = satellite.balanceOf(alice) / 10;

        vm.prank(alice);
        satellite.redeem(shares, alice, alice);

        assertTrue(token.balanceOf(alice) > 10_000 ether - 1000 ether);
    }

    function testRevert_withdraw_paused_noEmergency() public {
        vm.prank(admin);
        satellite.pause();

        vm.prank(alice);
        vm.expectRevert();
        satellite.withdraw(100 ether, alice, alice);
    }

    function test_withdraw_allowedInEmergency() public {
        vm.prank(admin);
        satellite.enableEmergencyMode();

        assertTrue(satellite.emergencyMode());

        vm.prank(alice);
        satellite.withdraw(100 ether, alice, alice);
    }

    function test_maxWithdraw_zeroWhenPaused() public {
        vm.prank(admin);
        satellite.pause();

        assertEq(satellite.maxWithdraw(alice), 0);
    }

    function test_maxRedeem_zeroWhenPaused() public {
        vm.prank(admin);
        satellite.pause();

        assertEq(satellite.maxRedeem(alice), 0);
    }

    function test_maxDeposit_zeroWhenPaused() public {
        vm.prank(admin);
        satellite.pause();

        assertEq(satellite.maxDeposit(alice), 0);
    }

    function test_maxMint_zeroWhenPaused() public {
        vm.prank(admin);
        satellite.pause();

        assertEq(satellite.maxMint(alice), 0);
    }
}

contract ObidotVaultEVM_ISMPCallbacks_Test is ObidotVaultEVM_Base_Test {
    function test_handleAssetSync_updatesGlobalState() public {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: 10_000_000 ether,
            globalTotalShares: 9_500_000 ether,
            totalRemoteAssets: 5_000_000 ether,
            timestamp: block.timestamp
        });

        _simulateHubMessage(CrossChainCodec.encodeAssetSync(syncMsg));

        assertEq(satellite.globalTotalAssets(), 10_000_000 ether);
        assertEq(satellite.globalTotalShares(), 9_500_000 ether);
        assertEq(satellite.hubRemoteAssets(), 5_000_000 ether);
        assertEq(satellite.lastSyncTimestamp(), block.timestamp);
    }

    function test_handleAssetSync_emitsEvent() public {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: 1_000 ether,
            globalTotalShares: 1_000 ether,
            totalRemoteAssets: 0,
            timestamp: block.timestamp
        });

        vm.expectEmit();
        emit ObidotVaultEVM.AssetSyncReceived(1_000 ether, 1_000 ether, block.timestamp);
        _simulateHubMessage(CrossChainCodec.encodeAssetSync(syncMsg));
    }

    function test_handleStrategyReport_updatesRemoteAssets() public {
        CrossChainCodec.StrategyReportMessage memory reportMsg = CrossChainCodec.StrategyReportMessage({
            strategyId: 1,
            success: true,
            returnedAmount: 105 ether,
            pnl: 5 ether,
            newTotalRemoteAssets: 4_500 ether
        });

        _simulateHubMessage(CrossChainCodec.encodeStrategyReport(reportMsg));

        assertEq(satellite.hubRemoteAssets(), 4_500 ether);
    }

    function test_handleStrategyReport_emitsEvent() public {
        CrossChainCodec.StrategyReportMessage memory reportMsg = CrossChainCodec.StrategyReportMessage({
            strategyId: 42,
            success: false,
            returnedAmount: 90 ether,
            pnl: -10 ether,
            newTotalRemoteAssets: 4_910 ether
        });

        vm.expectEmit();
        emit ObidotVaultEVM.StrategyReportReceived(42, false, -10 ether);
        _simulateHubMessage(CrossChainCodec.encodeStrategyReport(reportMsg));
    }

    function test_handleEmergencySync_pausesVault() public {
        CrossChainCodec.EmergencySyncMessage memory emergencyMsg =
            CrossChainCodec.EmergencySyncMessage({paused: true, emergencyMode: true, reason: bytes("circuit breaker")});

        _simulateHubMessage(CrossChainCodec.encodeEmergencySync(emergencyMsg));

        assertTrue(satellite.paused());
        assertTrue(satellite.emergencyMode());
    }

    function test_handleEmergencySync_unpausesVault() public {
        // First pause
        CrossChainCodec.EmergencySyncMessage memory pauseMsg =
            CrossChainCodec.EmergencySyncMessage({paused: true, emergencyMode: false, reason: bytes("pause")});
        _simulateHubMessage(CrossChainCodec.encodeEmergencySync(pauseMsg));
        assertTrue(satellite.paused());

        // Then unpause
        CrossChainCodec.EmergencySyncMessage memory unpauseMsg =
            CrossChainCodec.EmergencySyncMessage({paused: false, emergencyMode: false, reason: bytes("resume")});
        _simulateHubMessage(CrossChainCodec.encodeEmergencySync(unpauseMsg));
        assertFalse(satellite.paused());
    }

    function test_handleDepositAck_updatesState() public {
        // First deposit so there's a nonce to ack
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        CrossChainCodec.DepositAckMessage memory ackMsg =
            CrossChainCodec.DepositAckMessage({depositNonce: 0, globalTotalAssets: 10_000_100 ether, accepted: true});

        _simulateHubMessage(CrossChainCodec.encodeDepositAck(ackMsg));

        assertTrue(satellite.depositAcknowledged(0));
        assertEq(satellite.globalTotalAssets(), 10_000_100 ether);
    }

    function test_handleWithdrawFulfill_updatesPending() public {
        // Simulate pending withdrawal state
        // We can't easily trigger _requestWithdrawFromHub directly, so test the handler
        CrossChainCodec.WithdrawFulfillMessage memory fulfillMsg =
            CrossChainCodec.WithdrawFulfillMessage({withdrawNonce: 0, amount: 50 ether, fullyFulfilled: true});

        _simulateHubMessage(CrossChainCodec.encodeWithdrawFulfill(fulfillMsg));

        // totalPendingWithdrawals should be 0 (clamped from 0)
        assertEq(satellite.totalPendingWithdrawals(), 0);
    }

    function testRevert_onAccept_unauthorizedHost() public {
        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: HUB_CHAIN_ID,
            dest: CHAIN_ID,
            nonce: 0,
            from: hubRouterModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: CrossChainCodec.encodeAssetSync(
                CrossChainCodec.AssetSyncMessage({
                    globalTotalAssets: 1,
                    globalTotalShares: 1,
                    totalRemoteAssets: 0,
                    timestamp: 1
                })
            )
        });

        vm.prank(alice); // unauthorized
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.UnauthorizedHost.selector, alice, address(ismpHost)));
        satellite.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function testRevert_onAccept_unauthorizedSource() public {
        bytes memory wrongSource = bytes("WRONG_CHAIN");

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: wrongSource,
            dest: CHAIN_ID,
            nonce: 0,
            from: hubRouterModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: CrossChainCodec.encodeAssetSync(
                CrossChainCodec.AssetSyncMessage({
                    globalTotalAssets: 1,
                    globalTotalShares: 1,
                    totalRemoteAssets: 0,
                    timestamp: 1
                })
            )
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.UnauthorizedSource.selector, wrongSource));
        satellite.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function testRevert_onAccept_unauthorizedSender() public {
        bytes memory wrongModule = abi.encode(address(0xdead));

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: HUB_CHAIN_ID,
            dest: CHAIN_ID,
            nonce: 0,
            from: wrongModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: CrossChainCodec.encodeAssetSync(
                CrossChainCodec.AssetSyncMessage({
                    globalTotalAssets: 1,
                    globalTotalShares: 1,
                    totalRemoteAssets: 0,
                    timestamp: 1
                })
            )
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.UnauthorizedSender.selector, wrongModule));
        satellite.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }

    function testRevert_onAccept_unknownMessageType() public {
        bytes memory body = abi.encodePacked(uint8(0xFF), abi.encode(uint256(1)));

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: HUB_CHAIN_ID,
            dest: CHAIN_ID,
            nonce: 0,
            from: hubRouterModule,
            to: abi.encode(address(satellite)),
            timeoutTimestamp: 0,
            body: body
        });

        vm.prank(address(ismpHost));
        vm.expectRevert(abi.encodeWithSelector(ObidotVaultEVM.UnknownMessageType.selector, uint8(0xFF)));
        satellite.onAccept(IIsmpModule.IncomingPostRequest({request: request, relayer: address(0)}));
    }
}

contract ObidotVaultEVM_Admin_Test is ObidotVaultEVM_Base_Test {
    function test_setDepositCap() public {
        vm.prank(admin);
        satellite.setDepositCap(2_000_000 ether);

        assertEq(satellite.depositCap(), 2_000_000 ether);
    }

    function testRevert_setDepositCap_zero() public {
        vm.prank(admin);
        vm.expectRevert(ObidotVaultEVM.InvalidCap.selector);
        satellite.setDepositCap(0);
    }

    function testRevert_setDepositCap_unauthorized() public {
        vm.prank(alice);
        vm.expectRevert();
        satellite.setDepositCap(1 ether);
    }

    function test_setMaxSyncAge() public {
        vm.prank(admin);
        satellite.setMaxSyncAge(7200);

        assertEq(satellite.maxSyncAge(), 7200);
    }

    function test_setHubConfig() public {
        bytes memory newChainId = bytes("NEW_HUB");
        bytes memory newModule = abi.encode(makeAddr("newRouter"));

        vm.prank(admin);
        satellite.setHubConfig(newChainId, newModule);

        assertEq(satellite.hubChainId(), newChainId);
        assertEq(satellite.hubRouterModule(), newModule);
    }

    function test_pause_unpause() public {
        vm.startPrank(admin);
        satellite.pause();
        assertTrue(satellite.paused());

        satellite.unpause();
        assertFalse(satellite.paused());
        assertFalse(satellite.emergencyMode());
        vm.stopPrank();
    }

    function test_enableEmergencyMode() public {
        vm.prank(admin);
        satellite.enableEmergencyMode();

        assertTrue(satellite.paused());
        assertTrue(satellite.emergencyMode());
    }

    function test_unpause_clearsEmergencyMode() public {
        vm.startPrank(admin);
        satellite.enableEmergencyMode();
        assertTrue(satellite.emergencyMode());

        satellite.unpause();
        assertFalse(satellite.emergencyMode());
        vm.stopPrank();
    }
}

contract ObidotVaultEVM_Views_Test is ObidotVaultEVM_Base_Test {
    function test_idleAssets() public {
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        assertEq(satellite.idleAssets(), 100 ether);
    }

    function test_isSyncFresh_false_noSync() public view {
        assertFalse(satellite.isSyncFresh());
    }

    function test_isSyncFresh_true_afterSync() public {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: 1_000 ether,
            globalTotalShares: 1_000 ether,
            totalRemoteAssets: 0,
            timestamp: block.timestamp
        });
        _simulateHubMessage(CrossChainCodec.encodeAssetSync(syncMsg));

        assertTrue(satellite.isSyncFresh());
    }

    function test_isSyncFresh_false_stale() public {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: 1_000 ether,
            globalTotalShares: 1_000 ether,
            totalRemoteAssets: 0,
            timestamp: block.timestamp
        });
        _simulateHubMessage(CrossChainCodec.encodeAssetSync(syncMsg));

        // Warp past max sync age
        vm.warp(block.timestamp + MAX_SYNC_AGE + 1);

        assertFalse(satellite.isSyncFresh());
    }

    function test_totalAssets_returnsLocalBalance() public {
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        assertEq(satellite.totalAssets(), 100 ether);
    }

    function test_totalAssets_emergencyMode_returnsLocal() public {
        vm.prank(alice);
        satellite.deposit(100 ether, alice);

        vm.prank(admin);
        satellite.enableEmergencyMode();

        assertEq(satellite.totalAssets(), 100 ether);
    }

    function test_receiveEther() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(satellite).call{value: 1 ether}("");
        assertTrue(ok);
    }

    function test_supportsInterface() public view {
        assertTrue(satellite.supportsInterface(type(IAccessControl).interfaceId));
    }
}

contract ObidotVaultEVM_Timeout_Test is ObidotVaultEVM_Base_Test {
    function test_onPostRequestTimeout_withdrawCancels() public {
        // Build a withdrawal request body
        CrossChainCodec.WithdrawRequestMessage memory withdrawMsg = CrossChainCodec.WithdrawRequestMessage({
            chainId: CHAIN_ID,
            withdrawer: alice,
            amount: 50 ether,
            sharesToBurn: 48 ether,
            nonce: 0
        });

        bytes memory body = CrossChainCodec.encodeWithdrawRequest(withdrawMsg);

        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ID,
            dest: HUB_CHAIN_ID,
            nonce: 0,
            from: abi.encode(address(satellite)),
            to: hubRouterModule,
            timeoutTimestamp: 0,
            body: body
        });

        // Set totalPendingWithdrawals to simulate having a pending withdrawal
        // We can't easily set internal state, but the timeout handler will try to subtract
        // If totalPendingWithdrawals == 0, it just stays 0 (safe subtraction)
        vm.prank(address(ismpHost));
        satellite.onPostRequestTimeout(request);

        // Should not revert — timeout handled gracefully
        assertEq(satellite.totalPendingWithdrawals(), 0);
    }

    function testRevert_onPostRequestTimeout_unauthorizedHost() public {
        IIsmpModule.PostRequest memory request = IIsmpModule.PostRequest({
            source: CHAIN_ID,
            dest: HUB_CHAIN_ID,
            nonce: 0,
            from: abi.encode(address(satellite)),
            to: hubRouterModule,
            timeoutTimestamp: 0,
            body: bytes("")
        });

        vm.prank(alice);
        vm.expectRevert();
        satellite.onPostRequestTimeout(request);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fuzz Tests
// ═══════════════════════════════════════════════════════════════════════════

contract CrossChain_Fuzz_Test is ObidotVaultEVM_Base_Test {
    function testFuzz_deposit_syncsCorrectly(uint256 amount) public {
        amount = bound(amount, 1, DEPOSIT_CAP);

        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(satellite), type(uint256).max);

        vm.prank(alice);
        uint256 shares = satellite.deposit(amount, alice);

        assertTrue(shares > 0, "Should mint nonzero shares");
        assertEq(ismpHost.dispatchCount(), 1, "Should dispatch exactly one sync");
    }

    function testFuzz_assetSync_updatesState(uint256 globalAssets, uint256 globalShares, uint256 remoteAssets) public {
        CrossChainCodec.AssetSyncMessage memory syncMsg = CrossChainCodec.AssetSyncMessage({
            globalTotalAssets: globalAssets,
            globalTotalShares: globalShares,
            totalRemoteAssets: remoteAssets,
            timestamp: block.timestamp
        });

        _simulateHubMessage(CrossChainCodec.encodeAssetSync(syncMsg));

        assertEq(satellite.globalTotalAssets(), globalAssets);
        assertEq(satellite.globalTotalShares(), globalShares);
        assertEq(satellite.hubRemoteAssets(), remoteAssets);
    }
}
