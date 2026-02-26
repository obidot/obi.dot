# Obidot Hackathon Improvement Plan

> Master plan for winning the Polkadot hackathon. All improvements are validated against
> Polkadot Hub PVM constraints, Bifrost integration requirements, and XCM precompile specs.

## Executive Summary

Obidot is an **Autonomous Cross-Chain Finance Layer for Polkadot** — an ERC-4626 vault on
Polkadot Hub EVM that enables an AI agent to route funds across parachains via native XCM.
The project already has strong foundations (296 passing tests, full policy engine, EIP-712
signatures, oracle integration). This plan focuses on **deepening integration**, **fixing
critical issues**, **adding production-grade features**, and **connecting the obi-kit SDK**
to create a compelling hackathon submission.

## Competitive Differentiators

1. **Only ERC-4626 vault on Polkadot Hub** — no competitor exists
2. **AI-driven autonomous yield routing** via XCM — novel in the ecosystem
3. **On-chain policy engine** constraining AI behavior — unique safety model
4. **Open-source SDK (obi-kit)** for developers to build their own agents
5. **Multi-chain architecture** with Hyperbridge ISMP satellite vaults

---

## Phase 1: Critical Contract Fixes (High Priority)

### 1.1 Dynamic DOMAIN_SEPARATOR for Chain Fork Protection
**File:** `contracts/src/ObidotVault.sol`
**Issue:** `DOMAIN_SEPARATOR` is immutable — computed once at deployment. If the chain
forks, signatures remain valid on both forks.
**Fix:** Store `deploymentChainId` at construction. Compute `DOMAIN_SEPARATOR` dynamically
when `block.chainid != deploymentChainId`. Follows EIP-2612 best practice.
**PVM Compatibility:** Safe — `block.chainid` is supported on Polkadot Hub REVM.

### 1.2 Daily Loss Reset in Policy Engine
**File:** `contracts/src/ObidotVault.sol`
**Issue:** `_enforcePolicyEngine()` checks `dailyLossAccumulator > maxDailyLoss` but does
not call `_resetDailyLossIfNeeded()`. Stale accumulator could block new strategies.
**Fix:** Call `_resetDailyLossIfNeeded()` at the start of `_enforcePolicyEngine()`.
Note: We cannot mutate storage in a `view` function, so we need to restructure this.
The `_enforcePolicyEngine` is called from `executeStrategy` which is non-view, so we
change `_enforcePolicyEngine` from `view` to state-mutating.

### 1.3 OracleRegistry.getPrice() Validation
**File:** `contracts/src/OracleRegistry.sol`
**Issue:** `getPrice()` returns raw data without staleness/positivity checks.
**Fix:** Add optional `getPriceStrict()` that validates, keep `getPrice()` as-is for
backward compatibility but add NatDoc warning.

---

## Phase 2: Withdrawal Queue (High Priority — Hackathon Differentiator)

### 2.1 Timelock Withdrawal Queue
**File:** `contracts/src/ObidotVault.sol` (new section)
**Rationale:** When assets are deployed remotely, withdrawals may need to wait for
strategy returns. A withdrawal queue with EIP-7540 patterns shows production maturity.
**Design:**
- Users request withdrawals → queued with a timelock
- Keeper fulfills from returned strategy assets
- Emergency mode bypasses queue (existing behavior preserved)
- Events: `WithdrawalQueued`, `WithdrawalFulfilled`, `WithdrawalCancelled`
**PVM Compatibility:** Safe — pure storage operations, no PVM-specific concerns.
**Constraint:** Storage value max 416 bytes on PVM. Withdrawal struct must fit.
Each `WithdrawalRequest` = address(20) + uint256(32) + uint256(32) + uint256(32) = 116 bytes. Safe.

---

## Phase 3: Multi-Strategy Router with Scoring (High Priority)

### 3.1 Strategy Performance Scoring
**File:** `contracts/src/ObidotVault.sol` (new section)
**Rationale:** On-chain scoring of strategy performance creates a feedback loop for the
AI agent and provides transparency to depositors.
**Design:**
- Track per-protocol cumulative PnL, execution count, success rate
- `ProtocolPerformance` struct: `totalDeployed`, `totalReturned`, `executionCount`,
  `successCount`, `lastExecutedAt`
- View function `getProtocolPerformance(address protocol)` for agent consumption
- Scoring influences exposure caps dynamically (optional — can be agent-side)
**PVM Compatibility:** Each `ProtocolPerformance` struct = 5 × uint256 = 160 bytes. Safe.

### 3.2 Strategy Batch Execution
**File:** `contracts/src/ObidotVault.sol`
**Rationale:** Allow multiple strategies in a single transaction for gas efficiency.
**Design:** `executeStrategies(StrategyIntent[] calldata intents, bytes[] calldata signatures)`
**PVM Constraint:** Call stack depth limit is 5 on PVM. Batch execution must not nest
beyond this. Since `executeStrategy` calls XCM precompile (depth 2), and batch calls
`executeStrategy` (depth 1), total depth = 3. Safe.

---

## Phase 4: On-Chain Strategy Performance Tracking (Medium Priority)

### 4.1 Strategy History & Analytics
**File:** `contracts/src/ObidotVault.sol`
**Design:**
- Cumulative P&L tracking: `int256 public cumulativePnL`
- High-water mark for fee calculation: `uint256 public highWaterMark`
- Strategy success rate: derived from `ProtocolPerformance` data
- View functions for agent and frontend consumption

### 4.2 Fee Module (Performance Fee)
**Rationale:** Standard vault practice — charge performance fee on profits only.
**Design:**
- 10% performance fee on profit above high-water mark
- Fee accrues as vault shares to admin/treasury
- Calculation on `reportStrategyOutcome` when `pnl > 0`
- `performanceFeeBps` configurable by admin
**PVM Compatibility:** Safe — arithmetic only.

---

## Phase 5: Agent Improvements (Medium Priority)

### 5.1 Real Bifrost Yield Data Integration
**File:** `modules/agent/src/services/yield.service.ts`
**Current:** Returns mock APY data with sine-wave simulation.
**Fix:** Fetch real vDOT/vKSM exchange rates from Bifrost RPC or Subsquid indexer.
Calculate actual APY from exchange rate changes over time.

### 5.2 Strategy Outcome Verification
**File:** `modules/agent/src/agent/loop.ts`
**Current:** No verification of strategy outcomes after execution.
**Fix:** After `executeStrategy`, poll for XCM delivery confirmation and call
`reportStrategyOutcome` with actual results.

### 5.3 Multi-Source Oracle Integration
**File:** `modules/agent/src/services/price-aggregator.service.ts`
**Current:** Fetches from Pyth/CoinGecko/Binance with median aggregation.
**Improvement:** Add SubQuery/Subsquid indexer as a Polkadot-native price source.
Validate that the aggregated price falls within the on-chain oracle's deviation cap.

---

## Phase 6: obi-kit SDK Connection (Medium Priority)

See `tasks/obi-kit-integration.md` for detailed plan.

### Key Integration Points:
1. **Core package:** Add real contract ABIs matching current deployed contracts
2. **LLM package:** Connect `BifrostStrategyTool` to real `BifrostAdapter` contract
3. **SDK package:** `ObiKit.connect()` should create real viem clients for Polkadot Hub
4. **Examples:** Update `vault-agent` and `cross-chain-agent` examples with working configs

---

## Phase 7: Integration Testing (Medium Priority)

### 7.1 Full Lifecycle Test
**File:** `contracts/test/Integration.t.sol` (new)
**Scenario:** Deposit → Strategy Execution → XCM Dispatch → Outcome Report → Withdrawal
Tests the complete flow with mock XCM precompile simulating real token movements.

### 7.2 Cross-Chain Lifecycle Test
**File:** `contracts/test/CrossChainLifecycle.t.sol` (new)
**Scenario:** Satellite Deposit → ISMP Sync → Hub Strategy → Outcome → Satellite Withdrawal
Tests hub + satellite interaction with mock ISMP host.

### 7.3 Withdrawal Queue Test
**File:** `contracts/test/ObidotVault.t.sol` (extend)
**Scenarios:** Queue request → fulfill → cancel → emergency bypass → timelock enforcement

---

## Phase 8: Deployment & Demo (Medium Priority)

### 8.1 Paseo Testnet Deployment
- Deploy ObidotVault with real Pyth oracle on Paseo
- Deploy KeeperOracle as fallback
- Deploy OracleRegistry with DOT/USD feed
- Deploy BifrostAdapter (Bifrost testnet parachain ID)
- Run agent against deployed contracts

### 8.2 Demo Script
- Show deposit flow (user deposits DOT)
- Show AI agent analyzing yields (real Bifrost data)
- Show strategy execution (XCM dispatch to Bifrost)
- Show outcome reporting and P&L tracking
- Show obi-kit SDK creating a custom agent

---

## Implementation Order & Dependencies

```
Phase 1 (Fixes) ──────────────────────────────────────────────┐
    ├── 1.1 DOMAIN_SEPARATOR (no deps)                        │
    ├── 1.2 Daily loss reset (no deps)                        │
    └── 1.3 Oracle validation (no deps)                       │
                                                              │
Phase 2 (Withdrawal Queue) ──── depends on Phase 1 ──────────┤
                                                              │
Phase 3 (Strategy Router) ──── depends on Phase 1 ────────────┤
    ├── 3.1 Performance scoring                               │
    └── 3.2 Batch execution                                   │
                                                              │
Phase 4 (Analytics) ──── depends on Phase 3 ──────────────────┤
    ├── 4.1 Strategy history                                  │
    └── 4.2 Fee module                                        │
                                                              │
Phase 5 (Agent) ──── depends on Phase 4 ──────────────────────┤
                                                              │
Phase 6 (obi-kit) ──── depends on Phase 4 ────────────────────┤
                                                              │
Phase 7 (Testing) ──── depends on all above ──────────────────┤
                                                              │
Phase 8 (Deployment) ──── depends on Phase 7 ─────────────────┘
```

## PVM Constraints Checklist

| Constraint | Obidot Status | Notes |
|---|---|---|
| 64KB heap buffer | OK | Vault contract is well under limit |
| Call stack depth 5 | OK | Max depth: batch → executeStrategy → XCM precompile = 3 |
| Max 4 event topics | OK | All events use ≤ 3 indexed params |
| Event data max 416 bytes | OK | Largest event (RemoteAssetsAdjusted) uses string reason — needs bounds |
| Storage value max 416 bytes | OK | All structs under 200 bytes |
| Max 16 immutable uint values | OK | Only 1 immutable (DOMAIN_SEPARATOR) |
| No selfdestruct | OK | Not used |
| No EXTCODECOPY | OK | Not used |
| Reentrancy guards required | OK | All entry points protected |
| Gas limit ignored cross-contract | OK | ReentrancyGuard provides protection |
| SCALE encoding for XCM | OK | MultiLocation.sol handles encoding |

## Estimated Effort

| Phase | Files Changed | New Tests | Effort |
|---|---|---|---|
| Phase 1 | 2 contracts | 5 tests | 2 hours |
| Phase 2 | 1 contract, 1 test | 8 tests | 3 hours |
| Phase 3 | 1 contract, 1 test | 6 tests | 3 hours |
| Phase 4 | 1 contract, 1 test | 4 tests | 2 hours |
| Phase 5 | 3 agent files | 0 (manual test) | 2 hours |
| Phase 6 | 4 obi-kit packages | 0 (existing tests) | 3 hours |
| Phase 7 | 2 new test files | 10+ tests | 2 hours |
| Phase 8 | 2 deploy scripts | 0 | 2 hours |
| **Total** | | **33+ new tests** | **~19 hours** |
