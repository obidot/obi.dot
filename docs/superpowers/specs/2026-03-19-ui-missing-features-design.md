# UI Missing Features Design Spec
**Date:** 2026-03-19
**Status:** Approved

## Goal

Add three missing features to the Obidot web UI:
1. **My Position panel** — per-user vault share balance and redemption value on the dashboard
2. **Swap/Trade History** — "History" tab in the limit-order right panel, powered by obi.index GraphQL
3. **Limit Order Fill Detection** — mark localStorage orders as FILLED when a matching `SwapExecuted` event arrives from obi.index

## Architecture

### Existing infrastructure leveraged
- ERC-4626 vault ABI in `modules/app/src/lib/abi.ts` (`VAULT_ABI`) — has `balanceOf`, `convertToAssets`; does NOT have `previewRedeem` (not needed — `convertToAssets(sharesBalance)` is sufficient)
- `useSwapSubscription` and `useDepositSubscription` hooks in `use-graphql-subscription.ts` — wired to nothing currently; the singleton `_client` handles multiple subscribers on one WS connection safely
- `CONTRACTS.VAULT` address in `lib/constants.ts`
- `GRAPHQL_HTTP_URL` in `lib/constants.ts` for one-time history fetch
- `useAccount` (wagmi) gives connected wallet address
- Orders stored in `localStorage` under key `obidot_limit_orders`; `PendingOrder` type is local to `orders-panel.tsx` — must be extracted to `types/index.ts` before extension

### What gets added
- `useUserVaultPosition` hook — reads `balanceOf` and `convertToAssets` from vault
- `UserPosition` dashboard component — shows shares and redemption value
- `TradeHistory` component — shows recent swaps from obi.index GraphQL
- Fill detection logic in `OrdersPanel` — subscribes to `SwapExecuted`, matches by `tokenIn + tokenOut + amountIn`

## Components

### 1. `useUserVaultPosition` hook (`src/hooks/use-user-vault-position.ts`)
Uses `useReadContracts` to batch two vault reads per poll cycle (15s staleTime):
- `balanceOf(address)` → shares balance
- `convertToAssets(sharesBalance)` → current redemption value in tDOT

Enabled only when wallet is connected and `sharesBalance > 0n` (to avoid useless reads).

### 2. `UserPosition` component (`src/components/dashboard/user-position.tsx`)
- Shows when wallet connected, empty/connect-prompt state otherwise
- Fields: Vault Shares (formatted), Your Value (tDOT), (no APY — no data source exists)
- Placed in dashboard page below `VaultActions` in the right column

### 3. `TradeHistory` component (`src/components/swap/trade-history.tsx`)
- On mount, fetches last 20 swaps for the connected address via GraphQL HTTP query:
  ```graphql
  query { swaps(where: { recipient: $address }, orderBy: timestamp_DESC, limit: 20) {
    id txHash tokenIn tokenOut amountIn amountOut poolType timestamp blockNumber
  }}
  ```
- Subscribes to `useSwapSubscription` to prepend real-time new swaps (same singleton WS client as `OrdersPanel` — no duplicate connections)
- Displays: token pair, amounts, pool label, timestamp, truncated txHash linking to blockscout
- Filters to `recipient === address` (the swap executor's address from wagmi)

**Tab placement:** In `trade-page.tsx`, on the `limit` tab, the right panel currently renders `<OrdersPanel />` unconditionally. Change this to render a two-tab switcher: "Open Positions" (existing `OrdersPanel`) | "History" (`TradeHistory`). This tab switcher is local state within `trade-page.tsx`'s limit-tab rendering — it does not affect swap/crosschain tab behavior.

### 4. Fill detection in `OrdersPanel` + type extraction

**Step 0 — extract `PendingOrder` to `types/index.ts`:**
```typescript
export interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInAddress: string;   // add for matching
  tokenOutAddress: string;  // add for matching
  amountIn: string;
  targetPrice: string;
  expiry: number;
  marketPriceAtOrder: string;
  createdAt: number;
  status?: "pending" | "filled"; // new optional field
}
```
`orders-panel.tsx` and `limit-order-panel.tsx` both import from `types/index.ts`.

**Fill matching:** When a `SwapExecuted` event fires from obi.index, check:
- `event.tokenIn.toLowerCase() === order.tokenInAddress.toLowerCase()`
- `event.tokenOut.toLowerCase() === order.tokenOutAddress.toLowerCase()`
- `BigInt(event.amountIn) >= BigInt(order.amountIn) * 95n / 100n` (within 5% — handles partial fills and rounding)

If matched: set `order.status = "filled"` in localStorage and trigger a re-render.

Note on `recipient`: limit orders are executed by the Obidot Agent (not the user), so `recipient` in the event is the agent's EOA — we cannot use it for matching. Match only on token pair + amountIn proximity.

## Data Flow

```
obi.index GraphQL HTTP (on mount)
  └─ TradeHistory: fetch last 20 swaps for address

obi.index GraphQL WS (singleton _client)
  ├─ useSwapSubscription (TradeHistory) → prepend new swaps to list
  └─ useSwapSubscription (OrdersPanel)  → match against pending orders → mark FILLED

ERC-4626 Vault (wagmi useReadContracts, 15s poll)
  └─ useUserVaultPosition → UserPosition component

localStorage "obidot_limit_orders"
  └─ PendingOrder[] with optional status field
       └─ OrdersPanel (renders FILLED section separately)
```

## Error Handling
- `useUserVaultPosition`: wallet not connected → empty state with "Connect wallet to view position"
- `TradeHistory` HTTP fetch fails → show subscription-only real-time feed; show error banner
- `TradeHistory` subscription disconnects → stale list visible; "Reconnecting..." dot in header
- Fill detection match error → silently skip; never corrupt localStorage

## Testing
- Manual: Deposit via VaultActions → My Position shows balance
- Manual: Execute a swap → appears in History tab real-time
- Manual: Place a limit order (must also store `tokenInAddress`/`tokenOutAddress`) → agent fills → FILLED badge appears

## File Structure

**New files:**
- `src/hooks/use-user-vault-position.ts`
- `src/components/dashboard/user-position.tsx`
- `src/components/swap/trade-history.tsx`

**Modified files:**
- `src/types/index.ts` — extract + extend `PendingOrder`
- `src/app/(dashboard)/page.tsx` — add `UserPosition` below `VaultActions`
- `src/components/swap/orders-panel.tsx` — import `PendingOrder` from types, add fill detection + FILLED rendering
- `src/components/swap/limit-order-panel.tsx` — import `PendingOrder` from types, add `tokenInAddress`/`tokenOutAddress` to stored order
- `src/components/trade/trade-page.tsx` — on limit tab right panel: add local "Open Positions" | "History" tab switcher

## Constraints
- No new pages, no new nav items
- Follow existing patterns: wagmi hooks, TanStack Query style, Tailwind classes from design system
- Do not break existing VaultActions, OrdersPanel, or trade page tab behavior
- `previewRedeem` NOT needed — `convertToAssets(sharesBalance)` gives the same value
