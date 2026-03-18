# Trade UI — Limit Order & Cross-Chain Panel Redesign

**Date:** 2026-03-19
**Status:** Approved
**Scope:** `modules/app`, `docs`

---

## Problem Statement

Three concrete UX failures in the current trade UI:

1. **Token selectors** in Limit Order and Cross-Chain panels cycle through tokens one-by-one on each click. With five tokens (tDOT, tUSDC, tETH, TKA, TKB), this is unusable.
2. **Market price** in the Limit Order panel is sourced from the on-chain `SwapQuoter`, which returns a placeholder `1` on testnet — giving users a completely wrong ratio.
3. **Right panel** always shows the route diagram idle state when in the Limit Order tab — wasted space where the user's open positions should be.

---

## Decisions

| Question | Answer |
|---|---|
| Token selector style | Inline dropdown overlay (Option A) — matches existing `TokenPicker` component |
| Orders list placement | Right panel when `activeTab === "limit"` (Option B) — left panel is form only |
| Market price source | Route finder `/api/routes` with 1-unit amount (accurate on testnet) |
| Orders panel actions | Cancel only — no modify/edit in this iteration |
| Docs updates | dex-aggregator.mdx, dashboard.mdx, modules/agent/AGENTS.md |

---

## Architecture

### New Files

#### `modules/app/src/hooks/use-market-price.ts`

A thin hook wrapping `useRouteFinder` with a fixed 1-unit input to derive the current market exchange rate between two tokens.

```ts
useMarketPrice(tokenIn: SwapToken, tokenOut: SwapToken): {
  price: string | null   // formatted, e.g. "6.830000"
  isLoading: boolean
}
```

- Calls `useRouteFinder({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: parseUnits("1", tokenIn.decimals).toString() })`
- Picks the best local route (highest `amountOut` among `routeType === "local"` routes)
- Returns `formatUnits(bestRoute.amountOut, tokenOut.decimals)`
- Returns `null` when no local routes found or while loading

#### `modules/app/src/components/swap/orders-panel.tsx`

Self-contained right-panel component. Reads and writes `localStorage("obidot_limit_orders")`. No props.

**Sections:**
- **Header:** "Open Positions" label + live active count badge
- **Active orders:** one `OrderRow` per non-expired order — token pair, sell amount, target price, delta % vs price at placement (green if above market, red if below), time remaining, trash (cancel) button
- **Expired section:** dimmed rows, "Clear all" button at section header
- **Empty state:** centered icon + "No open orders. Place a limit order to get started."

`OrderRow` renders:
```
[tDOT → tUSDC]  [PENDING]                              [🗑]
Sell 1 tDOT at 6.8300 tUSDC/tDOT   (+2.1% vs placed)
⏱ Expires in 23h 54m
```

---

### Modified Files

#### `modules/app/src/components/swap/limit-order-panel.tsx`

**Remove:**
- `useSwapQuote` import and call
- The active orders section (lines ~305–342)
- The expired orders section (lines ~344–376)
- The cycling `onClick` handlers on token buttons

**Add:**
- `import TokenPicker from "./token-picker"` — replace both token buttons with `<TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />` and vice versa
- `import { useMarketPrice } from "@/hooks/use-market-price"` — replaces `useSwapQuote` for the market price display
- Market price from `useMarketPrice(tokenIn, tokenOut).price`

The panel becomes form-only: token pair → amount → target price → expiry → place button → success flash.

#### `modules/app/src/components/swap/cross-chain-panel.tsx`

**Remove:**
- The cycling `onClick` on token In button (increments index mod N)
- The cycling `onClick` on token Out button (increments index mod N)

**Add:**
- `import TokenPicker from "./token-picker"` — replace both with `<TokenPicker>`, passing `disabledIdx` to prevent same-token selection

No change to the route display or relay teleport logic.

#### `modules/app/src/components/trade/trade-page.tsx`

Right panel conditional rendering:

```tsx
// swap tab
activeTab === "swap" → showDiagram ? <RouteDiagram /> : <idle empty state>

// limit tab
activeTab === "limit" → <OrdersPanel />

// crosschain tab
activeTab === "crosschain" → <idle empty state> (future: CrossChainOrdersPanel)
```

`InfoBanners` remain in the right panel header **only** when `activeTab === "swap"`. When `activeTab === "limit"`, the right panel is full-height `OrdersPanel` with no banners above it.

The `selectedSplitRoutes` / `onSplitRoutesSelect` wiring is unchanged.

---

## Data Flow

```
LimitOrderPanel (left)
  └── places order → localStorage("obidot_limit_orders")

OrdersPanel (right)
  └── reads localStorage("obidot_limit_orders")
  └── cancel → filters + writes back to localStorage

useMarketPrice
  └── useRouteFinder → /api/routes
  └── picks best local route amountOut
  └── returns formatted price string
```

Orders are local-only (no on-chain state). The Obidot Agent monitors them off-chain and executes via UniversalIntent when price conditions are met.

---

## Docs Updates

### `docs/content/docs/dex-aggregator.mdx`

- Add test token table: tDOT, tUSDC, tETH, TKA, TKB with addresses
- Add UV2 pairs table: tDOT/tUSDC, tDOT/tETH, tUSDC/tETH, tDOT/TKB, TKB/TKA
- Update cross-chain stub table: add Karura (mainnet_only), Interlay (mainnet_only), UniswapV2 Hub (live/local); mark Moonbeam as coming_soon

### `docs/content/docs/dashboard.mdx`

Add "Trade UI" section:
- **Swap tab:** route diagram, on-chain routes vs cross-chain stubs, split route selection
- **Limit Order tab:** local intent orders, monitored by Obidot Agent, right-panel positions list
- **Cross-Chain tab:** XCM destination chains, RelayTeleport 1:1 DOT teleport, bridge routes

### `modules/agent/AGENTS.md`

Update route stubs list in the `/api/routes` API section to reflect current stubs with correct statuses.

---

## Out of Scope

- On-chain limit order execution (UniversalIntent wiring)
- Order modification / editing
- Cross-chain orders list (right panel for `crosschain` tab)
- Price feed from external oracle
