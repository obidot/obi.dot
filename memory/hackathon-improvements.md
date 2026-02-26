# Hackathon Improvements — Architecture Decisions

## Changes Implemented

### Phase 1: Critical Contract Fixes

#### 1.1 Dynamic DOMAIN_SEPARATOR (Fork Protection)
- **Decision:** Replace `immutable DOMAIN_SEPARATOR` with cached pattern
- **Implementation:** Store `_deploymentChainId` + `_cachedDomainSeparator` at deploy time. `DOMAIN_SEPARATOR()` function returns cached value when chain ID matches, recomputes dynamically on fork.
- **Rationale:** EIP-2612 best practice. Prevents signature replay across chain forks.
- **PVM Impact:** None — `block.chainid` supported on Polkadot Hub REVM.

#### 1.2 Daily Loss Reset in Policy Engine
- **Decision:** Call `_resetDailyLossIfNeeded()` at start of `_enforcePolicyEngine()`
- **Implementation:** Changed `_enforcePolicyEngine` from `view` to state-mutating. Added reset call before the daily loss check.
- **Rationale:** Without this, a stale loss accumulator from a previous 24h window could permanently block new strategies.
- **Breaking change:** None — `executeStrategy` (the only caller) is already non-view.

#### 1.3 OracleRegistry.getPriceStrict()
- **Decision:** Add validated price getter alongside raw `getPrice()`
- **Implementation:** `getPriceStrict(asset)` reverts if price <= 0 or data is stale. Returns `uint256` (guaranteed positive).
- **Rationale:** Fills gap between unvalidated `getPrice()` and slippage-specific `validateSlippage()`.

### Phase 2: Withdrawal Queue

- **Decision:** Timelock-based withdrawal queue with keeper fulfillment
- **Structs:** `WithdrawalRequest` (116 bytes — fits PVM 416-byte limit)
- **Flow:** `requestWithdrawal(shares)` → burns shares, queues request → `fulfillWithdrawal(requestId)` after timelock → `cancelWithdrawal(requestId)` returns shares
- **Admin:** `setWithdrawalTimelock(seconds)` — 0 = instant withdrawal
- **PVM Call Depth:** fulfillWithdrawal is depth 1 (just a safeTransfer). Safe.

### Phase 3: Strategy Router Improvements

#### 3.1 Protocol Performance Scoring
- **Struct:** `ProtocolPerformance` (160 bytes — fits PVM limit)
- **Fields:** totalDeployed, totalReturned, executionCount, successCount, lastExecutedAt
- **Updated in:** `reportStrategyOutcome()` on every outcome
- **View:** `getProtocolPerformance(protocol)` for agent/frontend consumption

#### 3.2 Batch Strategy Execution
- **Function:** `executeStrategies(intents[], signatures[])` returns `strategyIds[]`
- **Implementation:** Refactored `executeStrategy` to delegate to `_executeStrategySingle()`. Both single and batch entry points share the same internal logic.
- **PVM Call Depth:** batch(1) → _executeStrategySingle(2) → XCM precompile(3) = 3. Under limit of 5.

### Phase 4: PnL Tracking & Performance Fees

#### 4.1 Cumulative PnL
- **State:** `int256 public cumulativePnL` — updated on every `reportStrategyOutcome`
- **View:** `performanceSummary()` returns (cumulativePnL, highWaterMark, feeBps, treasury)

#### 4.2 Performance Fee Module
- **Mechanism:** 10% (configurable, max 30%) performance fee on profit above high-water mark
- **Accrual:** Mints vault shares to treasury — dilutive fee model (standard for ERC-4626)
- **Internal:** `_accruePerformanceFee(profit)` called from `reportStrategyOutcome` when pnl > 0
- **Admin:** `setPerformanceFee(bps, treasury)` and `resetHighWaterMark()`

## Test Coverage

| Feature | Tests Added | Status |
|---|---|---|
| Dynamic DOMAIN_SEPARATOR | 4 tests (same chain, fork, cached, fork-invalidates-sig) | PASS |
| Daily loss reset in policy engine | 2 tests (reset after window, block on breach) | PASS |
| Withdrawal queue | 8 tests (queue, fulfill, cancel, timelock, errors, instant) | PASS |
| Batch execution | 3 tests (batch 2, length mismatch, one invalid) | PASS |
| Protocol performance | 3 tests (profit, failure, cumulative PnL) | PASS |
| Performance fee | 6 tests (config, too high, zero treasury, profit, loss, HWM) | PASS |
| Admin config | 2 tests (set timelock, reset HWM) | PASS |
| getPriceStrict | 6 tests (valid, stale, zero, negative, inactive, vs getPrice) | PASS |
| **Pre-existing** | **348 tests** | **PASS** |
| **Total** | **384 tests** | **ALL PASS** |

## PVM Constraints Verified

All new features validated against Polkadot Hub PVM constraints:
- WithdrawalRequest struct: 116 bytes (< 416 limit)
- ProtocolPerformance struct: 160 bytes (< 416 limit)
- Batch execution max call depth: 3 (< 5 limit)
- All events use ≤ 3 indexed params (< 4 limit)
- No new immutables (total still under 16)
- ReentrancyGuard on all new entry points
