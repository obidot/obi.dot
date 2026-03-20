# Dashboard Migration & Page Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix empty agent/strategies pages, add UV2 yields, fix protocol display names, migrate dashboard widgets to /yields, and improve the agent page UX.

**Architecture:** Six independent but sequentially ordered tasks — agent backend first (A→B→C→D), then frontend migration (E), then UI polish (F). Each task is a clean commit. Agent changes are in `modules/agent`, frontend changes in `modules/app`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Fastify (agent API), LangChain, viem, TanStack Query, Tailwind CSS v4

---

## File Map

### Created
- `modules/app/src/app/page.tsx` — replace content with redirect to `/yields`

### Modified
| File | Task | Purpose |
|---|---|---|
| `modules/agent/src/agent/loop.ts` | A, B | Wire decision + strategy logging into autonomous loop |
| `modules/agent/src/types/index.ts` | C, D | Add `protocolLabel` to yield types; add `UniswapV2Yield` type |
| `modules/agent/src/services/yield.service.ts` | C, D | Add `protocolLabel` to all yields; add `fetchUniswapV2Yields()` |
| `modules/agent/src/api/routes/yields.ts` | C, D | Expose `protocolLabel`; add `/api/yields/uniswap` endpoint |
| `modules/app/src/types/index.ts` | C, D | Mirror `protocolLabel` in frontend types; add `UniswapV2Yield` |
| `modules/app/src/lib/api.ts` | D | Add `getUniswapV2Yields()` |
| `modules/app/src/hooks/use-yields.ts` | D | Add `useUniswapV2Yields()` |
| `modules/app/src/hooks/use-strategies.ts` | B | Add agent-API fallback when indexer returns empty |
| `modules/app/src/components/yields/yield-grid.tsx` | C, D | Use `protocolLabel`; add UV2 filter tab + type pill |
| `modules/app/src/app/yields/page.tsx` | E | Full layout overhaul with dashboard widgets + sidebar |
| `modules/app/src/components/agent/agent-status.tsx` | F | GPT-4o → GPT-5-mini; add Last Cycle stat |
| `modules/app/src/components/agent/decision-feed.tsx` | F | Add refresh button + last-updated timestamp |
| `modules/app/src/components/agent/decision-card.tsx` | F | Color-code by action; show vault snapshot inline |
| `modules/app/src/app/agent/page.tsx` | F | Pass `refetch` to DecisionFeed |

---

## Task A: Wire Agent Decision Logging

**Files:**
- Modify: `modules/agent/src/agent/loop.ts`

### Context
`strategyStore.addDecision()` exists but is never called. The loop makes LLM decisions every cycle, records nothing. Fix: call it after every `invokeLlm()` return.

- [ ] **Step 1: Add import to loop.ts**

At the top of `modules/agent/src/agent/loop.ts`, after the existing imports, add:

```typescript
import { strategyStore } from "../services/strategy-store.service.js";
```

- [ ] **Step 2: Wire addDecision() after invokeLlm()**

In `runCycle()`, find the block after `invokeLlm()` returns (around line 308). The current code is:

```typescript
const decision = await this.invokeLlm(userMessage);

if (!decision) {
  loopLog.warn("LLM returned no actionable decision");
  return;
}
```

Replace it with:

```typescript
const decision = await this.invokeLlm(userMessage);

// ── Record decision (always, even NO_DECISION) ──────────────────────
const allYields = [...yields, ...(bifrostYields ?? [])];
const topYield = allYields.reduce(
  (best, y) => (y.apyPercent > (best?.apyPercent ?? -1) ? y : best),
  allYields[0] as (typeof allYields)[0] | undefined,
);

strategyStore.addDecision({
  cycle: this.cycleCount,
  action: decision?.action ?? "NO_DECISION",
  reasoning: decision?.reasoning ?? "LLM returned no actionable decision",
  timestamp: Date.now(),
  snapshot: {
    totalAssets: vaultState.totalAssets.toString(),
    idleBalance: vaultState.idleBalance.toString(),
    topYieldApy: topYield?.apyPercent.toFixed(2) ?? "0.00",
    topYieldProtocol: topYield?.name ?? "unknown",
  },
});

if (!decision) {
  loopLog.warn("LLM returned no actionable decision");
  return;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/agent run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/agent/src/agent/loop.ts
git commit -m "fix(agent): wire strategyStore.addDecision() into autonomous loop"
```

---

## Task B: Wire Strategy Recording + Frontend Fallback

**Files:**
- Modify: `modules/agent/src/agent/loop.ts`
- Modify: `modules/app/src/hooks/use-strategies.ts`

### Context
When a tool executes successfully, `strategyStore.addStrategy()` is never called. The frontend also only reads from the GraphQL indexer — it never tries the agent's `/api/strategies` endpoint.

- [ ] **Step 1: Add addStrategy() call in loop.ts**

In `runCycle()`, find the `parsed.success` block (around line 411):

```typescript
if (parsed.success) {
  loopLog.info(
    { txHash: parsed.data?.txHash, nonce: parsed.data?.nonce },
    "Strategy executed successfully on-chain",
  );

  // Track the executed strategy for outcome verification
  if (parsed.data?.nonce !== undefined) {
```

After the `loopLog.info(...)` line, insert:

```typescript
  // Record in strategy store for API consumers
  const actionTarget = (() => {
    if (decision.action === "LOCAL_SWAP") return (decision as { tokenOut: string }).tokenOut;
    if (decision.action === "REALLOCATE") return (decision as { targetProtocol: string }).targetProtocol;
    if (decision.action === "BIFROST_STRATEGY") return (decision as { strategyType: string }).strategyType;
    if (decision.action === "UNIVERSAL_INTENT") return (decision as { tokenOut: string }).tokenOut;
    return "unknown";
  })();

  strategyStore.addStrategy({
    id: parsed.data?.nonce?.toString() ?? crypto.randomUUID(),
    action: decision.action,
    target: actionTarget,
    amount: (decision as { amount?: string }).amount?.toString() ?? "0",
    reasoning: decision.reasoning,
    status: "pending",
    txHash: parsed.data?.txHash,
    timestamp: Date.now(),
  });
```

- [ ] **Step 2: Add agent-API fallback to use-strategies.ts**

Read current file first: `modules/app/src/hooks/use-strategies.ts`

Replace the entire file content with:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getIndexedStrategyExecutions,
  type IndexedStrategyExecution,
} from "@/lib/graphql";
import { API_BASE } from "@/lib/constants";

// Shape returned by the agent's in-memory /api/strategies endpoint
interface AgentStrategyRecord {
  id: string;
  action: string;
  target: string;
  amount: string;
  reasoning: string;
  status: "pending" | "executed" | "failed" | "timeout";
  txHash?: string;
  timestamp: number;
}

/** Map agent StrategyRecord → IndexedStrategyExecution shape for uniform display */
function agentRecordToIndexed(r: AgentStrategyRecord): IndexedStrategyExecution {
  return {
    id: r.id,
    txHash: r.txHash ?? "",
    blockNumber: 0,
    timestamp: new Date(r.timestamp).toISOString(),
    executor: "",
    destination: r.action,
    targetChain: "Polkadot Hub",
    protocol: r.target,
    amount: r.amount,
    profit: "0",
    success: r.status === "executed",
  };
}

async function fetchStrategies(): Promise<IndexedStrategyExecution[]> {
  // 1. Try GraphQL indexer first
  try {
    const indexed = await getIndexedStrategyExecutions(20);
    if (indexed.length > 0) return indexed;
  } catch {
    // indexer offline — fall through to agent API
  }

  // 2. Fall back to agent in-memory store
  try {
    const res = await fetch(`${API_BASE}/strategies`);
    if (!res.ok) return [];
    const envelope = (await res.json()) as {
      success: boolean;
      data?: AgentStrategyRecord[];
    };
    if (!envelope.success || !envelope.data) return [];
    return envelope.data.map(agentRecordToIndexed);
  } catch {
    return [];
  }
}

export function useStrategies(): {
  data: IndexedStrategyExecution[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["strategies"],
    queryFn: fetchStrategies,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { data, isLoading, error: error as Error | null, refetch };
}
```

- [ ] **Step 3: Typecheck both modules**

```bash
pnpm --filter @obidot/agent run typecheck && pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/agent/src/agent/loop.ts modules/app/src/hooks/use-strategies.ts
git commit -m "fix(agent,app): wire strategy recording and add agent-API fallback to strategies hook"
```

---

## Task C: Fix Protocol Display Names

**Files:**
- Modify: `modules/agent/src/types/index.ts`
- Modify: `modules/agent/src/services/yield.service.ts`
- Modify: `modules/agent/src/api/routes/yields.ts`
- Modify: `modules/app/src/types/index.ts`
- Modify: `modules/app/src/components/yields/yield-grid.tsx`

### Context
The `protocol` field is a hex address. `yield-grid.tsx` renders it raw. Fix: add `protocolLabel` string field everywhere.

- [ ] **Step 1: Add protocolLabel to agent types**

In `modules/agent/src/types/index.ts`, find the `ProtocolYield` interface and add `protocolLabel: string`:

```typescript
export interface ProtocolYield {
  name: string;
  paraId: number;
  protocol: string;        // hex address (kept for on-chain use)
  protocolLabel: string;   // human-readable display name ← ADD THIS
  apyPercent: number;
  tvlUsd: number;
  fetchedAt: Date;
}
```

Do the same for `BifrostYield` — add `protocolLabel: string` after the `protocol` field.

- [ ] **Step 2: Populate protocolLabel in yield.service.ts**

In `fetchYields()`, update the two protocol yield objects to include `protocolLabel`:

```typescript
{
  name: KNOWN_PARACHAINS.HYDRATION.name,
  paraId: KNOWN_PARACHAINS.HYDRATION.paraId,
  protocol: KNOWN_PARACHAINS.HYDRATION.protocol,
  protocolLabel: "Hydration Omnipool",   // ← ADD
  apyPercent: this.simulateApy("Hydration"),
  tvlUsd: tvl.hydration ?? this.simulateTvl(15_000_000, 25_000_000),
  fetchedAt: now,
},
{
  name: KNOWN_PARACHAINS.BIFROST.name,
  paraId: KNOWN_PARACHAINS.BIFROST.paraId,
  protocol: KNOWN_PARACHAINS.BIFROST.protocol,
  protocolLabel: "Bifrost",              // ← ADD
  apyPercent: this.simulateApy("Bifrost"),
  tvlUsd: tvl.bifrost ?? this.simulateTvl(30_000_000, 50_000_000),
  fetchedAt: now,
},
```

In `fetchBifrostYields()`, add `protocolLabel` to each entry:

| Entry | `protocolLabel` value |
|---|---|
| vDOT SLP | `"Bifrost SLP"` |
| vKSM SLP | `"Bifrost SLP"` |
| DOT/vDOT Pool | `"Bifrost DEX"` |
| BNC/DOT Pool | `"Bifrost DEX"` |
| DOT/vDOT Farm | `"Bifrost Farming"` |
| BNC/DOT Farm | `"Bifrost Farming"` |
| SALP | `"Bifrost SALP"` |

- [ ] **Step 3: Expose protocolLabel in yields API routes**

In `modules/agent/src/api/routes/yields.ts`, add `protocolLabel: y.protocolLabel` to both the `/api/yields` and `/api/yields/bifrost` response maps.

For `/api/yields`:
```typescript
data: yields.map((y) => ({
  name: y.name,
  protocol: y.protocol,
  protocolLabel: y.protocolLabel,  // ← ADD
  paraId: y.paraId,
  apyPercent: y.apyPercent,
  tvlUsd: y.tvlUsd,
  fetchedAt: y.fetchedAt.toISOString(),
})),
```

Same pattern for `/api/yields/bifrost`.

- [ ] **Step 4: Add protocolLabel to frontend types**

In `modules/app/src/types/index.ts`, find `ProtocolYield` and `BifrostYield` interfaces. Add `protocolLabel: string` to both, alongside the existing `protocol` field.

- [ ] **Step 5: Use protocolLabel in yield-grid.tsx**

In `modules/app/src/components/yields/yield-grid.tsx`, find the table row rendering (around line 246). Change:

```typescript
// Before
const initials = y.protocol.slice(0, 2).toUpperCase();
const colors = protocolColor(y.protocol);
```

To:

```typescript
// After (protocolLabel is on the type after Step 4 — no cast needed)
const label = y.protocolLabel ?? y.protocol;
const initials = label.slice(0, 2).toUpperCase();
const colors = protocolColor(label);
```

And in the Protocol cell display (around line 265) — after Step 4 adds `protocolLabel` to both frontend types, use it directly without casting:
```typescript
// After (no cast needed — protocolLabel is now on the type)
<span className="text-text-secondary font-sans text-[12px] truncate max-w-[120px]">
  {y.protocolLabel ?? y.protocol}
</span>
```

- [ ] **Step 6: Typecheck both modules**

```bash
pnpm --filter @obidot/agent run typecheck && pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add modules/agent/src/types/index.ts modules/agent/src/services/yield.service.ts modules/agent/src/api/routes/yields.ts modules/app/src/types/index.ts modules/app/src/components/yields/yield-grid.tsx
git commit -m "fix(yields): replace raw protocol hex addresses with human-readable protocolLabel"
```

---

## Task D: Add Uniswap V2 Pairs to /yields

**Files:**
- Modify: `modules/agent/src/types/index.ts`
- Modify: `modules/agent/src/services/yield.service.ts`
- Modify: `modules/agent/src/api/routes/yields.ts`
- Modify: `modules/app/src/types/index.ts`
- Modify: `modules/app/src/lib/api.ts`
- Modify: `modules/app/src/hooks/use-yields.ts`
- Modify: `modules/app/src/components/yields/yield-grid.tsx`

### Context
UV2_PAIRS (5 pairs with real on-chain addresses) exist in the agent's constants but are never surfaced as yield opportunities.

- [ ] **Step 1: Add UniswapV2Yield type to agent types**

In `modules/agent/src/types/index.ts`, add after the existing yield interfaces:

```typescript
export interface UniswapV2Yield {
  name: string;           // pair label e.g. "tDOT/tUSDC"
  protocolLabel: string;  // always "UniswapV2"
  protocol: string;       // pair contract address
  address: string;        // same as protocol
  token0: string;
  token1: string;
  reserve0: string;       // raw uint112 as string
  reserve1: string;       // raw uint112 as string
  apyPercent: number;
  tvlUsd: number;
  category: "UniswapV2";
  fetchedAt: Date;
}
```

- [ ] **Step 2: Add fetchUniswapV2Yields() to yield.service.ts**

Add the following imports at the top of `modules/agent/src/services/yield.service.ts`:

```typescript
import { createPublicClient, http, type Chain } from "viem";
import { CHAIN_ID, RPC_URL, UV2_PAIRS, UV2_PAIR_ABI } from "../config/constants.js";
import type { UniswapV2Yield } from "../types/index.js";
```

Add the chain definition near the top of the class (or as a module-level constant):

```typescript
const DOT_PRICE_USD = 8.0; // fixed estimate, clearly labeled in UI

const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};
```

Add the APY range for UV2 pairs in `APY_RANGES`:

```typescript
"UniswapV2": [3.0, 15.0],
```

Add the method to the `YieldService` class:

```typescript
async fetchUniswapV2Yields(): Promise<UniswapV2Yield[]> {
  yieldLog.info("Fetching Uniswap V2 pair yields");
  const now = new Date();

  const client = createPublicClient({
    chain: polkadotHubTestnet,
    transport: http(RPC_URL),
  });

  const results = await Promise.allSettled(
    UV2_PAIRS.map(async (pair) => {
      try {
        const [reserve0, reserve1] = await client.readContract({
          address: pair.address,
          abi: UV2_PAIR_ABI,
          functionName: "getReserves",
        });
        const totalReserveWei = reserve0 + reserve1;
        const tvlUsd = (Number(totalReserveWei) / 1e18) * DOT_PRICE_USD;
        return {
          name: pair.label,
          protocolLabel: "UniswapV2" as const,
          protocol: pair.address,
          address: pair.address,
          token0: pair.token0,
          token1: pair.token1,
          reserve0: reserve0.toString(),
          reserve1: reserve1.toString(),
          apyPercent: this.simulateApy("UniswapV2"),
          tvlUsd,
          category: "UniswapV2" as const,
          fetchedAt: now,
        } satisfies UniswapV2Yield;
      } catch {
        yieldLog.warn({ pair: pair.label }, "Failed to fetch UV2 reserves — using fallback");
        return {
          name: pair.label,
          protocolLabel: "UniswapV2" as const,
          protocol: pair.address,
          address: pair.address,
          token0: pair.token0,
          token1: pair.token1,
          reserve0: "0",
          reserve1: "0",
          apyPercent: this.simulateApy("UniswapV2"),
          tvlUsd: this.simulateTvl(500_000, 5_000_000),
          category: "UniswapV2" as const,
          fetchedAt: now,
        } satisfies UniswapV2Yield;
      }
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<UniswapV2Yield> => r.status === "fulfilled")
    .map((r) => r.value);
}
```

- [ ] **Step 3: Add /api/yields/uniswap endpoint**

In `modules/agent/src/api/routes/yields.ts`, update the function signature to accept `yieldService` and add the new endpoint. Find `registerYieldRoutes` and add after the existing bifrost route:

```typescript
/** GET /api/yields/uniswap — UniswapV2 pair yield data. */
app.get("/api/yields/uniswap", async () => {
  try {
    const uniswapYields = await yieldService.fetchUniswapV2Yields();
    return {
      success: true,
      data: uniswapYields.map((y) => ({
        name: y.name,
        protocolLabel: y.protocolLabel,
        protocol: y.protocol,
        address: y.address,
        token0: y.token0,
        token1: y.token1,
        reserve0: y.reserve0,
        reserve1: y.reserve1,
        apyPercent: y.apyPercent,
        tvlUsd: y.tvlUsd,
        category: y.category,
        fetchedAt: y.fetchedAt.toISOString(),
      })),
      timestamp: Date.now(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
});
```

- [ ] **Step 4: Add UniswapV2Yield type to frontend types**

In `modules/app/src/types/index.ts`, add:

```typescript
export interface UniswapV2Yield {
  name: string;
  protocolLabel: string;
  protocol: string;
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  apyPercent: number;
  tvlUsd: number;
  category: "UniswapV2";
  fetchedAt: string;
}
```

- [ ] **Step 5: Add API function in lib/api.ts**

In `modules/app/src/lib/api.ts`, add after `getBifrostYields`:

```typescript
export async function getUniswapV2Yields(): Promise<UniswapV2Yield[]> {
  return fetchJson<UniswapV2Yield[]>("/yields/uniswap");
}
```

Also add the import: `import type { ..., UniswapV2Yield } from "@/types";`

- [ ] **Step 6: Add hook in use-yields.ts**

In `modules/app/src/hooks/use-yields.ts`, add:

```typescript
import { getYields, getBifrostYields, getUniswapV2Yields } from "@/lib/api";

export function useUniswapV2Yields() {
  return useQuery({
    queryKey: ["yields", "uniswap"],
    queryFn: getUniswapV2Yields,
    retry: 1,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 7: Add UniswapV2 to YieldGrid**

In `modules/app/src/components/yields/yield-grid.tsx`:

1. Add `"UniswapV2"` to `TypePill` styles:

```typescript
UniswapV2: "bg-warning/10 text-warning border-warning/20",
```

2. Add `uniswapV2Yields` prop to `YieldGridProps`:

```typescript
interface YieldGridProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  uniswapV2Yields: UniswapV2Yield[];  // ← ADD
}
```

3. Expand the `YieldItem` union and add UV2 merging to the `combined` useMemo — **no unsafe casts**:

First update the local `YieldItem` type inside the useMemo:

```typescript
type YieldItem = {
  yield_: ProtocolYield | BifrostYield | UniswapV2Yield;
  isBifrost: boolean;
  isUniswap?: boolean;
  category?: "SLP" | "DEX" | "Farming" | "SALP" | "UniswapV2";
};
```

Then add UV2 items (only for `"all"` and `"uniswap"` filter tabs):

```typescript
if (filter === "all" || filter === "uniswap") {
  items.push(
    ...uniswapV2Yields.map((y) => ({
      yield_: y,
      isBifrost: false,
      isUniswap: true,
      category: "UniswapV2" as const,
    })),
  );
}
```

4. Add `"UniswapV2"` to `FILTER_TABS`:

```typescript
{ key: "uniswap" as SourceFilter, label: "UniswapV2" },
```

And update `SourceFilter` type:

```typescript
type SourceFilter = "all" | "bifrost" | "defi" | "uniswap";
```

Update filter logic for `uniswap` tab.

- [ ] **Step 8: Update /yields/page.tsx to pass uniswapV2Yields to YieldGrid**

In `modules/app/src/app/yields/page.tsx`, add the UV2 hook and pass the data (this will be further updated in Task E).

- [ ] **Step 9: Typecheck both modules**

```bash
pnpm --filter @obidot/agent run typecheck && pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add modules/agent/src/types/index.ts modules/agent/src/services/yield.service.ts modules/agent/src/api/routes/yields.ts modules/app/src/types/index.ts modules/app/src/lib/api.ts modules/app/src/hooks/use-yields.ts modules/app/src/components/yields/yield-grid.tsx
git commit -m "feat(yields): add Uniswap V2 pair yields to /yields page"
```

---

## Task E: Migrate Dashboard → /yields

**Files:**
- Modify: `modules/app/src/app/yields/page.tsx`
- Modify: `modules/app/src/app/page.tsx` (replace with redirect)

### Context
All dashboard widgets (VaultOverview, QuickStats, PnlChart, VaultActions, UserPosition, HealthIndicators, RecentActivity) move to /yields. Root page becomes a redirect.

- [ ] **Step 1: Rewrite /yields/page.tsx**

Replace the entire contents of `modules/app/src/app/yields/page.tsx`:

```tsx
"use client";

import { useYields, useBifrostYields, useUniswapV2Yields } from "@/hooks/use-yields";
import { YieldGrid } from "@/components/yields/yield-grid";
import { VaultOverview } from "@/components/dashboard/vault-overview";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { VaultActions } from "@/components/dashboard/vault-actions";
import { UserPosition } from "@/components/dashboard/user-position";
import { HealthIndicators } from "@/components/dashboard/health-indicators";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getIndexedDeposits,
  getIndexedSwapExecutions,
  type IndexedDeposit,
  type IndexedSwapExecution,
} from "@/lib/graphql";
import { formatUnits } from "viem";

/** Simple relative-time formatter */
function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RecentActivity() {
  const { data: deposits, isLoading: depositsLoading } = useQuery({
    queryKey: ["indexed", "recent-deposits"],
    queryFn: () => getIndexedDeposits(5),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: swaps, isLoading: swapsLoading } = useQuery({
    queryKey: ["indexed", "recent-swaps"],
    queryFn: () => getIndexedSwapExecutions(5),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const isLoading = depositsLoading || swapsLoading;
  const hasData =
    (deposits && deposits.length > 0) || (swaps && swaps.length > 0);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-muted mb-3">
          Recent Activity
        </h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded bg-surface-hover animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) return null;

  type ActivityItem =
    | { kind: "deposit"; item: IndexedDeposit }
    | { kind: "swap"; item: IndexedSwapExecution };

  const activity: ActivityItem[] = [
    ...(deposits ?? []).map((d): ActivityItem => ({ kind: "deposit", item: d })),
    ...(swaps ?? []).map((s): ActivityItem => ({ kind: "swap", item: s })),
  ].sort(
    (a, b) =>
      new Date(b.item.timestamp).getTime() - new Date(a.item.timestamp).getTime(),
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-muted mb-3">
        Recent Activity
      </h3>
      <div className="space-y-1">
        {activity.slice(0, 8).map((entry) => {
          if (entry.kind === "deposit") {
            const d = entry.item;
            const amt = parseFloat(formatUnits(BigInt(d.assets), 18)).toFixed(4);
            const when = timeAgo(d.timestamp);
            return (
              <div key={`deposit-${d.id}`} className="flex items-center justify-between py-1 text-[12px]">
                <span className="font-mono text-primary">+ {amt} tDOT</span>
                <span className="font-mono text-[10px] text-text-muted truncate max-w-[120px]">
                  {d.sender.slice(0, 6)}…{d.sender.slice(-4)}
                </span>
                <span className="text-[10px] text-text-muted">{when}</span>
              </div>
            );
          } else {
            const s = entry.item;
            const amtIn = parseFloat(formatUnits(BigInt(s.amountIn), 18)).toFixed(4);
            const amtOut = parseFloat(formatUnits(BigInt(s.amountOut), 18)).toFixed(4);
            const when = timeAgo(s.timestamp);
            return (
              <div key={`swap-${s.id}`} className="flex items-center justify-between py-1 text-[12px]">
                <span className="font-mono text-accent">{amtIn} → {amtOut}</span>
                <span className="font-mono text-[10px] text-text-muted">{s.poolType}</span>
                <span className="text-[10px] text-text-muted">{when}</span>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}

export default function YieldsPage() {
  const { data: yields, isLoading: yLoading, error: yError, refetch: yRefetch } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();
  const { data: uniswap, isLoading: uLoading } = useUniswapV2Yields();

  const isLoading = yLoading || bLoading || uLoading;

  return (
    <div className="space-y-4">
      {/* Vault hero banner */}
      <VaultOverview />

      {/* Main grid: chart + yield table left, vault actions right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-[1px] overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-[1fr_300px]">
            <div className="flex flex-col bg-surface">
              <QuickStats />
              <PnlChart />
            </div>
          </div>

          {isLoading ? (
            <PanelSkeleton rows={6} />
          ) : yError ? (
            <div className="panel rounded-lg p-8 text-center">
              <p className="font-mono text-sm text-danger">Failed to load yields</p>
              <button
                type="button"
                onClick={() => yRefetch()}
                className="btn-ghost mt-4 inline-flex items-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <YieldGrid
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
              uniswapV2Yields={uniswap ?? []}
            />
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-[1px] overflow-hidden rounded-lg border border-border bg-border">
          <div className="bg-surface">
            <VaultActions />
          </div>
          <div className="bg-surface">
            <UserPosition />
          </div>
          <div className="border-t border-border bg-surface">
            <HealthIndicators />
          </div>
        </div>
      </div>

      {/* Recent on-chain activity */}
      <RecentActivity />
    </div>
  );
}
```

- [ ] **Step 2: Replace root page.tsx with redirect**

Replace the entire contents of `modules/app/src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/yields");
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/app/yields/page.tsx modules/app/src/app/page.tsx
git commit -m "feat(app): migrate dashboard to /yields page, redirect root to /yields"
```

---

## Task F: Agent Page UI/UX Improvements

**Files:**
- Modify: `modules/app/src/components/agent/agent-status.tsx`
- Modify: `modules/app/src/components/agent/decision-feed.tsx`
- Modify: `modules/app/src/components/agent/decision-card.tsx`
- Modify: `modules/app/src/app/agent/page.tsx`

### Context
"GPT-4o" is hardcoded. The decision feed has no refresh button or last-updated info. Decision cards lack color-coding for LOCAL_SWAP and richer snapshot display.

- [ ] **Step 1: Fix agent-status.tsx — GPT-5-mini + Last Cycle stat**

Read `modules/app/src/components/agent/agent-status.tsx` first.

Change the hardcoded `"GPT-4o"` string to `"GPT-5-mini"` (line 77).

Add a "Last Cycle" stat cell. The component already receives `decisions`. Add this as a 5th cell (make it `grid-cols-2 md:grid-cols-5` or keep 4-col by replacing "Mode" with "Last Cycle"):

```tsx
{/* Last Cycle */}
<div className="flex items-center gap-3 bg-surface px-4 py-3">
  <Clock className="h-4 w-4 text-text-muted" />
  <div>
    <p className="text-[10px] uppercase tracking-wider text-text-muted">
      Last Cycle
    </p>
    <p className="font-mono text-sm font-semibold text-text-primary">
      {lastTimestamp > 0 ? timeAgo(lastTimestamp) : "—"}
    </p>
  </div>
</div>
```

Add `import { Cpu, Zap, Radio, Clock } from "lucide-react";` and the `timeAgo` helper:

```typescript
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
```

Update grid to `md:grid-cols-5` (or keep 4 and swap out "Mode").

- [ ] **Step 2: Update decision-card.tsx — color-code LOCAL_SWAP**

Read `modules/app/src/components/agent/decision-card.tsx`.

Find the `ACTION_CONFIG` object. Add a `LOCAL_SWAP` entry:

```typescript
LOCAL_SWAP: {
  label: "Local Swap",
  color: "text-accent",
  bg: "bg-accent/10",
  border: "border-accent/20",
},
```

Also ensure the vault snapshot data (if present) is displayed in the card body:

```tsx
{decision.snapshot && (
  <div className="mt-2 flex gap-3 text-[10px] font-mono text-text-muted">
    <span>Idle: {formatTokenAmount(decision.snapshot.idleBalance)}</span>
    <span>Top APY: {decision.snapshot.topYieldApy}% {decision.snapshot.topYieldProtocol}</span>
  </div>
)}
```

Note: `formatTokenAmount` is **already imported** from `@/lib/format` in the existing file. Do NOT add a local definition — use the existing import directly.

- [ ] **Step 3: Update decision-feed.tsx — refresh button + last updated**

Read `modules/app/src/components/agent/decision-feed.tsx`.

Add a `refetch` prop (optional with a no-op default to keep the type safe while the page is updated in Step 4) and `isRefetching` prop:

```typescript
export function DecisionFeed({
  decisions,
  refetch = () => {},
  isRefetching = false,
}: {
  decisions: AgentDecision[];
  refetch?: () => void;
  isRefetching?: boolean;
}) {
```

In the header section, add a refresh button:

```tsx
<div className="flex items-center gap-2">
  <span className="font-mono text-[10px] text-text-muted">
    {decisions.length > 0
      ? `Updated ${timeAgo(decisions[0].timestamp)}`
      : "No data yet"}
  </span>
  <button
    type="button"
    onClick={refetch}
    disabled={isRefetching}
    className="btn-ghost p-1"
    aria-label="Refresh decisions"
  >
    <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
  </button>
</div>
```

Add imports: `import { RefreshCw } from "lucide-react";` and the `timeAgo` helper (same as in agent-status).

- [ ] **Step 4: Pass refetch to DecisionFeed in agent/page.tsx**

Read `modules/app/src/app/agent/page.tsx`.

Update `useAgentLog` usage and pass `refetch` + `isFetching` to `DecisionFeed`:

```tsx
const { data: decisions, isLoading, error, refetch, isFetching } = useAgentLog();

// In the JSX:
<DecisionFeed
  decisions={decisions ?? []}
  refetch={refetch}
  isRefetching={isFetching}
/>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add modules/app/src/components/agent/agent-status.tsx modules/app/src/components/agent/decision-feed.tsx modules/app/src/components/agent/decision-card.tsx modules/app/src/app/agent/page.tsx
git commit -m "feat(agent-page): GPT-5-mini label, refresh button, color-coded decisions, vault snapshot display"
```

---

## Final Verification

- [ ] **Run all typechecks**

```bash
pnpm --filter @obidot/agent run typecheck && pnpm --filter @obidot/app run typecheck
```

- [ ] **Run linting**

```bash
pnpm --filter @obidot/agent run lint && pnpm --filter @obidot/app run lint
```

- [ ] **Manual smoke test checklist**
  - Navigate to `/` → should redirect to `/yields`
  - `/yields` shows VaultOverview, PnlChart, VaultActions sidebar, YieldGrid with protocol names (not hex addresses), UV2 tab
  - `/strategies` shows either indexed data or agent in-memory data (not "No strategies yet" if agent has run)
  - `/agent` shows decisions after the next loop cycle completes, refresh button works, "GPT-5-mini" label correct
