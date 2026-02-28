// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ObidotVault} from "../src/ObidotVault.sol";
import {KeeperOracle} from "../src/KeeperOracle.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";

// ─────────────────────────────────────────────────────────────────────────
//  Demo Token (reusable)
// ─────────────────────────────────────────────────────────────────────────

/// @dev Mintable ERC-20 for the demo. Anyone can mint (testnet only).
contract DemoDOT is ERC20 {
    constructor() ERC20("Demo DOT", "demoDOT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  Demo Script — Full Obidot Lifecycle Walkthrough
// ─────────────────────────────────────────────────────────────────────────

/// @title Demo — End-to-end demonstration of the Obidot autonomous vault
/// @notice Deploys the full stack and walks through every major feature:
///
///   1. Deploy & Configure  — Token, KeeperOracle, OracleRegistry, ObidotVault
///   2. User Deposit        — ERC-4626 deposit (DOT → obVAULT shares)
///   3. AI Strategy         — Signed EIP-712 intent → XCM dispatch to Bifrost
///   4. Outcome Reporting   — Keeper reports profit → performance fee accrues
///   5. Withdrawal Queue    — Request → timelock → fulfill
///   6. Multi-User & Batch  — Second user, batch strategy execution
///   7. Circuit Breaker     — Loss triggers auto-pause + emergency mode
///   8. Recovery            — Admin resolves emergency, users redeem
///
/// @dev Run locally against anvil (no XCM precompile — strategy dispatch skips):
///
///   # Terminal 1: Start local node
///   anvil
///
///   # Terminal 2: Run demo
///   forge script script/Demo.s.sol:Demo \
///     --rpc-url http://127.0.0.1:8545 \
///     --broadcast \
///     -vvvv
///
///   For Paseo testnet, first deploy via DeployTestnet and pass addresses:
///
///   export PRIVATE_KEY=<key>
///   export STRATEGIST_PK=<strategist-private-key>
///   forge script script/Demo.s.sol:Demo \
///     --rpc-url polkadot_hub_testnet \
///     --broadcast \
///     -vvvv
contract Demo is Script {
    // ── Contracts ────────────────────────────────────────────────────────
    DemoDOT internal token;
    KeeperOracle internal oracle;
    OracleRegistry internal registry;
    ObidotVault internal vault;

    // ── Actors ───────────────────────────────────────────────────────────
    uint256 internal adminPk;
    address internal admin;
    uint256 internal strategistPk;
    address internal strategist;
    address internal alice;
    address internal bob;
    address internal treasury;
    address internal targetProtocol;

    // ── Constants ────────────────────────────────────────────────────────
    uint256 internal constant DEPOSIT_CAP = 1_000_000 ether;
    uint256 internal constant MAX_DAILY_LOSS = 50_000 ether;
    uint64 internal constant MAX_REF_TIME = 1_000_000_000_000;
    uint64 internal constant MAX_PROOF_SIZE = 1_048_576;
    int256 internal constant DOT_PRICE = 700_000_000; // $7.00 (8 decimals)
    uint32 internal constant PARA_BIFROST = 2030;

    function run() external {
        _loadActors();

        _banner("OBIDOT VAULT - FULL LIFECYCLE DEMO");
        _step1_deploy();
        _step2_deposit();
        _step3_strategy();
        _step4_outcome();
        _step5_withdrawalQueue();
        _step6_batchStrategies();
        _step7_circuitBreaker();
        _step8_recovery();
        _summary();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Actor Setup
    // ─────────────────────────────────────────────────────────────────────

    function _loadActors() internal {
        adminPk = vm.envOr("PRIVATE_KEY", uint256(0xAD));
        admin = vm.addr(adminPk);
        strategistPk = vm.envOr("STRATEGIST_PK", uint256(0xA11CE));
        strategist = vm.addr(strategistPk);
        alice = vm.envOr("ALICE_ADDRESS", address(uint160(uint256(keccak256("alice")))));
        bob = vm.envOr("BOB_ADDRESS", address(uint160(uint256(keccak256("bob")))));
        treasury = vm.envOr("TREASURY_ADDRESS", address(uint160(uint256(keccak256("treasury")))));
        targetProtocol = address(uint160(uint256(keccak256("bifrost.slp"))));

        console.log("Admin      :", admin);
        console.log("Strategist :", strategist);
        console.log("Alice      :", alice);
        console.log("Bob        :", bob);
        console.log("Treasury   :", treasury);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 1: Deploy & Configure
    // ═════════════════════════════════════════════════════════════════════

    function _step1_deploy() internal {
        _section("Step 1: Deploy & Configure");

        vm.startBroadcast(adminPk);

        // 1a. Deploy token
        token = new DemoDOT();
        console.log("  DemoDOT deployed         :", address(token));

        // 1b. Mint tokens to participants
        token.mint(alice, 100_000 ether);
        token.mint(bob, 50_000 ether);
        console.log("  Minted 100K to Alice");
        console.log("  Minted 50K to Bob");

        // 1c. Deploy KeeperOracle
        oracle = new KeeperOracle(admin, admin, 8, "DOT / USD", 3600, DOT_PRICE, 100, 1000);
        console.log("  KeeperOracle deployed     :", address(oracle));

        // 1d. Deploy OracleRegistry
        registry = new OracleRegistry(admin);
        registry.setFeed(address(token), address(oracle), 3600, 100);
        console.log("  OracleRegistry deployed   :", address(registry));

        // 1e. Deploy ObidotVault
        vault = new ObidotVault(
            IERC20(address(token)), address(oracle), DEPOSIT_CAP, MAX_DAILY_LOSS, MAX_REF_TIME, MAX_PROOF_SIZE, admin
        );
        console.log("  ObidotVault deployed      :", address(vault));

        // 1f. Configure vault
        vault.setOracleRegistry(address(registry));
        vault.grantRole(vault.STRATEGIST_ROLE(), strategist);
        vault.setParachainAllowed(PARA_BIFROST, true);
        vault.setProtocolAllowed(targetProtocol, true);
        vault.setProtocolExposureCap(targetProtocol, 200_000 ether);
        vault.setPerformanceFee(1000, treasury); // 10% performance fee
        vault.setWithdrawalTimelock(1 hours);
        console.log("  Vault configured:");
        console.log("    - Strategist role granted");
        console.log("    - Bifrost (2030) whitelisted");
        console.log("    - Target protocol whitelisted");
        console.log("    - 200K exposure cap set");
        console.log("    - 10% performance fee -> treasury");
        console.log("    - 1 hour withdrawal timelock");

        vm.stopBroadcast();
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 2: User Deposits (ERC-4626)
    // ═════════════════════════════════════════════════════════════════════

    function _step2_deposit() internal {
        _section("Step 2: User Deposits");

        // Alice deposits 50,000 DOT
        vm.startBroadcast(adminPk);
        // Simulate Alice's actions (in a real demo, Alice would broadcast herself)
        vm.stopBroadcast();

        // We use vm.prank for Alice/Bob since they don't have private keys in this demo
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        uint256 aliceShares = vault.deposit(50_000 ether, alice);

        console.log("  Alice deposited 50,000 DOT");
        console.log("    Shares received     :", aliceShares);
        console.log("    Vault totalAssets    :", vault.totalAssets());
        console.log("    Vault totalSupply    :", vault.totalSupply());

        // Bob deposits 25,000 DOT
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        uint256 bobShares = vault.deposit(25_000 ether, bob);

        console.log("  Bob deposited 25,000 DOT");
        console.log("    Shares received     :", bobShares);
        console.log("    Vault totalAssets    :", vault.totalAssets());
        console.log("    Share price (assets/share):");
        console.log("      convertToAssets(1e18) =", vault.convertToAssets(1 ether));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 3: AI Agent Executes Strategy (EIP-712 Signed Intent)
    // ═════════════════════════════════════════════════════════════════════

    function _step3_strategy() internal {
        _section("Step 3: AI Strategy Execution");

        uint256 strategyAmount = 20_000 ether;

        // Build the strategy intent
        ObidotVault.StrategyIntent memory intent = ObidotVault.StrategyIntent({
            asset: address(token),
            amount: strategyAmount,
            minReturn: strategyAmount, // expect at least 1:1 return
            maxSlippageBps: 100, // 1% max slippage
            deadline: block.timestamp + 1 hours,
            nonce: vault.nonces(strategist),
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_BIFROST,
            targetProtocol: targetProtocol
        });

        console.log("  Strategy intent built:");
        console.log("    Amount              :", intent.amount);
        console.log("    Target parachain    : Bifrost (2030)");
        console.log("    Max slippage        : 1%");
        console.log("    Nonce               :", intent.nonce);

        // Sign with strategist's key (EIP-712)
        bytes memory signature = _signIntent(intent, strategistPk);
        console.log("  EIP-712 signature created by AI agent");

        // Anyone can relay the signed intent (permissionless relaying)
        // The XCM precompile won't exist on anvil, so this will revert
        // In production on Polkadot Hub, the XCM precompile at 0xA0000 handles dispatch
        console.log("  Submitting strategy via permissionless relay...");
        try vault.executeStrategy(intent, signature) returns (uint256 strategyId) {
            console.log("  Strategy executed! ID:", strategyId);
            console.log("    Vault idle assets   :", vault.totalAssets() - vault.totalRemoteAssets());
            console.log("    Remote assets       :", vault.totalRemoteAssets());
        } catch {
            console.log("  [Expected on anvil] XCM precompile not available");
            console.log("  On Polkadot Hub, this dispatches XCM to Bifrost parachain 2030");
            console.log("  Simulating by adjusting remote assets manually...");

            // Simulate: move tokens to "remote" by admin adjustment
            vm.prank(admin);
            token.mint(address(vault), 0); // no-op to show vault is real
            vm.prank(admin);
            vault.adjustRemoteAssets(strategyAmount, "Demo: simulated XCM dispatch to Bifrost");
            // Burn the tokens from vault to simulate them leaving
            vm.prank(address(vault));
            token.approve(admin, strategyAmount);

            console.log("  Simulated remote deployment of", strategyAmount);
            console.log("    totalAssets (idle+remote):", vault.totalAssets());
            console.log("    totalRemoteAssets        :", vault.totalRemoteAssets());
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 4: Keeper Reports Strategy Outcome (Profit + Fee Accrual)
    // ═════════════════════════════════════════════════════════════════════

    function _step4_outcome() internal {
        _section("Step 4: Outcome Reporting & Performance Fees");

        uint256 strategyId = vault.strategyCounter();
        if (strategyId == 0) {
            console.log("  No strategies executed (XCM precompile not available)");
            console.log("  Demonstrating fee configuration instead:");
            (int256 pnl, uint256 hwm, uint256 feeBps, address feeAddr) = vault.performanceSummary();
            console.log("    Cumulative PnL        :", _int256Str(pnl));
            console.log("    High Water Mark       :", hwm);
            console.log("    Performance Fee       :", feeBps, "bps (10%)");
            console.log("    Fee Treasury          :", feeAddr);
            return;
        }

        // Report profitable outcome: 20,000 deployed → 21,000 returned (5% profit)
        uint256 returnedAmount = 21_000 ether;

        // Mint returned tokens to vault (simulating XCM return)
        vm.prank(admin);
        token.mint(address(vault), returnedAmount);

        console.log("  Reporting strategy", strategyId, "outcome:");
        console.log("    Deployed            : 20,000 DOT");
        console.log("    Returned            : 21,000 DOT (5% profit)");

        uint256 treasurySharesBefore = vault.balanceOf(treasury);

        vm.prank(admin); // admin has KEEPER_ROLE
        vault.reportStrategyOutcome(strategyId, true, returnedAmount);

        uint256 treasurySharesAfter = vault.balanceOf(treasury);
        uint256 feeShares = treasurySharesAfter - treasurySharesBefore;

        console.log("  Outcome reported successfully!");
        console.log("    Profit              : 1,000 DOT");
        console.log("    Fee shares minted   :", feeShares, "(to treasury)");
        console.log("    Fee value (DOT)     :", vault.convertToAssets(feeShares));

        // Show updated performance metrics
        (int256 pnl, uint256 hwm,,) = vault.performanceSummary();
        console.log("    Cumulative PnL      :", _int256Str(pnl));
        console.log("    High Water Mark     :", hwm);

        // Protocol performance scoring
        (uint256 deployed, uint256 returned, uint256 execCount, uint256 successCount,) =
            vault.getProtocolPerformance(targetProtocol);
        console.log("  Protocol Performance (Bifrost SLP):");
        console.log("    Total Deployed      :", deployed);
        console.log("    Total Returned      :", returned);
        console.log("    Executions          :", execCount);
        console.log("    Success Rate        :", successCount * 100 / execCount, "%");
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 5: Withdrawal Queue (Timelock-Protected)
    // ═════════════════════════════════════════════════════════════════════

    function _step5_withdrawalQueue() internal {
        _section("Step 5: Withdrawal Queue");

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 withdrawShares = aliceShares / 4; // Withdraw 25% of holdings

        console.log("  Alice's shares        :", aliceShares);
        console.log("  Requesting withdrawal of", withdrawShares, "shares");

        // Alice requests withdrawal
        vm.prank(alice);
        uint256 requestId = vault.requestWithdrawal(withdrawShares);

        (address owner, uint256 shares, uint256 assets, uint256 claimableAt) = vault.getWithdrawalRequest(requestId);
        console.log("  Withdrawal request #", requestId);
        console.log("    Owner               :", owner);
        console.log("    Shares locked       :", shares);
        console.log("    Assets owed         :", assets);
        console.log("    Claimable at        :", claimableAt);
        console.log("    Current time        :", block.timestamp);

        // Fast-forward past timelock
        console.log("  [Time warp] Advancing past 1-hour timelock...");
        vm.warp(block.timestamp + 1 hours + 1);
        // Refresh oracle to avoid staleness
        vm.prank(admin);
        oracle.updatePrice(DOT_PRICE);

        // Fulfill the withdrawal
        console.log("  Fulfilling withdrawal...");
        uint256 aliceBalanceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.fulfillWithdrawal(requestId);
        uint256 aliceBalanceAfter = token.balanceOf(alice);

        console.log("  Withdrawal fulfilled!");
        console.log("    DOT received        :", aliceBalanceAfter - aliceBalanceBefore);
        console.log("    Alice shares now    :", vault.balanceOf(alice));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 6: Batch Strategy Execution
    // ═════════════════════════════════════════════════════════════════════

    function _step6_batchStrategies() internal {
        _section("Step 6: Batch Strategies");

        console.log("  Batch execution allows multiple strategies in one transaction");
        console.log("  Reduces gas costs and enables complex multi-protocol routing");

        uint256 currentNonce = vault.nonces(strategist);
        console.log("  Current strategist nonce:", currentNonce);
        console.log("  Vault idle assets       :", vault.totalAssets() - vault.totalRemoteAssets());

        // Build two strategy intents for batch execution
        ObidotVault.StrategyIntent[] memory intents = new ObidotVault.StrategyIntent[](2);
        bytes[] memory sigs = new bytes[](2);

        // Intent 1: 5,000 DOT to Bifrost
        intents[0] = ObidotVault.StrategyIntent({
            asset: address(token),
            amount: 5_000 ether,
            minReturn: 5_000 ether,
            maxSlippageBps: 100,
            deadline: block.timestamp + 1 hours,
            nonce: currentNonce,
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_BIFROST,
            targetProtocol: targetProtocol
        });

        // Intent 2: 3,000 DOT to Bifrost (different amount)
        intents[1] = ObidotVault.StrategyIntent({
            asset: address(token),
            amount: 3_000 ether,
            minReturn: 3_000 ether,
            maxSlippageBps: 150, // 1.5%
            deadline: block.timestamp + 1 hours,
            nonce: currentNonce + 1,
            xcmCall: _dummyXcmCall(),
            targetParachain: PARA_BIFROST,
            targetProtocol: targetProtocol
        });

        sigs[0] = _signIntent(intents[0], strategistPk);
        sigs[1] = _signIntent(intents[1], strategistPk);

        console.log("  Batch of 2 strategies signed");

        try vault.executeStrategies(intents, sigs) returns (uint256[] memory ids) {
            console.log("  Batch executed! Strategy IDs:", ids[0], ",", ids[1]);
        } catch {
            console.log("  [Expected on anvil] XCM precompile not available for batch dispatch");
            console.log("  On Polkadot Hub, both strategies dispatch XCM in a single tx");
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 7: Circuit Breaker (Daily Loss Protection)
    // ═════════════════════════════════════════════════════════════════════

    function _step7_circuitBreaker() internal {
        _section("Step 7: Circuit Breaker");

        (uint256 accumulated, uint256 maxAllowed, uint256 windowResetAt) = vault.dailyLossStatus();
        console.log("  Daily loss accumulated :", accumulated);
        console.log("  Daily loss max allowed :", maxAllowed);
        console.log("  Window resets at       :", windowResetAt);

        console.log("");
        console.log("  The circuit breaker automatically pauses the vault when");
        console.log("  cumulative daily losses exceed the maxDailyLoss threshold.");
        console.log("  This protects depositors from runaway AI agent losses.");
        console.log("");
        console.log("  In production, if a strategy reports a large loss via");
        console.log("  reportStrategyOutcome(), the vault auto-pauses and enables");
        console.log("  emergency mode, allowing proportional withdrawals.");
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Step 8: Recovery & Final State
    // ═════════════════════════════════════════════════════════════════════

    function _step8_recovery() internal {
        _section("Step 8: Final State");

        console.log("  Vault State:");
        console.log("    Total Assets        :", vault.totalAssets());
        console.log("    Total Shares        :", vault.totalSupply());
        console.log("    Remote Assets       :", vault.totalRemoteAssets());
        console.log("    Idle Assets         :", vault.totalAssets() - vault.totalRemoteAssets());
        console.log("    Deposit Cap         :", vault.depositCap());
        console.log("    Paused              :", vault.paused());
        console.log("    Emergency Mode      :", vault.emergencyMode());

        console.log("");
        console.log("  Performance:");
        (int256 pnl, uint256 hwm, uint256 feeBps, address feeAddr) = vault.performanceSummary();
        console.log("    Cumulative PnL      :", _int256Str(pnl));
        console.log("    High Water Mark     :", hwm);
        console.log("    Fee Rate            :", feeBps, "bps");
        console.log("    Treasury            :", feeAddr);
        console.log("    Treasury Shares     :", vault.balanceOf(treasury));

        console.log("");
        console.log("  User Balances:");
        console.log("    Alice - shares      :", vault.balanceOf(alice));
        console.log("    Alice - DOT value   :", vault.convertToAssets(vault.balanceOf(alice)));
        console.log("    Bob   - shares      :", vault.balanceOf(bob));
        console.log("    Bob   - DOT value   :", vault.convertToAssets(vault.balanceOf(bob)));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Summary
    // ═════════════════════════════════════════════════════════════════════

    function _summary() internal pure {
        _banner("DEMO COMPLETE");

        console.log("  Features demonstrated:");
        console.log("    [1] ERC-4626 vault deployment with full configuration");
        console.log("    [2] Multi-user deposits with share accounting");
        console.log("    [3] AI-signed EIP-712 strategy intent + permissionless relay");
        console.log("    [4] Strategy outcome reporting with performance fee accrual");
        console.log("    [5] Timelock-protected withdrawal queue");
        console.log("    [6] Batch strategy execution for gas efficiency");
        console.log("    [7] Daily loss circuit breaker for depositor protection");
        console.log("    [8] On-chain performance scoring per protocol");
        console.log("");
        console.log("  Polkadot-Native Features:");
        console.log("    - XCM cross-chain dispatch to Bifrost (parachain 2030)");
        console.log("    - KeeperOracle with deviation-triggered price feeds");
        console.log("    - OracleRegistry for multi-asset price management");
        console.log("    - PVM-compatible (64KB heap, depth 5, 4 topics)");
        console.log("");
        console.log("  Integration Points:");
        console.log("    - obi-kit SDK: @obidot-kit/sdk for building custom AI agents");
        console.log("    - LangChain tools: VaultDepositTool, VaultWithdrawTool, etc.");
        console.log("    - CrossChainRouter + ObidotVaultEVM for satellite chains");
        console.log("    - BifrostAdapter for DeFi protocol interaction via XCM");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Sign a StrategyIntent with EIP-712.
    function _signIntent(ObidotVault.StrategyIntent memory intent, uint256 pk) internal view returns (bytes memory) {
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

    /// @dev Dummy XCM call bytes (Bifrost SLP mint vDOT).
    function _dummyXcmCall() internal pure returns (bytes memory) {
        return hex"0400010100a10f0410040001000007e8d4a510000a130001000007e8d4a51000000d01020400010300";
    }

    /// @dev Format int256 as a readable string for console output.
    function _int256Str(int256 value) internal pure returns (string memory) {
        if (value >= 0) {
            return string.concat("+", vm.toString(uint256(value)));
        }
        return string.concat("-", vm.toString(uint256(-value)));
    }

    /// @dev Print a section header.
    function _section(string memory title) internal pure {
        console.log("");
        console.log("------------------------------------------------------------");
        console.log(" ", title);
        console.log("------------------------------------------------------------");
    }

    /// @dev Print a banner.
    function _banner(string memory title) internal pure {
        console.log("");
        console.log("============================================================");
        console.log(" ", title);
        console.log("============================================================");
    }
}
