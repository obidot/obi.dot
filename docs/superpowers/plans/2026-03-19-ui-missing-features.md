# UI Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three missing UI features: per-user vault position panel, swap trade history tab, and limit order fill detection.

**Architecture:** All features slot into existing layouts (no new pages/nav). `PendingOrder` is first extracted to `types/index.ts` so all three features share the type. The vault position reads on-chain via wagmi. Trade history uses the existing `lib/graphql.ts` HTTP fetch + obi.index WebSocket subscription. Fill detection cross-references `SwapExecuted` events against localStorage orders by token pair + amountIn proximity.

**Tech Stack:** Next.js 15 App Router, wagmi `useReadContract`, TanStack Query `useQuery`, `graphql-ws` (singleton, already in `use-graphql-subscription.ts`), Tailwind CSS v4 design tokens (`text-primary`, `text-text-muted`, `border-border`, `btn-ghost`, etc.), viem `formatUnits`.

**Spec:** `docs/superpowers/specs/2026-03-19-ui-missing-features-design.md`

---

## File Structure

**New files:**
- `modules/app/src/hooks/use-user-vault-position.ts` — wagmi reads for shares + asset value
- `modules/app/src/components/dashboard/user-position.tsx` — per-user position widget
- `modules/app/src/components/swap/trade-history.tsx` — swap history panel

**Modified files:**
- `modules/app/src/types/index.ts` — add shared `PendingOrder` interface
- `modules/app/src/lib/graphql.ts` — add `getSwapExecutionsByRecipient`
- `modules/app/src/components/swap/limit-order-panel.tsx` — store `tokenInAddress`/`tokenOutAddress`, import `PendingOrder` from types
- `modules/app/src/components/swap/orders-panel.tsx` — import `PendingOrder` from types, add fill detection + FILLED section
- `modules/app/src/components/trade/trade-page.tsx` — add "Open Positions | History" tab switcher on limit panel
- `modules/app/src/app/page.tsx` — add `<UserPosition />` below `<VaultActions />`

---

## Task 1: Extract PendingOrder type to types/index.ts

**Files:**
- Modify: `modules/app/src/types/index.ts`

Context: `PendingOrder` is currently defined inline in both `limit-order-panel.tsx` and `orders-panel.tsx`. Extract it to the shared types file and extend it with `tokenInAddress`, `tokenOutAddress` (needed for fill detection) and optional `status` (needed for FILLED rendering).

- [ ] **Step 1: Add `PendingOrder` to `modules/app/src/types/index.ts`**

Add this block after the `ChatMessage` interface (around line 107):

```typescript
/** Limit order stored in localStorage under key "obidot_limit_orders" */
export interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  /** ERC-20 address of tokenIn — used for fill detection */
  tokenInAddress: string;
  /** ERC-20 address of tokenOut — used for fill detection */
  tokenOutAddress: string;
  /** Human-readable amount (e.g. "10.5") */
  amountIn: string;
  targetPrice: string;
  expiry: number;
  marketPriceAtOrder: string;
  createdAt: number;
  /** Set to "filled" by fill-detection logic when a matching SwapExecuted event arrives */
  status?: "pending" | "filled";
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```
Expected: no new errors (only pre-existing ones if any).

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/types/index.ts
git commit -m "feat(app): extract PendingOrder to shared types with tokenInAddress/tokenOutAddress/status"
```

---

## Task 2: Update limit-order-panel.tsx to use shared PendingOrder + store addresses

**Files:**
- Modify: `modules/app/src/components/swap/limit-order-panel.tsx`

Context: The existing local `PendingOrder` interface (lines 12–21) must be removed and replaced with an import. The `handlePlaceOrder` function must store `tokenIn.address` and `tokenOut.address` in the order so fill detection can match on-chain events.

- [ ] **Step 1: Replace local type definition and update import**

Remove lines 12–21 (the local `interface PendingOrder { ... }` block).

Add import at the top of the file (after existing imports):
```typescript
import type { PendingOrder } from "@/types";
```

- [ ] **Step 2: Add token addresses to the stored order**

In `handlePlaceOrder`, replace the `order` object literal with:

```typescript
const order: PendingOrder = {
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  tokenInSymbol: tokenIn.symbol,
  tokenOutSymbol: tokenOut.symbol,
  tokenInAddress: tokenIn.address,
  tokenOutAddress: tokenOut.address,
  amountIn,
  targetPrice,
  expiry: Date.now() + EXPIRY_OPTIONS[expiryIdx].ms,
  marketPriceAtOrder: marketPriceDisplay ?? "—",
  createdAt: Date.now(),
};
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```
Expected: no errors related to `PendingOrder` or `limit-order-panel`.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/components/swap/limit-order-panel.tsx
git commit -m "feat(app): store tokenInAddress/tokenOutAddress in limit orders for fill detection"
```

---

## Task 3: Update orders-panel.tsx to use shared PendingOrder type

**Files:**
- Modify: `modules/app/src/components/swap/orders-panel.tsx`

Context: `orders-panel.tsx` has its own local `PendingOrder` interface (lines 7–16) that must be replaced with the shared import. No behavior changes yet — fill detection comes in Task 8.

- [ ] **Step 1: Remove local PendingOrder interface**

Delete lines 7–16 from `orders-panel.tsx`:
```typescript
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

- [ ] **Step 2: Add import**

Add to the imports at the top:
```typescript
import type { PendingOrder } from "@/types";
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```
Expected: no errors. `loadOrders()` and `saveOrders()` still work because the new `PendingOrder` is a superset.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/components/swap/orders-panel.tsx
git commit -m "refactor(app): orders-panel imports PendingOrder from shared types"
```

---

## Task 4: Create useUserVaultPosition hook

**Files:**
- Create: `modules/app/src/hooks/use-user-vault-position.ts`

Context: The ERC-4626 vault at `CONTRACTS.VAULT` exposes `balanceOf(address) → uint256` (shares) and `convertToAssets(uint256) → uint256` (redemption value). Both are already in `VAULT_ABI` in `lib/abi.ts`. We use two sequential `useReadContract` calls (NOT `useReadContracts`) because the second call's argument (`sharesBalance`) depends on the result of the first — they cannot be batched in a single `useReadContracts` call without knowing the shares balance upfront. The second call is `enabled` only after `sharesBalance` is available.

- [ ] **Step 1: Create the file**

```typescript
// modules/app/src/hooks/use-user-vault-position.ts
"use client";

import { useAccount, useReadContract } from "wagmi";
import type { Address } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { VAULT_ABI } from "@/lib/abi";

const VAULT_ADDRESS = CONTRACTS.VAULT as Address;

export interface UserVaultPosition {
  /** Raw ERC-4626 share balance */
  sharesBalance: bigint;
  /** Redemption value in tDOT (convertToAssets result) */
  assetsValue: bigint;
}

export function useUserVaultPosition(): {
  data: UserVaultPosition | null;
  isLoading: boolean;
} {
  const { address, isConnected } = useAccount();

  const { data: sharesBalance, isLoading: sharesLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: {
      enabled: isConnected && !!address,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  });

  const { data: assetsValue, isLoading: assetsLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [sharesBalance ?? 0n],
    query: {
      enabled: isConnected && sharesBalance !== undefined,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  });

  if (!isConnected || !address || sharesBalance === undefined) {
    return { data: null, isLoading: sharesLoading };
  }

  return {
    data: {
      sharesBalance: sharesBalance as bigint,
      assetsValue: (assetsValue ?? 0n) as bigint,
    },
    isLoading: sharesLoading || assetsLoading,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/hooks/use-user-vault-position.ts
git commit -m "feat(app): add useUserVaultPosition hook (balanceOf + convertToAssets)"
```

---

## Task 5: Create UserPosition component and add to dashboard

**Files:**
- Create: `modules/app/src/components/dashboard/user-position.tsx`
- Modify: `modules/app/src/app/page.tsx`

Context: The dashboard right column shows `<VaultActions />` then `<HealthIndicators />`. Insert `<UserPosition />` between them (below VaultActions, above HealthIndicators). The component shows the connected user's vault shares and redemption value in tDOT. Empty/no-wallet states are handled gracefully.

- [ ] **Step 1: Create `user-position.tsx`**

```typescript
// modules/app/src/components/dashboard/user-position.tsx
"use client";

import { useAccount } from "wagmi";
import { Loader2 } from "lucide-react";
import { useUserVaultPosition } from "@/hooks/use-user-vault-position";
import { formatTokenAmount } from "@/lib/format";

export function UserPosition() {
  const { isConnected } = useAccount();
  const { data: position, isLoading } = useUserVaultPosition();

  if (!isConnected) {
    return (
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">My Position</p>
        <p className="text-[12px] text-text-muted">Connect wallet to view your position.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
        <span className="text-[12px] text-text-muted">Loading position…</span>
      </div>
    );
  }

  if (!position || position.sharesBalance === 0n) {
    return (
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">My Position</p>
        <p className="text-[12px] text-text-muted">No vault shares. Deposit tDOT above to start.</p>
      </div>
    );
  }

  const sharesFormatted = formatTokenAmount(position.sharesBalance.toString(), 18, 6);
  const valueFormatted = formatTokenAmount(position.assetsValue.toString(), 18, 6);

  return (
    <div className="px-4 py-3 border-t border-border">
      <p className="text-[11px] text-text-muted uppercase tracking-widest mb-2">My Position</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Vault Shares</span>
          <span className="font-mono text-[12px] text-text-secondary">{sharesFormatted}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Redemption Value</span>
          <span className="font-mono text-[12px] text-primary font-semibold">{valueFormatted} tDOT</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `<UserPosition />` to dashboard page**

In `modules/app/src/app/page.tsx`, add the import at the top:
```typescript
import { UserPosition } from "@/components/dashboard/user-position";
```

In the right column `<div className="flex flex-col bg-surface">`, insert `<UserPosition />` between `<VaultActions />` and the `<div className="border-t border-border">` that wraps `<HealthIndicators />`:

```typescript
{/* Right: Trade form + position + health */}
<div className="flex flex-col bg-surface">
  <VaultActions />
  <UserPosition />
  <div className="border-t border-border">
    <HealthIndicators />
  </div>
</div>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```

- [ ] **Step 4: Manual smoke test**

Start dev server: `pnpm --filter @obidot/app run dev`
- Without wallet connected → "Connect wallet to view your position." visible below VaultActions
- With wallet connected but no shares → "No vault shares. Deposit tDOT above to start."
- After depositing → shares and redemption value appear

- [ ] **Step 5: Commit**

```bash
git add modules/app/src/components/dashboard/user-position.tsx modules/app/src/app/page.tsx
git commit -m "feat(app): add UserPosition panel to dashboard showing vault shares and redemption value"
```

---

## Task 6: Add recipient-filtered swap query to lib/graphql.ts

**Files:**
- Modify: `modules/app/src/lib/graphql.ts`

Context: `getIndexedSwapExecutions(limit, offset)` fetches all swaps. The `TradeHistory` component needs swaps for the connected address only. Since the indexer schema may not support recipient-param filtering, we fetch a larger batch and filter client-side.

- [ ] **Step 1: Add `getSwapExecutionsByRecipient` to `lib/graphql.ts`**

Add this function after `getIndexedSwapExecutions` (around line 160):

```typescript
/**
 * Fetch recent swap executions filtered to a specific recipient address.
 * Fetches the last 50 swaps and filters client-side (indexer may not support
 * recipient param on swapExecutions query).
 */
export async function getSwapExecutionsByRecipient(
  recipient: string,
  limit = 20,
): Promise<IndexedSwapExecution[]> {
  const all = await getIndexedSwapExecutions(50);
  return all
    .filter((s) => s.recipient.toLowerCase() === recipient.toLowerCase())
    .slice(0, limit);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/lib/graphql.ts
git commit -m "feat(app): add getSwapExecutionsByRecipient helper to graphql client"
```

---

## Task 7: Create TradeHistory component

**Files:**
- Create: `modules/app/src/components/swap/trade-history.tsx`

Context: Shows the connected user's swap history. On mount, fetches last 20 swaps via `getSwapExecutionsByRecipient` (TanStack Query). Subscribes to `useSwapSubscription` (singleton WS — same connection used by `OrdersPanel`) to prepend new swaps in real-time. Deduplication by `id` prevents doubles when a live event overlaps with fetched history. Links txHash to Blockscout.

- [ ] **Step 1: Create the file**

```typescript
// modules/app/src/components/swap/trade-history.tsx
"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { History, ExternalLink, Loader2 } from "lucide-react";
import {
  useSwapSubscription,
  type SwapEvent,
} from "@/hooks/use-graphql-subscription";
import {
  getSwapExecutionsByRecipient,
  type IndexedSwapExecution,
} from "@/lib/graphql";
import { CHAIN } from "@/lib/constants";

function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function SwapRow({ swap }: { swap: IndexedSwapExecution }) {
  const amtIn = parseFloat(formatUnits(BigInt(swap.amountIn), 18)).toFixed(4);
  const amtOut = parseFloat(formatUnits(BigInt(swap.amountOut), 18)).toFixed(4);
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-[12px] text-text-primary">
          {amtIn} → {amtOut}
        </p>
        <p className="text-[11px] text-text-muted">
          {swap.poolType} · {timeAgo(swap.timestamp)}
        </p>
      </div>
      <a
        href={`${CHAIN.blockExplorer}/tx/${swap.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-[11px] text-text-muted hover:text-primary transition-colors shrink-0 ml-3"
      >
        {swap.txHash.slice(0, 6)}…{swap.txHash.slice(-4)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export function TradeHistory() {
  const { address, isConnected } = useAccount();
  const [liveSwaps, setLiveSwaps] = useState<IndexedSwapExecution[]>([]);

  const {
    data: historicalSwaps,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trade-history", address],
    queryFn: () => getSwapExecutionsByRecipient(address!, 20),
    enabled: isConnected && !!address,
    staleTime: 60_000,
  });

  const handleNewSwap = useCallback(
    (event: SwapEvent) => {
      if (!address || event.recipient.toLowerCase() !== address.toLowerCase()) return;
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
      setLiveSwaps((prev) => [asIndexed, ...prev.slice(0, 19)]);
    },
    [address],
  );

  const { connected } = useSwapSubscription(handleNewSwap);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-center">
        <History className="h-6 w-6 text-text-muted" />
        <p className="text-[13px] text-text-muted">
          Connect wallet to view your trade history
        </p>
      </div>
    );
  }

  // Merge live + historical, deduplicate by id
  const allSwaps = [...liveSwaps, ...(historicalSwaps ?? [])].filter(
    (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-text-muted" />
          <span className="text-[15px] font-semibold text-text-primary">
            Trade History
          </span>
        </div>
        {!connected && (
          <span className="font-mono text-[11px] text-text-muted animate-pulse">
            Reconnecting…
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          </div>
        )}
        {error && !isLoading && (
          <p className="text-[12px] text-danger py-4">
            Failed to load history — live updates only
          </p>
        )}
        {!isLoading && allSwaps.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <History className="h-6 w-6 text-text-muted" />
            <p className="text-[13px] text-text-secondary font-semibold">
              No trades yet
            </p>
            <p className="text-[12px] text-text-muted">
              Your swap history will appear here
            </p>
          </div>
        )}
        {allSwaps.map((s) => (
          <SwapRow key={s.id} swap={s} />
        ))}
      </div>

      <div className="shrink-0 px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted text-center">
          Swaps executed via SwapRouter · indexed by obi.index
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/swap/trade-history.tsx
git commit -m "feat(app): add TradeHistory component with GraphQL history + live subscription"
```

---

## Task 8: Add "History" tab to trade-page.tsx limit panel

**Files:**
- Modify: `modules/app/src/components/trade/trade-page.tsx`

Context: Line 183 of `trade-page.tsx` currently renders `{activeTab === "limit" && <OrdersPanel />}`. Replace this with a two-tab switcher ("Open Positions" | "History") using local state `limitRightTab`. The tab switcher only appears in the right panel when `activeTab === "limit"`.

- [ ] **Step 1: Add import for TradeHistory**

At the top of `trade-page.tsx`, add:
```typescript
import { TradeHistory } from "@/components/swap/trade-history";
```

- [ ] **Step 2: Add local tab state**

Inside `TradePage`, after the existing `useState` declarations, add:
```typescript
const [limitRightTab, setLimitRightTab] = useState<"positions" | "history">("positions");
```

- [ ] **Step 3: Replace the limit panel rendering**

Replace this block (around line 182–183):
```typescript
{/* Limit tab: orders panel */}
{activeTab === "limit" && <OrdersPanel />}
```

With:
```typescript
{/* Limit tab: tab switcher + panel */}
{activeTab === "limit" && (
  <div className="flex flex-col h-full">
    {/* Tab switcher */}
    <div className="flex border-b border-border shrink-0">
      <button
        type="button"
        onClick={() => setLimitRightTab("positions")}
        className={cn(
          "flex-1 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
          limitRightTab === "positions"
            ? "border-primary text-primary"
            : "border-transparent text-text-muted hover:text-text-secondary",
        )}
      >
        Open Positions
      </button>
      <button
        type="button"
        onClick={() => setLimitRightTab("history")}
        className={cn(
          "flex-1 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
          limitRightTab === "history"
            ? "border-primary text-primary"
            : "border-transparent text-text-muted hover:text-text-secondary",
        )}
      >
        History
      </button>
    </div>
    {/* Panel content */}
    <div className="flex-1 overflow-hidden">
      {limitRightTab === "positions" ? <OrdersPanel /> : <TradeHistory />}
    </div>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```

- [ ] **Step 5: Manual smoke test**

Navigate to `/limit/polkadot-hub-testnet/tdot-to-tusdc` → right panel shows "Open Positions | History" tabs. Click History → `TradeHistory` renders.

- [ ] **Step 6: Commit**

```bash
git add modules/app/src/components/trade/trade-page.tsx
git commit -m "feat(app): add Open Positions / History tab switcher on limit trade panel"
```

---

## Task 9: Add fill detection to orders-panel.tsx

**Files:**
- Modify: `modules/app/src/components/swap/orders-panel.tsx`

Context: When the Obidot Agent fills a limit order on-chain, a `SwapExecuted` event fires in obi.index. We subscribe to `useSwapSubscription` and check each event against pending orders by matching `tokenIn`, `tokenOut`, and `amountIn` (within 5% tolerance). On match, mark the order `status: "filled"` in localStorage and re-render. Add a "Filled" section below "Active" and "Expired" sections.

The `recipient` field is the agent EOA — we do NOT use it for matching. Match only on token pair + amount proximity.

- [ ] **Step 1: Add imports to orders-panel.tsx**

Add these imports at the top of `orders-panel.tsx`:
```typescript
import { useAccount } from "wagmi";
import {
  useSwapSubscription,
  type SwapEvent,
} from "@/hooks/use-graphql-subscription";
```

- [ ] **Step 2: Add fill detection logic inside `OrdersPanel` component**

Inside the `OrdersPanel` function body, after the `reload` callback, add:

> **Note on deps:** `saveOrders` is defined at module scope (line 29 of `orders-panel.tsx`, outside the component) — it is stable and does not need to be in the `useCallback` dep array. `setOrders` from `useState` is also stable. Empty `[]` is correct here.

```typescript
const { address } = useAccount();

// Fill detection: match SwapExecuted events against pending orders
const handleSwapEvent = useCallback(
  (event: SwapEvent) => {
    setOrders((prev) => {
      let changed = false;
      const next = prev.map((order) => {
        if (order.status === "filled" || order.expiry <= Date.now()) return order;
        // Match on tokenIn + tokenOut addresses
        const tokenInMatch =
          order.tokenInAddress &&
          event.tokenIn.toLowerCase() === order.tokenInAddress.toLowerCase();
        const tokenOutMatch =
          order.tokenOutAddress &&
          event.tokenOut.toLowerCase() === order.tokenOutAddress.toLowerCase();
        if (!tokenInMatch || !tokenOutMatch) return order;
        // Match on amountIn within 5% tolerance
        try {
          const eventAmt = BigInt(event.amountIn);
          const orderAmt = BigInt(
            Math.round(parseFloat(order.amountIn) * 1e18).toString(),
          );
          const diff = eventAmt > orderAmt ? eventAmt - orderAmt : orderAmt - eventAmt;
          const tolerance = orderAmt * 5n / 100n;
          if (diff <= tolerance) {
            changed = true;
            return { ...order, status: "filled" as const };
          }
        } catch {
          // parseInt/BigInt parse failed — skip
        }
        return order;
      });
      if (changed) saveOrders(next);
      return changed ? next : prev;
    });
  },
  [],
);

useSwapSubscription(handleSwapEvent);
```

- [ ] **Step 3: Derive filled orders and add FILLED section to JSX**

After the existing `activeOrders` and `expiredOrders` derivations, add:
```typescript
const filledOrders = orders.filter((o) => o.status === "filled");
```

In the JSX, after the `expiredOrders` section (and before the closing `</div>` of the scrollable area), add:

```typescript
{filledOrders.length > 0 && (
  <div className="space-y-2">
    <p className="text-[12px] text-text-muted uppercase tracking-wider">
      Filled ({filledOrders.length})
    </p>
    {filledOrders.map((o) => (
      <div key={o.id} className="border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[13px] text-text-primary font-semibold">
            {o.amountIn} {o.tokenInSymbol} → {o.tokenOutSymbol}
          </span>
          <span className="font-mono text-[11px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5">
            FILLED
          </span>
        </div>
        <p className="text-[11px] text-text-muted font-mono mt-1">
          At: {Number(o.targetPrice).toFixed(6)} {o.tokenOutSymbol}/{o.tokenInSymbol}
        </p>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck 2>&1 | head -30
```

- [ ] **Step 5: Manual smoke test**

Place a limit order → it appears as PENDING. (Full fill detection requires agent to execute on-chain and obi.index to index it — confirm the subscription connects without error via browser console.)

- [ ] **Step 6: Final typecheck + lint**

```bash
pnpm --filter @obidot/app run typecheck && pnpm --filter @obidot/app run lint
```

- [ ] **Step 7: Commit**

```bash
git add modules/app/src/components/swap/orders-panel.tsx
git commit -m "feat(app): add limit order fill detection via obi.index SwapExecuted subscription"
```
