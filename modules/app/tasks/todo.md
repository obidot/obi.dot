# UI Feature Gap Plan — modules/app

## Gap Analysis: obi.router vs Current App

### What obi.router supports that the app is MISSING:

| Feature | Contract/API | Priority | Status |
|---------|------------|---------|--------|
| `swapSplit()` — split-route execution | `SwapRouter.swapSplit()` | HIGH | ❌ Missing |
| All-quotes comparison | `SwapQuoter.getAllQuotes()` | HIGH | ❌ Missing |
| Limit Order panel | UniversalIntent / agent | HIGH | ⚠️ Stub only |
| Cross-Chain panel | XCM routes / crosschain stubs | HIGH | ⚠️ Stub only |
| Price impact warning | Derived from route data | MED | ❌ Missing |
| Block explorer TX links | `CHAIN.blockExplorer` | LOW | ❌ Missing |
| Output token balance | wagmi `useBalance` | LOW | ❌ Missing |

### CocoIndex note:
No local postgres running — CocoIndex indexing skipped (no `COCOINDEX_DATABASE_URL`).
Flow written to `/tmp/cocoindex_obidot/index_flow.py` for future use when postgres is available.

---

## Implementation Plan

### Feature 1: All-Quotes Comparison Table [ ]
**Goal**: Show all adapter quotes side-by-side in route diagram when amount entered.

**Changes:**
- `src/hooks/use-swap.ts` — add `useAllQuotes` hook (wagmi `useReadContract` calling `getAllQuotes`)
- `src/components/swap/route-diagram.tsx` — add `<AllQuotesTable>` section above on-chain routes; shows each adapter's quote with savings vs best

**Design:**
```
ADAPTER QUOTES
┌──────────────────────────────────────────────────────┐
│ [BEST] Hydration Omnipool    0.048500 tUSDC    —     │
│        AssetHub Pair          0.047900 tUSDC  -1.2%  │
│        Bifrost DEX            0.000000 tUSDC  N/A    │
└──────────────────────────────────────────────────────┘
```

---

### Feature 2: Split-Route Execution [ ]
**Goal**: Allow user to select 2 routes with configurable weights and execute `swapSplit()`.

**Changes:**
- `src/hooks/use-swap.ts` — add `useSplitSwap` hook to call `swapSplit()`
- `src/components/swap/route-diagram.tsx` — add multi-select mode:
  - Checkbox on each local route card
  - Weight slider (default 50/50) when 2 routes selected
  - "SPLIT" badge on selected routes
- `src/components/swap/swap-form.tsx` — detect `selectedSplitRoutes` (from route diagram) and call `swapSplit()` instead of `swapFlat`/`swapMultiHop`
- `src/types/index.ts` — add `SplitLeg`, `SplitRouteSelection` types
- `src/lib/abi.ts` — add `swapSplit` to `SWAP_ROUTER_ABI`

**Contract call:**
```ts
swapSplit(
  legs: [{ route: hop0Route, weight: 6000 }, { route: hop1Route, weight: 4000 }],
  tokenIn, tokenOut, amountIn, minAmountOut, to, deadline
)
```

---

### Feature 3: Real Cross-Chain Panel [ ]
**Goal**: Replace stub with real XCM/bridge route display + chain details.

**Changes:**
- `src/components/swap/cross-chain-panel.tsx` — full rewrite:
  - Chain selector (Hydration/Bifrost/AssetHub/RelayTeleport/Karura/Moonbeam/Interlay + bridges)
  - Reads cross-chain routes from `useRouteFinder` filtered to `xcm` / `bridge`
  - Shows chain paraID, estimated time, status badges
  - Execution button (disabled for mainnet_only / coming_soon; active for live)
  - Connects to `swapFlat()` for XCM-live routes
- `src/types/index.ts` — add `XCM_CHAINS` constant map
- No new hooks needed — reuses `useRouteFinder`

**Design:**
```
CROSS-CHAIN SWAP
Destination Chain ────────────────────────────────
[Hydration ▼] parachain 2034  [XCM]  [LIVE]

Route Details ────────────────────────────────────
You Pay:    1.000 tDOT
You Receive: — (select amount)
Est. Time:  ~30s (XCM)

[RelayTeleport (XCM)]  LIVE    0.998 tDOT  ✓
[Hydration (XCM)]      MAINNET ONLY
[Bifrost DEX (XCM)]    MAINNET ONLY
[Snowbridge]           COMING SOON
```

---

### Feature 4: Real Limit Order Panel [ ]
**Goal**: Replace stub with real target-price limit order form.

**Changes:**
- `src/components/swap/limit-order-panel.tsx` — full rewrite:
  - Token pair selector (same as swap form)
  - "You Pay" amount input
  - "At Price" target rate input (tokenOut per tokenIn)
  - Expiry selector: 1h / 24h / 7d
  - Current market price display (from useSwapQuote)
  - "% above/below market" helper label
  - Submit routes to agent via `/api/chat` with intent text
  - Pending orders list (in-memory, localStorage)
- `src/hooks/use-vault-state.ts` — already exists; reuse for idle balance context

**Note**: Execution via agent's UniversalIntent (EIP-712). The UI submits the order to the agent which monitors price and executes when target is hit.

---

### Feature 5: Price Impact Warning + Block Explorer Links [ ]
**Goal**: Warn on high impact; link TX hashes to explorer.

**Changes:**
- `src/components/swap/swap-form.tsx`:
  - Add `HighImpactWarning` component — shown when selected route has `totalPriceImpactBps > 200` (>2%)
  - Requires extra "I understand" click before swap executes
  - TX hash links to `CHAIN.blockExplorer/tx/{hash}`
  - Show output token balance below "You Receive"
- `src/lib/constants.ts` — already has `CHAIN.blockExplorer`

---

## Implementation Order

- [x] Setup: CLAUDE.md, CocoIndex flow (written, needs postgres to run)
- [ ] **Step 1**: `useAllQuotes` hook + quote comparison table in route diagram
- [ ] **Step 2**: Split-route execution (multi-select + `swapSplit()`)
- [ ] **Step 3**: Real Cross-Chain panel (XCM route display + chain selector)
- [ ] **Step 4**: Real Limit Order panel (target price form + agent submission)
- [ ] **Step 5**: Price impact warning + block explorer TX links + output balance

---

## Review

_To be filled in after completion._
