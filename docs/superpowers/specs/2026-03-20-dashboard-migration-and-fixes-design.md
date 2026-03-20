# Dashboard Migration & Page Fixes — Design Spec

## Overview

This spec covers five coordinated changes to the Obidot frontend and agent backend:

1. **Fix agent decision logging** — wire `strategyStore.addDecision()` into the autonomous loop so the `/agent` page shows real decisions.
2. **Fix strategy recording** — wire `strategyStore.addStrategy()` after tool execution; add agent-API fallback to the strategies frontend hook.
3. **Fix /yields protocol display** — replace raw hex addresses with human-readable protocol names in the yield grid.
4. **Add Uniswap V2 pairs to /yields** — expose UV2 pair reserves as yield opportunities in the frontend.
5. **Migrate Dashboard → /yields** — move all dashboard widgets into /yields, add VaultActions sidebar, delete root page.
6. **Agent page UI/UX improvements** — GPT-4o → GPT-5-mini, richer decision cards, manual refresh, action color-coding.

---

## Context

### Current State

- `/` (root page): `VaultOverview`, `QuickStats`, `PnlChart`, `VaultActions`, `UserPosition`, `HealthIndicators`, `RecentActivity`
- `/yields`: bare `YieldGrid` with protocol filter/search/sort. Protocol column shows raw hex addresses (e.g. `0x0000000000000000000000000000000000002032`).
- `/strategies`: fetches from GraphQL indexer (`obi.index`). On testnet, agent skips all strategies (NO_ACTION only) → always empty.
- `/agent`: fetches from `strategyStore.getDecisions()` via `/api/agent/log`. `addDecision()` is never called in `loop.ts` → always empty.
- `UV2_PAIRS` (5 on-chain pairs) exist in agent `constants.ts` but are never surfaced through the yields API.

### Root Causes

| Issue | Root Cause |
|---|---|
| Agent decisions always empty | `strategyStore.addDecision()` never called in `loop.ts` |
| Strategies always empty | Frontend reads only GraphQL indexer; agent never calls `addStrategy()` after tool execution; on testnet, no on-chain strategy events emitted |
| Protocol column shows `0x000...` | `protocol` field is a hex address; yield-grid renders it raw |
| No UV2 pairs in yields | `UV2_PAIRS` not exposed through `/api/yields` or frontend |

---

## Task A — Fix Agent Decision Logging

**Files modified:**
- `modules/agent/src/agent/loop.ts`

**What changes:**
After `invokeLlm()` returns (whether the result is a validated decision or `null`), always call `strategyStore.addDecision()`. When the result is `null`, use `action: "NO_DECISION"` and `reasoning: "LLM returned no actionable decision"`. The record captures:
- `cycle`: current cycle count
- `action`: `decision.action` or `"NO_DECISION"` if LLM returned null
- `reasoning`: `decision.reasoning` or fallback string
- `timestamp`: `Date.now()`
- `snapshot`: built from the `snapshot` object already in scope at that point in `runCycle()`:
  - `totalAssets`: `snapshot.vaultState.totalAssets.toString()`
  - `idleBalance`: `snapshot.vaultState.idleBalance.toString()`
  - `topYieldApy`: highest `apyPercent` across `[...snapshot.yields, ...(snapshot.bifrostYields ?? [])]`
  - `topYieldProtocol`: the `name` field (not `protocol` address) of the entry with the highest APY

Import `strategyStore` at the top of `loop.ts`.

---

## Task B — Fix Strategy Recording

**Files modified:**
- `modules/agent/src/agent/loop.ts`
- `modules/app/src/hooks/use-strategies.ts`

**What changes (agent side):**
After the `executeTool.invoke()` call and `parsed.success` check (line ~411 in loop.ts), call `strategyStore.addStrategy()`. The `nonce` and `txHash` come from `parsed.data` (the tool execution result), NOT from the `decision` object. Fields:
- `id`: `parsed.data?.nonce?.toString() ?? crypto.randomUUID()`
- `action`: `decision.action`
- `target`: `decision.action === "LOCAL_SWAP" ? decision.tokenOut : decision.action === "REALLOCATE" ? decision.targetProtocol : decision.action === "BIFROST_STRATEGY" ? decision.strategyType : "unknown"`
- `amount`: `decision.amount?.toString() ?? "0"` (the decision DOES have `amount` for all non-NO_ACTION actions)
- `reasoning`: `decision.reasoning`
- `status`: `"pending"`
- `txHash`: `parsed.data?.txHash`
- `timestamp`: `Date.now()`

Note: `parsed.data.nonce` is the strategy nonce from the vault, already extracted on line 419 of loop.ts as `BigInt(parsed.data.nonce)` — use the same field.

**What changes (frontend side):**
`use-strategies.ts` currently only queries GraphQL. Change it to:
1. Try `getIndexedStrategyExecutions(20)` from GraphQL indexer
2. If result is empty AND agent API is reachable, fetch from `/api/strategies`
3. Merge and deduplicate by `id`, return combined list
4. Map agent-API `StrategyRecord` shape → `IndexedStrategyExecution` shape (or unify types)

---

## Task C — Fix /yields Protocol Display Names

**Files modified:**
- `modules/agent/src/services/yield.service.ts`
- `modules/agent/src/api/routes/yields.ts`
- `modules/app/src/types/index.ts`
- `modules/app/src/components/yields/yield-grid.tsx`

**What changes:**
Add a `protocolLabel: string` field to `ProtocolYield` and `BifrostYield` in both the agent types (`modules/agent/src/types/index.ts`) and the frontend types (`modules/app/src/types/index.ts`). This is a **non-breaking additive change** — existing `protocol` address field is preserved.

Explicit label mapping in `yield.service.ts`:
| Protocol | `protocolLabel` |
|---|---|
| `KNOWN_PARACHAINS.HYDRATION` | `"Hydration Omnipool"` |
| `KNOWN_PARACHAINS.BIFROST` | `"Bifrost"` |
| `BIFROST_PROTOCOLS.SLP` (vDOT) | `"Bifrost SLP"` |
| `BIFROST_PROTOCOLS.SLP` (vKSM) | `"Bifrost SLP"` |
| `BIFROST_PROTOCOLS.DEX` | `"Bifrost DEX"` |
| `BIFROST_PROTOCOLS.FARMING` | `"Bifrost Farming"` |
| `BIFROST_PROTOCOLS.SALP` | `"Bifrost SALP"` |

Update `yields.ts` API routes to include `protocolLabel` in the serialized response alongside existing fields. In `yield-grid.tsx`, use `protocolLabel` for the Protocol column display and the 2-char initials avatar fallback.

---

## Task D — Add Uniswap V2 Pairs to /yields

**Files modified:**
- `modules/agent/src/services/yield.service.ts`
- `modules/agent/src/api/routes/yields.ts`
- `modules/agent/src/types/index.ts`
- `modules/app/src/lib/api.ts`
- `modules/app/src/hooks/use-yields.ts`
- `modules/app/src/components/yields/yield-grid.tsx`

**What changes (agent):**
Add `fetchUniswapV2Yields()` to `YieldService`. For each of the 5 `UV2_PAIRS`:
- Call `getReserves()` on the pair contract via viem `publicClient`
- Compute TVL as `(reserve0 + reserve1)` in wei → convert to USD estimate using a fixed DOT price or leave as token amount with a note
- Return a `UniswapV2Yield` shape: `{ name (= label from UV2_PAIRS e.g. "tDOT/tUSDC"), protocolLabel: "UniswapV2", address, token0, token1, reserve0: string, reserve1: string, tvlUsd, apyPercent (simulated 3–15% range), category: "UniswapV2" }`
- TVL computed as `(reserve0 + reserve1) / 1e18 * DOT_PRICE_USD` where `DOT_PRICE_USD = 8.0` (fixed constant, clearly labeled "est." in UI). Falls back to `simulateTvl(500_000, 5_000_000)` if RPC call fails.

Add `/api/yields/uniswap` endpoint that calls `fetchUniswapV2Yields()`.

**What changes (frontend):**
- Add `UniswapV2Yield` type to `types/index.ts`
- Add `getUniswapV2Yields()` to `lib/api.ts`
- Add `useUniswapV2Yields()` to `hooks/use-yields.ts`
- Add `"UniswapV2"` to `FILTER_TABS` and `TypePill` styles in `yield-grid.tsx`
- Pass `uniswapV2Yields` prop into `YieldGrid` and merge into `combined` items

---

## Task E — Migrate Dashboard → /yields

**Files modified:**
- `modules/app/src/app/yields/page.tsx`
- `modules/app/src/app/page.tsx` → **deleted**

**What changes:**
`/yields/page.tsx` gets a new layout:
- **Top full-width:** `VaultOverview`
- **Middle grid `grid-cols-1 lg:grid-cols-[1fr_300px]`:** left = `QuickStats` + `PnlChart` + `YieldGrid`; right = `VaultActions` → `UserPosition` → `HealthIndicators` (stacks to full-width below `lg` breakpoint)
- **Bottom full-width:** `RecentActivity` (always expanded, not collapsible)

`/app/src/app/page.tsx` is **deleted** and replaced with a minimal server component that calls `redirect('/yields')` from `next/navigation`.

All dashboard components (`VaultOverview`, `QuickStats`, `PnlChart`, `VaultActions`, `UserPosition`, `HealthIndicators`) are imported directly from `@/components/dashboard/*` — no file moves needed.

---

## Task F — Agent Page UI/UX Improvements

**Files modified:**
- `modules/app/src/components/agent/agent-status.tsx`
- `modules/app/src/components/agent/decision-feed.tsx`
- `modules/app/src/components/agent/decision-card.tsx`
- `modules/app/src/app/agent/page.tsx`

**What changes:**
1. **`agent-status.tsx`**: Change hardcoded `"GPT-4o"` → `"GPT-5-mini"`. Add "Last Cycle" stat showing the timestamp of the most recent decision in relative time.
2. **`decision-feed.tsx`**: Add a "Last updated" timestamp line. Add manual refresh button that calls `refetch()` (prop-drilled from page). Show loading spinner on refetch.
3. **`decision-card.tsx`**: Color-code decisions by action — NO_ACTION = muted/dimmed, LOCAL_SWAP = accent, REALLOCATE = primary, BIFROST_STRATEGY = secondary, errors = danger. Show cycle number badge prominently. Show vault snapshot stats if present (idle balance, top yield APY).
4. **`agent/page.tsx`**: Pass `refetch` down to `DecisionFeed`.

---

## Non-Goals

- No persistent storage for agent decisions (in-memory store is acceptable)
- No real APY data for UV2 pairs (simulated is fine, clearly labeled)
- No redesign of the /swap, /crosschain, or /faucet pages
- No changes to the agent's autonomous loop logic beyond decision/strategy recording
