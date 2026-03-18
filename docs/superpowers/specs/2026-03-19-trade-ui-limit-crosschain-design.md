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
| Token selector style | Inline dropdown overlay — reuse existing `TokenPicker` component (`components/swap/token-picker.tsx`) |
| Orders list placement | Right panel when `activeTab === "limit"` — left panel is form only |
| Market price source | Route finder `/api/routes` with 1-unit amount (accurate on testnet) |
| Delta % in OrderRow | Static: target price vs `marketPriceAtOrder` stored at placement time (not live current price) |
| Orders panel actions | Cancel only — no modify/edit in this iteration |
| Docs updates | `dex-aggregator.mdx`, `dashboard.mdx`, `modules/agent/AGENTS.md` |

---

## Architecture

### New: `modules/app/src/hooks/use-market-price.ts`

Wraps `useRouteFinder` with a fixed 1-unit input to derive the current market exchange rate.

**Input:** `tokenIn: SwapToken`, `tokenOut: SwapToken` (both with `address` and `decimals`)

**Implementation detail:** The `amountIn` passed to `useRouteFinder` must be `parseUnits("1", tokenIn.decimals).toString()` — a raw wei string, not the literal `"1"`. This is the same pattern used in the existing `LimitOrderPanel` at line 82.

**Returns:**
```ts
{ price: string | null, isLoading: boolean }
```

`price` is a **human-readable decimal string** — `formatUnits(bestRoute.amountOut, tokenOut.decimals)` — suitable for direct display and for pre-filling the target price input. The hook calls `formatUnits` internally before returning.

**Route selection:** Filter results to `routeType === "local"` **and** `amountOut !== "0"` (exclude zero-output stubs), then pick the entry with the highest `amountOut` by comparing as `BigInt`. Return `null` if no qualifying entry exists or while loading.

**Refresh behaviour:** `useRouteFinder` is implemented as a plain `useEffect` with a 600ms `setTimeout` debounce (not TanStack Query). `useMarketPrice` inherits this — no polling is added. The price re-fetches automatically when `tokenIn` or `tokenOut` changes (the `amountIn` string is stable — always 1 unit). No stale time configuration is needed or applied. This is intentional for a limit order form; the user sets a price target, not a live ticker.

---

### New: `modules/app/src/components/swap/orders-panel.tsx`

Self-contained right-panel component. Reads and writes `localStorage("obidot_limit_orders")` directly. **No props required.**

`LimitOrderPanel` (left) and `OrdersPanel` (right) are **mounted simultaneously** on the `limit` tab within the same page. Because `window storage` events only fire across tabs (not within the same page), a custom DOM event is used to notify `OrdersPanel` when `LimitOrderPanel` places a new order:

- `OrdersPanel` reads `localStorage("obidot_limit_orders")` once on mount (initial load, covers orders that exist before the component mounts).
- `LimitOrderPanel.handlePlaceOrder` dispatches `new CustomEvent("obidot:order-placed")` on `window` after writing to localStorage.
- `OrdersPanel` adds a `window.addEventListener("obidot:order-placed", reloadOrders)` on mount and removes it on unmount. On each event, it re-reads localStorage.
- Cancel in `OrdersPanel` calls `localStorage.setItem(...)` and updates its own local React state directly — no event needed since it owns the cancel action.

**Expiry definition:** An order is expired when `order.expiry <= Date.now()`. `order.expiry` is a Unix millisecond timestamp set as `Date.now() + EXPIRY_OPTIONS[expiryIdx].ms` at placement time.

**Cancel behaviour:** Removes the entry from localStorage by filtering the stored array by `id`, then writes back and updates local React state. No `status` field change — removal is permanent.

**Sections:**

- **Header:** "Open Positions" label + live active count badge (expired orders excluded from count)
- **Active orders:** one `OrderRow` per entry where `order.expiry > Date.now()`
- **Expired section:** dimmed rows (entries where `order.expiry <= Date.now()`) + "Clear all" button at section header — clears expired only, not active
- **Empty state (no orders at all):** centered icon + "No open orders. Place a limit order to get started."

**`OrderRow` renders:**
```
[tDOT → tUSDC]  [PENDING]                                      [🗑]
Sell 1 tDOT at 6.8300 tUSDC/tDOT   (+2.1% vs placed)
⏱ Expires in 23h 54m
```

Delta % is computed as `((targetPrice - marketPriceAtOrder) / marketPriceAtOrder) * 100` — both values are stored human-readable decimal strings from `PendingOrder`. Display rules:
- Positive delta → `text-bull`, rendered as `+2.3%` (user's target is above placement price — favourable for a sell)
- Negative delta → `text-danger`, rendered as `-1.1%` (target is below placement price)
- Zero / negligible (< 0.01%) → omit the indicator entirely

This uses the static snapshot from order placement, not the live current market price.

`PendingOrder` type (unchanged from `limit-order-panel.tsx`):
```ts
interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  targetPrice: string;
  expiry: number;
  marketPriceAtOrder: string;
  createdAt: number;
}
```

---

### Modified: `modules/app/src/components/swap/limit-order-panel.tsx`

**Remove:**
- `useSwapQuote` import and its call
- `unitAmount` / `marketPriceDisplay` derived from `useSwapQuote`
- Active orders section (all JSX below the "Place order" button)
- Expired orders section
- Cycling `onClick` handlers on both token buttons

**Add:**
- `import TokenPicker from "./token-picker"` — replace both token `<button>` elements with `<TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />` and `<TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />`
- `import { useMarketPrice } from "@/hooks/use-market-price"` — `const { price: marketPriceDisplay } = useMarketPrice(tokenIn, tokenOut)`

The panel becomes form-only: token pair → amount → target price (with delta indicator and ±% buttons) → expiry → place button → success flash.

---

### Modified: `modules/app/src/components/swap/cross-chain-panel.tsx`

**Token In selector only:** The current tokenIn cycling button (`onClick` increments index by modular arithmetic, lines 219–230) is replaced with `<TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />`.

**Token Out:** The current tokenOut display (`<span>` showing `tokenOut.symbol`, no interactivity) is replaced with `<TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />`. This is a new capability — tokenOut was previously read-only. Adding selectability here is intentional: users need to pick both sides of the cross-chain route.

No change to the route display, relay teleport 1:1 logic, or execute button.

---

### Modified: `modules/app/src/components/trade/trade-page.tsx`

`InfoBanners` (`components/swap/info-banners.tsx`) renders two marketing ticker rows (trending pools, farming pools APR) in the right-panel header. It is only relevant when users are looking at swap routing. It is suppressed on non-swap tabs.

Right panel conditional rendering:

```
activeTab === "swap"
  → header: <InfoBanners /> (existing)
  → body: showDiagram ? <RouteDiagram /> : idle empty state (existing)

activeTab === "limit"
  → header: none
  → body: <OrdersPanel /> (full height)

activeTab === "crosschain"
  → header: none
  → body: idle empty state (intentional — a cross-chain positions panel is out of scope for this iteration)
```

Split route wiring (`selectedSplitRoutes`, `onSplitRoutesSelect`) is unchanged.

---

## Data Flow

```
LimitOrderPanel (left panel, limit tab)
  └── handlePlaceOrder
      ├── writes PendingOrder to localStorage("obidot_limit_orders")
      └── dispatches window CustomEvent("obidot:order-placed")

OrdersPanel (right panel, limit tab)
  └── mount → reads localStorage("obidot_limit_orders") into local state
  └── window "obidot:order-placed" CustomEvent → re-reads localStorage
  └── handleCancel(id) → filters array by id, writes back, updates local state

useMarketPrice(tokenIn: SwapToken, tokenOut: SwapToken)
  └── useRouteFinder({ amountIn: parseUnits("1", tokenIn.decimals).toString() })
      └── /api/routes → SwapRouteResult[]
  └── filter routeType === "local", pick max amountOut (BigInt comparison)
  └── formatUnits(best.amountOut, tokenOut.decimals)
  └── returns human-readable price string
```

---

## Docs Updates

### `docs/content/docs/dex-aggregator.mdx`

- Add test token table: tDOT, tUSDC, tETH, TKA, TKB with addresses and decimals
- Add UniswapV2 pairs table: tDOT/tUSDC, tDOT/tETH, tUSDC/tETH, tDOT/TKB, TKB/TKA
- Update cross-chain stubs table: add Karura DEX (mainnet_only), Interlay Loans (mainnet_only), UniswapV2 Polkadot Hub (live/local); mark Moonbeam as coming_soon

### `docs/content/docs/dashboard.mdx`

Add "Trade UI" section describing all three tabs:
- **Swap:** route diagram, on-chain routes vs cross-chain stubs, split route selection, InfoBanners
- **Limit Order:** intent-based orders stored locally, monitored by Obidot Agent, right-panel positions list, cancel action
- **Cross-Chain:** XCM destination chains, RelayTeleport 1:1 DOT teleport, bridge routes, token picker

### `modules/agent/AGENTS.md`

Update the `/api/routes` section to list current cross-chain stubs with statuses:
- RelayTeleport (XCM) — live
- Hydration Omnipool (XCM) — mainnet_only
- Bifrost DEX (XCM) — mainnet_only
- Uniswap V2 Polkadot Hub — live (local)
- Karura DEX (XCM) — mainnet_only
- Interlay Loans (XCM) — mainnet_only
- Moonbeam DEX (XCM) — coming_soon
- Hyperbridge (ISMP) — mainnet_only (bridge)
- Snowbridge — coming_soon (bridge)
- ChainFlip — coming_soon (bridge)

---

## Out of Scope

- On-chain limit order execution (UniversalIntent wiring)
- Order modification / editing
- Cross-chain orders list (right panel for `crosschain` tab)
- Live market price refresh / ticker
- Price feed from external oracle
