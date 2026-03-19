# Insights Real Data & Text Size Upgrade — Design Spec
**Date:** 2026-03-19
**Status:** Approved

## Goal

Replace computed-only heuristics in the Insights page with real on-chain data from obi.index GraphQL, add a new Protocol Activity stats panel, wire real-time subscriptions for live updates, and increase all text sizes for readability.

## Current State

The Insights page has 6 panels fed by the agent API (`/api/yields`, `/api/yields/bifrost`, `/api/agent/log`) and on-chain vault reads. This data is **real** — but the Insights page never queries **obi.index** for on-chain activity (swap volume, deposit counts, strategy executions) despite the GraphQL queries being available in `lib/graphql.ts`. No subscriptions are wired for live updates.

Text sizes are very small: titles at `text-sm`, subtitles at `text-[9px]`, metric labels at `text-[10px]`, table data at `text-xs`, legends at `text-[7px]`–`text-[8px]`.

## Changes

### 1. New `ProtocolActivity` panel — on-chain stats from obi.index

A new full-width panel at the top of the Insights page showing real protocol stats:

**Data source:** `getIndexedVaultStats()` + `getIndexedSwapExecutions(20)` + `getIndexedDeposits(10)`

**Layout:** 6 stat cards in a 3×2 grid (or 6-col on large screens):
- Total Swaps (count)
- Total Deposits (count)
- Total Withdrawals (count)
- Total Strategies (count)
- Total Cross-chain Messages (count)
- Recent Volume (sum of last 20 swap `amountIn` values, formatted in tDOT)

Below the stat cards: a "Recent Activity" feed showing the last 5 swaps with timestamp, amount, pool type, and truncated txHash linking to blockscout. This feed updates live via `useSwapSubscription`.

**Hook:** `useProtocolActivity()` — fetches `vaultStats`, recent swaps, and recent deposits via `useQuery` with 30s staleTime. Combines with a `useSwapSubscription` callback that increments the `totalSwaps` counter and prepends to the recent feed.

### 2. Wire `useSwapSubscription` to MarketPulse

Add a new factor to the MarketPulse sentiment: **"Swap Volume"** — based on the count of recent swaps from obi.index. More swaps = more active ecosystem = bullish signal.

Pass a `recentSwapCount: number` prop to `MarketPulse`. The Insights page fetches this from `getIndexedVaultStats().totalSwaps`.

### 3. Text size increase across all 6 existing components

Systematic bump for every text element in the Insights components:

| Element | Old | New |
|---------|-----|-----|
| Panel title (`h3`) | `text-sm` | `text-base` |
| Subtitle/description | `text-[9px]` | `text-xs` |
| Metric labels | `text-[10px]` | `text-xs` |
| Metric values | `text-xs`–`text-lg` | `text-sm`–`text-xl` |
| Table headers | `text-[10px]` | `text-xs` |
| Table/row data | `text-xs` | `text-sm` |
| Factor names | `text-[10px]` | `text-xs` |
| Score/small text | `text-[9px]` | `text-xs` |
| Axis/legend text | `text-[7px]`–`text-[8px]` | `text-[10px]` |
| Rank circles | `text-[10px]` | `text-xs` |
| Recommendation | `text-[9px]` | `text-xs` |
| Footer/attribution | `text-[9px]` | `text-[11px]` |

**Files affected:** All 6 in `components/insights/`:
- `market-pulse.tsx`
- `opportunity-radar.tsx`
- `risk-matrix.tsx`
- `position-simulator.tsx`
- `portfolio-optimizer.tsx`
- `yield-comparison.tsx`

### 4. Page-level data integration

**`app/insights/page.tsx`** changes:
- Add `useProtocolActivity()` hook call
- Add `<ProtocolActivity />` as the first row (full-width, above MarketPulse)
- Pass `recentSwapCount` to `<MarketPulse />`

## Architecture

### New files
- `src/hooks/use-protocol-activity.ts` — fetches vault stats + recent swaps/deposits, wires `useSwapSubscription` for live counter
- `src/components/insights/protocol-activity.tsx` — stat cards + live activity feed

### Modified files
- `src/app/insights/page.tsx` — add ProtocolActivity panel, pass swap count to MarketPulse
- `src/components/insights/market-pulse.tsx` — add `recentSwapCount` prop + "Swap Volume" factor + text size bump
- `src/components/insights/opportunity-radar.tsx` — text size bump
- `src/components/insights/risk-matrix.tsx` — text size bump
- `src/components/insights/position-simulator.tsx` — text size bump
- `src/components/insights/portfolio-optimizer.tsx` — text size bump
- `src/components/insights/yield-comparison.tsx` — text size bump

### Data flow

```
obi.index GraphQL HTTP (on mount, 30s staleTime)
  ├─ getIndexedVaultStats() → stat card counts
  ├─ getIndexedSwapExecutions(20) → recent activity feed + volume calc
  └─ getIndexedDeposits(10) → deposit activity

obi.index GraphQL WS (singleton _client)
  └─ useSwapSubscription → increment totalSwaps counter + prepend to feed

Agent API (existing, unchanged)
  ├─ /api/yields → yield panels
  ├─ /api/yields/bifrost → bifrost yield panels
  └─ /api/agent/log → agent decisions for MarketPulse
```

## Constraints

- No new pages, no new nav items
- Follow existing patterns: `useQuery` from TanStack, Tailwind design tokens, `font-mono` for numbers
- Reuse `getIndexedVaultStats`, `getIndexedSwapExecutions`, `getIndexedDeposits` from `lib/graphql.ts` — no new GraphQL queries needed
- Reuse `useSwapSubscription` from `hooks/use-graphql-subscription.ts` — no new subscriptions needed
- Text size changes are CSS-only — no logic changes in the 6 existing panels (except MarketPulse which gets a new prop)

## Error Handling

- `useProtocolActivity`: if obi.index is down, show "Indexer unavailable" in the panel with a retry button; yield-based panels below still work independently
- Live subscription disconnects: show "Live updates paused" indicator; stat cards show stale data from last HTTP fetch
