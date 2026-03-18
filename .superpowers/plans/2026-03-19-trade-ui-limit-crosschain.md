# Trade UI — Limit Order & Cross-Chain Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix token selectors in Limit Order and Cross-Chain panels, replace the wrong on-chain market price with an accurate route-finder price, move the orders list to the right panel, and update three docs files.

**Architecture:** New `useMarketPrice` hook wraps `useRouteFinder` with a 1-unit fixed input; new `OrdersPanel` is a self-contained right-panel component reading localStorage; `LimitOrderPanel` becomes form-only; `trade-page.tsx` switches the right panel by `activeTab`.

**Tech Stack:** Next.js 15, React, TypeScript, viem (`parseUnits`/`formatUnits`), Tailwind CSS v4, localStorage, `CustomEvent` for same-tab sync.

**Spec:** `.superpowers/specs/2026-03-19-trade-ui-limit-crosschain-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `modules/app/src/hooks/use-market-price.ts` | **Create** | Hook: route-finder-based market price |
| `modules/app/src/components/swap/orders-panel.tsx` | **Create** | Right-panel orders list with cancel |
| `modules/app/src/components/swap/limit-order-panel.tsx` | **Modify** | Form only: remove orders, fix token selectors + market price |
| `modules/app/src/components/swap/cross-chain-panel.tsx` | **Modify** | Fix token selectors (both sides) |
| `modules/app/src/components/trade/trade-page.tsx` | **Modify** | Right panel: swap→diagram, limit→OrdersPanel, crosschain→idle |
| `docs/content/docs/dex-aggregator.mdx` | **Modify** | Add tokens, UV2 pairs, stub table |
| `docs/content/docs/dashboard.mdx` | **Modify** | Add Trade UI section |
| `modules/agent/AGENTS.md` | **Modify** | Update route stubs list |

---

## Task 1: `useMarketPrice` hook

**Files:**
- Create: `modules/app/src/hooks/use-market-price.ts`

**What it does:** Wraps `useRouteFinder` with `amountIn = parseUnits("1", tokenIn.decimals).toString()`. Filters results to `routeType === "local"` and `amountOut !== "0"`, picks the entry with the highest `amountOut` (BigInt comparison), returns `formatUnits(best.amountOut, tokenOut.decimals)` as a human-readable string.

- [ ] **Step 1: Create the hook file**

```typescript
// modules/app/src/hooks/use-market-price.ts
import { useMemo } from "react";
import { parseUnits, formatUnits } from "viem";
import { useRouteFinder } from "./use-swap";
import type { SwapToken } from "@/types";

export function useMarketPrice(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
): { price: string | null; isLoading: boolean } {
  const amountIn = useMemo(
    () => parseUnits("1", tokenIn.decimals).toString(),
    [tokenIn.decimals],
  );

  const { routes, isLoading } = useRouteFinder({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn,
  });

  const price = useMemo(() => {
    const locals = routes.filter(
      (r) => r.routeType === "local" && r.amountOut !== "0",
    );
    if (locals.length === 0) return null;
    const best = locals.reduce((a, b) =>
      BigInt(a.amountOut) >= BigInt(b.amountOut) ? a : b,
    );
    return formatUnits(BigInt(best.amountOut), tokenOut.decimals);
  }, [routes, tokenOut.decimals]);

  return { price, isLoading };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/hooks/use-market-price.ts
git commit -m "feat(app): add useMarketPrice hook — route-finder-based market price"
```

---

## Task 2: `OrdersPanel` component

**Files:**
- Create: `modules/app/src/components/swap/orders-panel.tsx`

**What it does:** Self-contained right-panel component. No props. Reads `localStorage("obidot_limit_orders")` on mount. Listens for `CustomEvent("obidot:order-placed")` to pick up orders placed by `LimitOrderPanel` (same-tab sync). Renders active orders, expired orders, and an empty state. Cancel removes by id.

**Key types (copy from existing `limit-order-panel.tsx`, do not export from there):**

```ts
interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  targetPrice: string;
  expiry: number;       // Unix ms timestamp
  marketPriceAtOrder: string;
  createdAt: number;
}
```

- [ ] **Step 1: Create the component**

```typescript
// modules/app/src/components/swap/orders-panel.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/format";
import { Clock3, Trash2, ClipboardList } from "lucide-react";

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

const LS_KEY = "obidot_limit_orders";

function loadOrders(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveOrders(orders: PendingOrder[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

function formatExpiry(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function priceDelta(target: string, market: string): number {
  const t = Number(target);
  const m = Number(market);
  if (!m || !t) return 0;
  return ((t - m) / m) * 100;
}

// ── OrderRow ──────────────────────────────────────────────────────────────

function OrderRow({
  order,
  onCancel,
}: {
  order: PendingOrder;
  onCancel: (id: string) => void;
}) {
  const delta = priceDelta(order.targetPrice, order.marketPriceAtOrder);
  const showDelta = Math.abs(delta) >= 0.01;

  return (
    <div className="border border-border bg-surface p-3 flex items-start justify-between gap-2">
      <div className="space-y-0.5 min-w-0">
        {/* Top row: pair + status badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[13px] text-text-primary font-semibold">
            {order.amountIn} {order.tokenInSymbol} → {order.tokenOutSymbol}
          </span>
          <span className="font-mono text-[11px] text-primary border border-primary/20 px-1 py-0.5">
            PENDING
          </span>
        </div>

        {/* Price row */}
        <p className="text-[12px] text-text-muted font-mono">
          At: {Number(order.targetPrice).toFixed(6)} {order.tokenOutSymbol} /{" "}
          {order.tokenInSymbol}
          {showDelta && (
            <span
              className={cn(
                "ml-2",
                delta > 0 ? "text-bull" : "text-danger",
              )}
            >
              ({delta > 0 ? "+" : ""}
              {delta.toFixed(1)}% vs placed)
            </span>
          )}
        </p>

        {/* Expiry row */}
        <div className="flex items-center gap-1 text-[11px] text-text-muted">
          <Clock3 className="h-3 w-3" />
          <span>Expires in {formatExpiry(order.expiry)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCancel(order.id)}
        className="text-text-muted hover:text-danger transition-colors shrink-0 p-1"
        aria-label="Cancel order"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function OrdersPanel() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);

  const reload = useCallback(() => {
    setOrders(loadOrders());
  }, []);

  // Initial load + listen for orders placed by LimitOrderPanel (same tab)
  useEffect(() => {
    reload();
    window.addEventListener("obidot:order-placed", reload);
    return () => window.removeEventListener("obidot:order-placed", reload);
  }, [reload]);

  const handleCancel = useCallback((id: string) => {
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== id);
      saveOrders(next);
      return next;
    });
  }, []);

  const handleClearExpired = useCallback(() => {
    setOrders((prev) => {
      const next = prev.filter((o) => o.expiry > Date.now());
      saveOrders(next);
      return next;
    });
  }, []);

  const activeOrders = orders.filter((o) => o.expiry > Date.now());
  const expiredOrders = orders.filter((o) => o.expiry <= Date.now());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-text-muted" />
          <span className="text-[15px] font-semibold text-text-primary">
            Open Positions
          </span>
          {activeOrders.length > 0 && (
            <span className="font-mono text-[11px] bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5">
              {activeOrders.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-full py-16 text-center">
            <div className="h-12 w-12 border border-border bg-surface-hover flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-text-muted" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-text-secondary">
                No open orders
              </p>
              <p className="text-[12px] text-text-muted mt-1 max-w-[200px]">
                Place a limit order to get started
              </p>
            </div>
          </div>
        )}

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-muted uppercase tracking-wider">
              Active ({activeOrders.length})
            </p>
            {activeOrders.map((o) => (
              <OrderRow key={o.id} order={o} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {/* Expired orders */}
        {expiredOrders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-text-muted uppercase tracking-wider">
                Expired ({expiredOrders.length})
              </p>
              <button
                type="button"
                onClick={handleClearExpired}
                className="text-[11px] text-text-muted hover:text-danger transition-colors font-mono"
              >
                Clear all
              </button>
            </div>
            {expiredOrders.map((o) => (
              <div key={o.id} className="opacity-50">
                <OrderRow order={o} onCancel={handleCancel} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="shrink-0 px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted text-center">
          Orders monitored by Obidot Agent · executed via UniversalIntent
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/swap/orders-panel.tsx
git commit -m "feat(app): add OrdersPanel component — right-panel positions list with cancel"
```

---

## Task 3: Update `LimitOrderPanel`

**Files:**
- Modify: `modules/app/src/components/swap/limit-order-panel.tsx`

**Architectural note:** The existing `LimitOrderPanel` derives market price from `useSwapQuote`, which calls the on-chain `SwapQuoter` contract. On testnet this returns a placeholder value of `1` for all pairs. This task intentionally replaces it with `useMarketPrice` (which calls `/api/routes` via `useRouteFinder`) because the route finder uses actual pool reserves and returns accurate prices on testnet. The on-chain quote path is abandoned for market price display.

**What to do:**
1. Remove `useSwapQuote` import and call, remove `unitAmount` / `marketPriceDisplay` and the `useEffect` that pre-fills `targetPrice` from `marketPriceDisplay`
2. Remove all order-management state from `LimitOrderPanel`: `orders` state, `loadOrders`/`saveOrders` helper calls, `activeOrders`/`expiredOrders` derived values, `handleDeleteOrder` function
3. Add `import { useMarketPrice } from "@/hooks/use-market-price"` and use `const { price: marketPriceDisplay } = useMarketPrice(tokenIn, tokenOut)`
4. Replace the two cycling token `<button>` elements with `<TokenPicker>` (import from `"./token-picker"`)
5. Update `handlePlaceOrder`: keep `saveOrders(next)` but remove `setOrders(next)` (orders state is gone). After `saveOrders(next)`, add `window.dispatchEvent(new CustomEvent("obidot:order-placed"))` then `setSubmitted(true)`
6. Remove the active orders and expired orders JSX sections (everything from `{/* Active orders list */}` to end of returned JSX)
7. Remove imports that are no longer used: `useSwapQuote`, `CONTRACTS`, `ZERO_ADDRESS`, `PoolType`, `POOL_TYPE_LABELS`, `useEffect` (if only used for orders pre-fill)

- [ ] **Step 1: Replace imports at top of file**

Current imports to remove: `useSwapQuote` from `"@/hooks/use-swap"`, `CONTRACTS`, `ZERO_ADDRESS` from `"@/lib/constants"`, `PoolType`, `POOL_TYPE_LABELS` from `"@/types"`.

New imports to add:
```typescript
import TokenPicker from "./token-picker";
import { useMarketPrice } from "@/hooks/use-market-price";
```

- [ ] **Step 2: Replace market price derivation**

Remove:
```typescript
const unitAmount = useMemo(() => { ... }, [tokenIn.decimals]);
const { data: unitQuote } = useSwapQuote({ ... });
const marketPriceDisplay = unitQuote ? formatUnits(...) : null;
```

Add:
```typescript
const { price: marketPriceDisplay } = useMarketPrice(tokenIn, tokenOut);
```

Also remove the `useEffect` that pre-fills `targetPrice` from `marketPriceDisplay` — keep only the manual target price input. The ±% quick-set buttons already handle pre-filling via `setTargetPrice(price.toFixed(6))`.

- [ ] **Step 3: Replace token pair selectors**

Replace the two cycling `<button>` elements in the token pair row with:
```tsx
<TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />
<span className="text-text-muted">→</span>
<TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />
```

- [ ] **Step 4: Add CustomEvent dispatch in handlePlaceOrder**

After `saveOrders(next)` and `setSubmitted(true)`:
```typescript
window.dispatchEvent(new CustomEvent("obidot:order-placed"));
```

- [ ] **Step 5: Remove orders list JSX**

Delete everything from `{/* Active orders list */}` to the end of the returned JSX (both the active and expired order sections). The component's return ends after the `<p>` note about Obidot Agent monitoring.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add modules/app/src/components/swap/limit-order-panel.tsx
git commit -m "feat(app): refactor LimitOrderPanel — form-only, TokenPicker, useMarketPrice, CustomEvent sync"
```

---

## Task 4: Update `CrossChainPanel`

**Files:**
- Modify: `modules/app/src/components/swap/cross-chain-panel.tsx`

**What to do:** Replace the tokenIn cycling button and the tokenOut read-only `<span>` with `<TokenPicker>` components. The token-swap flip button between them can be removed since both selectors are now interactive.

- [ ] **Step 1: Add TokenPicker import**

Add to imports:
```typescript
import TokenPicker from "./token-picker";
```

Remove the `ChevronDown` import if it's no longer used after replacing the cycling buttons.

- [ ] **Step 2: Replace token input buttons**

In the "Token inputs" section, replace the tokenIn cycling button:
```tsx
<button type="button" className="..." onClick={() => { const next = ...; setTokenInIdx(next); }}>
  <span className="font-mono text-[13px] text-text-primary">{tokenIn.symbol}</span>
  <ChevronDown className="h-3 w-3 text-text-muted" />
</button>
```
With:
```tsx
<TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />
```

Replace the tokenOut read-only span:
```tsx
<span className="font-mono text-[13px] text-text-primary border border-border px-2.5 py-1.5">
  {tokenOut.symbol}
</span>
```
With:
```tsx
<TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />
```

**Keep the `handleFlip` function and the flip button** between the two input boxes — it swaps `tokenInIdx` and `tokenOutIdx`, which still works correctly with `TokenPicker` state. No change needed there.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/components/swap/cross-chain-panel.tsx
git commit -m "feat(app): replace cycling token buttons with TokenPicker in CrossChainPanel"
```

---

## Task 5: Update `trade-page.tsx` right panel

**Files:**
- Modify: `modules/app/src/components/trade/trade-page.tsx`

**What to do:** Import `OrdersPanel` and update the right-panel `<div>` to conditionally render by `activeTab`. `InfoBanners` is only shown when `activeTab === "swap"`.

- [ ] **Step 1: Add import**

```typescript
import OrdersPanel from "@/components/swap/orders-panel";
```

- [ ] **Step 2: Replace right panel content**

The right panel `<div className="hidden lg:flex flex-col border-l border-border bg-background/40">` currently contains unconditional `<InfoBanners />` followed by conditional `RouteDiagram` or idle state. Replace its **entire inner content** with the following `activeTab`-aware structure:

```tsx
{/* ── Right panel ── */}
<div className="hidden lg:flex flex-col border-l border-border bg-background/40">
  {/* InfoBanners only on swap tab */}
  {activeTab === "swap" && (
    <div className="p-6 border-b border-border shrink-0">
      <InfoBanners />
    </div>
  )}

  {/* Swap tab: route diagram or idle */}
  {activeTab === "swap" && (
    showDiagram ? (
      <RouteDiagram
        tokenIn={swapInput.tokenIn}
        tokenOut={swapInput.tokenOut}
        amountIn={swapInput.amountIn}
        tokenOutSymbol={swapInput.tokenOutSymbol}
        tokenOutDecimals={swapInput.tokenOutDecimals}
        selectedRouteId={selectedRoute?.id}
        onSelectRoute={setSelectedRoute}
        onSelectSplitRoutes={setSelectedSplitRoutes}
      />
    ) : (
      <RightPanelIdle routes={routes} />
    )
  )}

  {/* Limit tab: orders panel */}
  {activeTab === "limit" && <OrdersPanel />}

  {/* Cross-chain tab: idle */}
  {activeTab === "crosschain" && <RightPanelIdle routes={routes} />}
</div>
```

Extract the existing idle empty state JSX into a local component at the top of the file (before `TradePage`):

```tsx
function RightPanelIdle({ routes }: { routes: ReturnType<typeof useSwapRoutes>["data"] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      {/* ... existing idle JSX verbatim ... */}
    </div>
  );
}
```

This avoids duplicating the idle JSX across the two branches that need it (`swap` with no amount, `crosschain`).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify visually**

Start the dev server and check:
- Swap tab → InfoBanners + route diagram (or idle state if no amount)
- Limit tab → "Open Positions" panel fills the right side, no InfoBanners
- Cross-chain tab → idle state, no InfoBanners

```bash
pnpm --filter @obidot/app run dev
```

- [ ] **Step 5: Commit**

```bash
git add modules/app/src/components/trade/trade-page.tsx
git commit -m "feat(app): right panel switches by activeTab — OrdersPanel on limit tab"
```

---

## Task 6: Docs — `dex-aggregator.mdx`

**Files:**
- Modify: `docs/content/docs/dex-aggregator.mdx`

**What to add:**

- [ ] **Step 1: Add test tokens table**

After the contracts table, add a new section:

```markdown
## Test Tokens (Polkadot Hub TestNet)

| Symbol | Name | Address | Decimals |
|--------|------|---------|---------|
| `tDOT` | Test DOT | `0x2402C804aD8a6217BF73D8483dA7564065c56083` | 18 |
| `tUSDC` | Test USDC | `0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626` | 18 |
| `tETH` | Test ETH | `0xd92a5325fB3A56f5012F1EBD1bd37573d981144e` | 18 |
| `TKA` | Test Token A | `0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f` | 18 |
| `TKB` | Test Token B | `0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc` | 18 |

## UniswapV2 Pairs (Testnet)

Five pairs are live in the UV2 pair registry:

| Pair | Type |
|------|------|
| tDOT / tUSDC | Local Hub |
| tDOT / tETH | Local Hub |
| tUSDC / tETH | Local Hub |
| tDOT / TKB | Local Hub |
| TKB / TKA | Local Hub |
```

- [ ] **Step 2: Update cross-chain stubs table**

Find the existing stubs section and update it to reflect the current `crossChainStubs` array in `modules/agent/src/services/swap-router.service.ts`:

```markdown
## Cross-Chain Route Stubs

The route finder appends stubs for all registered adapters. On testnet, only `live` stubs are executable.

| Route | Type | Status |
|-------|------|--------|
| RelayTeleport (XCM) | xcm | live |
| Hydration Omnipool (XCM) | xcm | mainnet_only |
| Bifrost DEX (XCM) | xcm | mainnet_only |
| Uniswap V2 (Polkadot Hub) | local | live |
| Karura DEX (XCM) | xcm | mainnet_only |
| Interlay Loans (XCM) | xcm | mainnet_only |
| Moonbeam DEX (XCM) | xcm | coming_soon |
| Hyperbridge (ISMP) | bridge | mainnet_only |
| Snowbridge (BridgeHub → Ethereum) | bridge | coming_soon |
| ChainFlip (Polkadot → Ethereum) | bridge | coming_soon |
```

- [ ] **Step 3: Commit**

```bash
git add docs/content/docs/dex-aggregator.mdx
git commit -m "docs: add test tokens, UV2 pairs, and cross-chain stubs table to dex-aggregator"
```

---

## Task 7: Docs — `dashboard.mdx`

**Files:**
- Modify: `docs/content/docs/dashboard.mdx`

- [ ] **Step 1: Add Trade UI section**

Add a new `## Trade UI` section (before or after the existing "Running Locally" section):

```markdown
## Trade UI

The `/swap` (and `/:trade/:chain/:router`) routes render a two-panel trading interface.

### Swap Tab

- **Left panel:** Token picker (inline dropdown for both sides), amount input, quote display, execute button. Uses `SwapForm`.
- **Right panel:** `InfoBanners` (trending/farming pools ticker) + `RouteDiagram`. The route diagram shows on-chain routes (single/multi-hop, split), an adapter quotes comparison table, and cross-chain route stubs. Routes are sourced from `/api/routes` with a 600 ms debounce.

### Limit Order Tab

- **Left panel:** Token pair (via `TokenPicker`), sell amount, target price with ±% quick-set buttons and delta indicator, expiry selector. Submits a `PendingOrder` to `localStorage("obidot_limit_orders")` and dispatches a `CustomEvent("obidot:order-placed")`.
- **Right panel:** `OrdersPanel` — live list of active and expired orders. Cancel removes the order from localStorage. Orders are monitored by the Obidot AI Agent and executed via `UniversalIntent` when the target price is reached.

### Cross-Chain Tab

- **Left panel:** Source and destination token (both via `TokenPicker`), amount input, destination chain selector (XCM or Bridge). For **RelayTeleport**, the output is estimated at 1:1 minus ~0.1% XCM fee with no exchange rate. For other chains, amounts are shown when routes are available.
- **Right panel:** Idle (cross-chain positions panel is planned for a future iteration).

### Supported Chains

| Chain | ID | RPC |
|---|---|---|
| Polkadot Hub TestNet | 420420417 | `eth-rpc-testnet.polkadot.io` |
| Polkadot Hub | 420420419 | `eth-rpc.polkadot.io` |
```

- [ ] **Step 2: Commit**

```bash
git add docs/content/docs/dashboard.mdx
git commit -m "docs: add Trade UI section — swap, limit order, cross-chain tab descriptions"
```

---

## Task 8: Docs — `modules/agent/AGENTS.md`

**Files:**
- Modify: `modules/agent/AGENTS.md`

- [ ] **Step 1: Update route stubs in the API table**

Find the `/api/swap/routes` row in the API Endpoints table and expand its description. Add a note below the table:

```markdown
**`GET /api/swap/routes` response includes cross-chain stubs appended to all live on-chain routes:**

| Stub | routeType | status |
|------|-----------|--------|
| RelayTeleport (XCM) | xcm | live |
| Hydration Omnipool (XCM) | xcm | mainnet_only |
| Bifrost DEX (XCM) | xcm | mainnet_only |
| Uniswap V2 (Polkadot Hub) | local | live |
| Karura DEX (XCM) | xcm | mainnet_only |
| Interlay Loans (XCM) | xcm | mainnet_only |
| Moonbeam DEX (XCM) | xcm | coming_soon |
| Hyperbridge (ISMP) | bridge | mainnet_only |
| Snowbridge (BridgeHub → Ethereum) | bridge | coming_soon |
| ChainFlip (Polkadot → Ethereum) | bridge | coming_soon |

Stubs have `amountOut: "0"` and `hops: []`. The UI filters them from on-chain route cards and displays them separately in the cross-chain section.
```

- [ ] **Step 2: Commit**

```bash
git add modules/agent/AGENTS.md
git commit -m "docs(agent): update /api/swap/routes stub list with current adapters and statuses"
```

---

## Final Verification

- [ ] Run full typecheck across both modules:

```bash
pnpm --filter @obidot/app run typecheck && pnpm --filter @obidot/agent run typecheck
```

Expected: both exit 0 with no errors.

- [ ] Manual smoke test (start dev server):

```bash
pnpm --filter @obidot/app run dev
```

Check:
1. **Limit tab** → left panel form only, right panel "Open Positions" (empty state)
2. **Place a limit order** → right panel updates to show the new order
3. **Cancel an order** → order removed from right panel
4. **Market price** shows a realistic ratio (not "1.000000") once route finder resolves
5. **Token dropdowns** in limit order panel — both sides open an inline dropdown with all 5 tokens, cannot select same token on both sides
6. **Cross-chain tab** → both token sides have inline dropdowns; relay teleport shows estimated 1:1 amount
7. **Swap tab** → InfoBanners + route diagram unchanged
