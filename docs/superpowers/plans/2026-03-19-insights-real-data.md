# Insights Real Data & Text Size Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Insights page to real on-chain data from obi.index GraphQL, add a live Protocol Activity panel, and increase all text sizes for readability.

**Architecture:** New `useProtocolActivity` hook fetches `vaultStats` + recent swaps/deposits from obi.index via `lib/graphql.ts` existing queries, combined with `useSwapSubscription` for live updates. New `ProtocolActivity` component renders stat cards + activity feed. All 6 existing Insights components get a systematic text size bump. MarketPulse gets a new `recentSwapCount` prop for an additional sentiment factor.

**Tech Stack:** Next.js 15, React, TanStack Query (`useQuery`), wagmi, obi.index GraphQL (HTTP + WS via `graphql-ws`), Tailwind CSS v4, lucide-react icons.

---

## File Structure

**New files:**
- `src/hooks/use-protocol-activity.ts` — Hook fetching vault stats, recent swaps, recent deposits from obi.index; wires `useSwapSubscription` for live counter increment
- `src/components/insights/protocol-activity.tsx` — Full-width panel: 6 stat cards + 5-item live activity feed

**Modified files:**
- `src/app/insights/page.tsx` — Import and render `ProtocolActivity` as first row; pass `recentSwapCount` to `MarketPulse`
- `src/components/insights/market-pulse.tsx` — Add `recentSwapCount` prop, new "Swap Volume" factor; text size bump
- `src/components/insights/opportunity-radar.tsx` — Text size bump only
- `src/components/insights/risk-matrix.tsx` — Text size bump only
- `src/components/insights/position-simulator.tsx` — Text size bump only
- `src/components/insights/portfolio-optimizer.tsx` — Text size bump only
- `src/components/insights/yield-comparison.tsx` — Text size bump only

---

### Task 1: Create `useProtocolActivity` hook

**Files:**
- Create: `modules/app/src/hooks/use-protocol-activity.ts`

- [ ] **Step 1: Create the hook file**

```typescript
"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getIndexedVaultStats,
  getIndexedSwapExecutions,
  getIndexedDeposits,
  type IndexedVaultStats,
  type IndexedSwapExecution,
  type IndexedDeposit,
} from "@/lib/graphql";
import {
  useSwapSubscription,
  type SwapEvent,
} from "@/hooks/use-graphql-subscription";
import { formatUnits } from "viem";

export interface ProtocolActivityData {
  stats: IndexedVaultStats;
  recentSwaps: IndexedSwapExecution[];
  recentDeposits: IndexedDeposit[];
  recentVolume: string;
  liveSwapCount: number;
}

function calcVolume(swaps: IndexedSwapExecution[]): string {
  const total = swaps.reduce((sum, s) => sum + BigInt(s.amountIn), 0n);
  return parseFloat(formatUnits(total, 18)).toFixed(2);
}

export function useProtocolActivity() {
  const [liveSwapCount, setLiveSwapCount] = useState(0);
  const [liveSwaps, setLiveSwaps] = useState<IndexedSwapExecution[]>([]);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["protocol-activity-stats"],
    queryFn: getIndexedVaultStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: recentSwaps, isLoading: swapsLoading } = useQuery({
    queryKey: ["protocol-activity-swaps"],
    queryFn: () => getIndexedSwapExecutions(20),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: recentDeposits } = useQuery({
    queryKey: ["protocol-activity-deposits"],
    queryFn: () => getIndexedDeposits(10),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const handleSwapEvent = useCallback((event: SwapEvent) => {
    setLiveSwapCount((prev) => prev + 1);
    const asIndexed: IndexedSwapExecution = {
      id: event.id,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      tokenIn: event.tokenIn,
      tokenOut: event.tokenOut,
      amountIn: event.amountIn,
      amountOut: event.amountOut,
      recipient: event.recipient,
      poolType: event.poolType,
      hops: 1,
    };
    setLiveSwaps((prev) => [asIndexed, ...prev.slice(0, 4)]);
  }, []);

  const { connected } = useSwapSubscription(handleSwapEvent);

  const allSwaps = [
    ...liveSwaps,
    ...(recentSwaps ?? []),
  ].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  const data: ProtocolActivityData | null =
    stats && recentSwaps
      ? {
          stats: {
            ...stats,
            totalSwaps: stats.totalSwaps + liveSwapCount,
          },
          recentSwaps: allSwaps,
          recentDeposits: recentDeposits ?? [],
          recentVolume: calcVolume(allSwaps.slice(0, 20)),
          liveSwapCount,
        }
      : null;

  return {
    data,
    isLoading: statsLoading || swapsLoading,
    error: statsError,
    connected,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/hooks/use-protocol-activity.ts
git commit -m "feat(app): add useProtocolActivity hook — obi.index stats + live swap subscription"
```

---

### Task 2: Create `ProtocolActivity` component

**Files:**
- Create: `modules/app/src/components/insights/protocol-activity.tsx`

- [ ] **Step 1: Create the component file**

```typescript
"use client";

import { formatUnits } from "viem";
import { cn } from "@/lib/format";
import type { ProtocolActivityData } from "@/hooks/use-protocol-activity";
import type { IndexedSwapExecution } from "@/lib/graphql";
import {
  ArrowRightLeft,
  Landmark,
  ArrowUpFromLine,
  Compass,
  Globe,
  BarChart3,
  Loader2,
  ExternalLink,
  Activity,
} from "lucide-react";
import { CHAIN } from "@/lib/constants";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 border border-border bg-surface p-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-md", color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <p className="font-mono text-lg font-bold text-text-primary">{value}</p>
      </div>
    </div>
  );
}

function SwapFeedRow({ swap }: { swap: IndexedSwapExecution }) {
  const amtIn = parseFloat(formatUnits(BigInt(swap.amountIn), 18)).toFixed(4);
  const amtOut = parseFloat(formatUnits(BigInt(swap.amountOut), 18)).toFixed(4);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-sm text-text-primary">
          {amtIn} → {amtOut}
        </p>
        <p className="text-xs text-text-muted">
          {swap.poolType} · {timeAgo(swap.timestamp)}
        </p>
      </div>
      <a
        href={`${CHAIN.blockExplorer}/tx/${swap.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-xs text-text-muted hover:text-primary transition-colors shrink-0 ml-3"
      >
        {swap.txHash.slice(0, 6)}…{swap.txHash.slice(-4)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

interface ProtocolActivityProps {
  data: ProtocolActivityData | null;
  isLoading: boolean;
  error: Error | null;
  connected: boolean;
}

export function ProtocolActivity({ data, isLoading, error, connected }: ProtocolActivityProps) {
  if (isLoading) {
    return (
      <div className="panel rounded-lg flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel rounded-lg p-8 text-center">
        <p className="font-mono text-sm text-danger">
          Indexer unavailable — on-chain stats could not be loaded
        </p>
      </div>
    );
  }

  const { stats, recentSwaps, recentVolume } = data;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Protocol Activity
            </h3>
            <p className="font-mono text-xs text-text-muted">
              On-chain stats from obi.index
            </p>
          </div>
        </div>
        {!connected && (
          <span className="font-mono text-xs text-text-muted animate-pulse">
            Live updates paused
          </span>
        )}
        {connected && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-xs text-text-muted">Live</span>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
          label="Total Swaps"
          value={stats.totalSwaps.toLocaleString()}
          color="bg-primary/10"
        />
        <StatCard
          icon={<Landmark className="h-4 w-4 text-accent" />}
          label="Total Deposits"
          value={stats.totalDeposits.toLocaleString()}
          color="bg-accent/10"
        />
        <StatCard
          icon={<ArrowUpFromLine className="h-4 w-4 text-secondary" />}
          label="Withdrawals"
          value={stats.totalWithdrawals.toLocaleString()}
          color="bg-secondary/10"
        />
        <StatCard
          icon={<Compass className="h-4 w-4 text-warning" />}
          label="Strategies"
          value={stats.totalStrategies.toLocaleString()}
          color="bg-warning/10"
        />
        <StatCard
          icon={<Globe className="h-4 w-4 text-accent" />}
          label="Cross-chain"
          value={stats.totalCrossChainMessages.toLocaleString()}
          color="bg-accent/10"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          label="Recent Volume"
          value={`${recentVolume} tDOT`}
          color="bg-primary/10"
        />
      </div>

      {/* Recent Activity Feed */}
      {recentSwaps.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-xs uppercase tracking-wider text-text-muted mb-2">
            Recent Swaps
          </p>
          {recentSwaps.slice(0, 5).map((s) => (
            <SwapFeedRow key={s.id} swap={s} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/protocol-activity.tsx
git commit -m "feat(app): add ProtocolActivity panel — on-chain stat cards + live swap feed"
```

---

### Task 3: Wire ProtocolActivity into Insights page + MarketPulse swap factor

**Files:**
- Modify: `modules/app/src/app/insights/page.tsx`
- Modify: `modules/app/src/components/insights/market-pulse.tsx`

- [ ] **Step 1: Update `insights/page.tsx`**

Add imports at the top of the file (after existing imports):
```typescript
import { useProtocolActivity } from "@/hooks/use-protocol-activity";
import { ProtocolActivity } from "@/components/insights/protocol-activity";
```

Inside `InsightsPage()`, add the hook call after the existing hooks (after line 19 `const { data: decisions } = useAgentLog();`):
```typescript
const { data: activity, isLoading: actLoading, error: actError, connected: actConnected } = useProtocolActivity();
```

Update the `isLoading` check (line 21) to include `actLoading`:
```typescript
const isLoading = yLoading || bLoading || actLoading;
```

Inside the main content `<div className="space-y-4">` (line 47), add Protocol Activity as the first child (before the MarketPulse + OpportunityRadar grid):
```tsx
{/* Row 0: Protocol Activity (full width) */}
<ProtocolActivity
  data={activity ?? null}
  isLoading={actLoading}
  error={actError ?? null}
  connected={actConnected}
/>
```

Update the `<MarketPulse>` call to pass `recentSwapCount`:
```tsx
<MarketPulse
  decisions={decisions ?? []}
  yields={yields ?? []}
  bifrostYields={bifrost ?? []}
  recentSwapCount={activity?.stats.totalSwaps ?? 0}
/>
```

- [ ] **Step 2: Update `market-pulse.tsx` to accept `recentSwapCount` and add new factor**

Add `recentSwapCount: number;` to the `MarketPulseProps` interface:
```typescript
interface MarketPulseProps {
  decisions: AgentDecision[];
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  recentSwapCount: number;
}
```

Update `computePulse` signature to accept `recentSwapCount: number` as 4th parameter.

After the "Diversity" factor (line 86), add a new factor:
```typescript
// Factor 5: On-chain swap volume — more swaps = more active ecosystem
const volumeSignal = recentSwapCount > 100 ? 20 : recentSwapCount > 30 ? 10 : recentSwapCount > 5 ? 0 : -10;
factors.push({
  name: "Swap Volume",
  value: volumeSignal,
  description: `${recentSwapCount} swaps recorded on-chain — ${volumeSignal > 0 ? "high activity" : "low activity"}`,
});
```

Update the `useMemo` call to include `recentSwapCount`:
```typescript
const pulse = useMemo(
  () => computePulse(decisions, yields, bifrostYields, recentSwapCount),
  [decisions, yields, bifrostYields, recentSwapCount],
);
```

Update the component destructuring to include `recentSwapCount`:
```typescript
export function MarketPulse({
  decisions,
  yields,
  bifrostYields,
  recentSwapCount,
}: MarketPulseProps) {
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/app/insights/page.tsx modules/app/src/components/insights/market-pulse.tsx
git commit -m "feat(app): wire ProtocolActivity into Insights page + add swap volume factor to MarketPulse"
```

---

### Task 4: Text size bump — `market-pulse.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/market-pulse.tsx`

Apply these replacements across the file:

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 130 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 133 | `text-[9px]` (subtitle) | `text-xs` |
| 141 | `text-sm font-bold` (sentiment label) | `text-base font-bold` |
| 144 | `text-[9px]` (score) | `text-xs` |
| 167 | `text-[8px]` (Bearish) | `text-[10px]` |
| 168 | `text-[8px]` (Neutral) | `text-[10px]` |
| 169 | `text-[8px]` (Bullish) | `text-[10px]` |
| 178 | `text-[10px]` (factor names) | `text-xs` |
| 193 | `text-[9px]` (factor value) | `text-xs` |
| 203 | `text-[9px]` (agent activity) | `text-xs` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/market-pulse.tsx
git commit -m "style(app): increase text sizes in MarketPulse panel for readability"
```

---

### Task 5: Text size bump — `opportunity-radar.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/opportunity-radar.tsx`

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 93 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 96 | `text-[9px]` (subtitle) | `text-xs` |
| 102 | `text-[9px]` (Avg Score label) | `text-xs` |
| 125 | `text-[10px]` (rank circle) | `text-xs` |
| 139 | `text-[9px]` (score number) | `text-xs` |
| 152 | `text-[9px]` (signal badge) | `text-[11px]` |
| 161 | `text-[9px]` (recommendation) | `text-xs` |
| 171 | `text-[9px]` (TVL) | `text-xs` |
| 184, 194 | `text-[9px]` (footer score formula) | `text-[11px]` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/opportunity-radar.tsx
git commit -m "style(app): increase text sizes in OpportunityRadar panel for readability"
```

---

### Task 6: Text size bump — `risk-matrix.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/risk-matrix.tsx`

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 44 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 47 | `text-[9px]` (subtitle) | `text-xs` |
| 71 | `text-[9px]` (quadrant labels) | `text-xs` |
| 74 | `text-[7px]` (quadrant desc) | `text-[10px]` |
| 109 | `text-[10px]` (tooltip name) | `text-xs` |
| 113 | `text-[9px]` (tooltip risk) | `text-xs` |
| 116 | `text-[8px]` (tooltip tier pill) | `text-[10px]` |
| 121–124 | `text-[9px]` (tooltip APY, TVL) | `text-xs` |
| 135, 140 | `text-[9px]` (axis labels) | `text-xs` |
| 185 | `text-[9px]` (tier pill in table) | `text-[11px]` |
| 205 | `text-[9px]` (risk bar value) | `text-xs` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/risk-matrix.tsx
git commit -m "style(app): increase text sizes in RiskMatrix panel for readability"
```

---

### Task 7: Text size bump — `position-simulator.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/position-simulator.tsx`

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 85 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 88 | `text-[9px]` (subtitle) | `text-xs` |
| 99, 117, 149 | `text-[10px]` (control labels) | `text-xs` |
| 135 | `text-[9px]` (amount presets) | `text-[11px]` |
| 159 | `text-[10px]` (duration presets) | `text-xs` |
| 205 | `text-[10px]` (confidence label) | `text-xs` |
| 225 | `text-[10px]` (confidence case label) | `text-xs` |
| 235 | `text-[9px]` (confidence APY) | `text-xs` |
| 244 | `text-[10px]` (confidence return) | `text-xs` |
| 260 | `text-[10px]` (timeline label) | `text-xs` |
| 264 | `text-[9px]` (daily/monthly yields) | `text-xs` |
| 286 | `text-[8px]` (bar tooltip) | `text-[11px]` |
| 315 | `text-[9px]` (result card label) | `text-xs` |
| 323 | `text-[9px]` (result card sub) | `text-xs` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/position-simulator.tsx
git commit -m "style(app): increase text sizes in PositionSimulator panel for readability"
```

---

### Task 8: Text size bump — `portfolio-optimizer.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/portfolio-optimizer.tsx`

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 137 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 140 | `text-[9px]` (subtitle) | `text-xs` |
| 147 | `text-[9px]` (Weighted APY label) | `text-xs` |
| 217 | `text-[10px]` (recommendation text) | `text-xs` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/portfolio-optimizer.tsx
git commit -m "style(app): increase text sizes in PortfolioOptimizer panel for readability"
```

---

### Task 9: Text size bump — `yield-comparison.tsx`

**Files:**
- Modify: `modules/app/src/components/insights/yield-comparison.tsx`

- [ ] **Step 1: Apply text size changes**

| Line | Old class | New class |
|------|-----------|-----------|
| 73 | `text-sm font-semibold` (h3 title) | `text-base font-semibold` |
| 76 | `text-[9px]` (subtitle) | `text-xs` |
| 86 | `text-[9px]` (Protocol A label) | `text-xs` |
| 102 | `text-[9px]` (Protocol B label) | `text-xs` |
| 131 | `text-[10px]` (dimension label) | `text-xs` |
| 162 | `text-[9px]` (legend A name) | `text-xs` |
| 166 | `text-[9px]` (legend B name) | `text-xs` |
| 230 | `text-[10px]` (CompRow metric label) | `text-xs` |
| 241 | `text-[9px]` (neutral dash) | `text-xs` |

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @obidot/app run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/insights/yield-comparison.tsx
git commit -m "style(app): increase text sizes in YieldComparison panel for readability"
```
