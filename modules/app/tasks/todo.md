# Obidot Retro UI Redesign & Logic Verification Plan

## Design Direction

### Reference extraction: Text2Form
- Pastel checkerboard/grid background with subtle animated color pulses
- Thick black borders and offset retro shadows instead of glassmorphism
- Blocky display typography for headlines, labels, tabs, and action buttons
- Flat white/cream surfaces with yellow, blue, green, and red action accents
- Dense framed sections with visible separators, dashed dividers, and status chips

### Obidot adaptation
- Keep Text2Form's retro shell, but shift the product tone from "playful form builder" to "serious experimental trading terminal"
- Use cream + pale sage + pale blue background grid, white cards, black borders, and restrained accent colors:
  - Yellow: primary action
  - Blue: analytics / navigation / secondary emphasis
  - Green: yield-positive / success / live
  - Red: danger / destructive / emergency
- Preserve Obidot-specific product semantics: vault, routes, protocols, strategy actions, cross-chain state, Polkadot Hub TestNet
- Replace current glossy trading-terminal gradients with framed data panels, retro tabs, pixel-style badges, and bold section labels
- Treat visual consistency as a hard requirement: every page and every reusable component must inherit the same shell, spacing rhythm, border language, button system, and typography hierarchy

## Audit Findings To Fix During Redesign

- [ ] `src/components/dashboard/vault-actions.tsx`
  - Withdraw mode still derives "Available Balance" and percent shortcuts from wallet `TEST_DOT` balance instead of withdrawable vault position
- [ ] `src/shared/navbar.ts`
  - Trade dropdown links are inconsistent with actual route model; `/cross-chain` does not match the `crosschain` trade slug
- [ ] `src/components/strategies/strategy-detail.tsx`
  - Transaction explorer link still points to Paseo Blockscout instead of Polkadot Hub TestNet
- [ ] `src/components/strategies/strategy-table.tsx`
  - Same stale Paseo Blockscout link as strategy detail
- [ ] `package.json`
  - `lint` uses `next lint`, which is interactive here and currently blocks non-interactive verification
- [ ] `src/components/ui/navigation-menu.tsx`
  - Utility classes include `transition-all`, `outline-none`, and forced focus resets that should be cleaned up during shell refactor
- [ ] `src/components/liquidity/liquidity-panel.tsx`
  - Amount inputs rely on visual labels only; no proper label binding or aria label, and focus outline is removed
- [ ] `src/components/agent/decision-card.tsx`
  - Clickable card uses `div role="button"` with Enter-only keyboard handling; should be a real button or fully keyboard-complete
- [ ] Wallet / build integration
  - Production build succeeds, but RainbowKit / MetaMask currently emits a module-resolution warning that should be cleaned up before final rollout

## Implementation Plan

### Phase 1: System Foundation
- [ ] Replace the current `globals.css` theme with a retro Obidot token system
- [ ] Define CSS variables for:
  - background grid colors
  - border / shadow depth
  - action accent palette
  - typography stacks for display vs body vs mono
- [ ] Build reusable primitives:
  - retro panel
  - retro button variants
  - section label / eyebrow
  - metric card
  - status pill
  - framed table
- [ ] Add motion rules that only animate `transform` / `opacity`
- [ ] Add reduced-motion handling for animated background and panel reveals

### Phase 2: App Shell
- [ ] Redesign `src/components/layout/navbar.tsx` to match the retro system
- [ ] Make navigation model consistent:
  - top-level Trade entry resolves to canonical dynamic route
  - dropdown children use valid trade slugs
  - labels and URLs align with `TradeActionType`
- [ ] Add a proper skip link in `src/app/layout.tsx`
- [ ] Move the live ticker into a framed sub-bar that looks like a terminal tape, not a translucent strip
- [ ] Retheme wallet controls in `custom-connect-button.tsx` to match the shell instead of RainbowKit defaults

### Phase 3: Yields / Vault Screen
- [ ] Rebuild `/yields` as the flagship retro dashboard
- [ ] New composition:
  - hero strip with vault total assets, idle balance, active strategies, network state
  - framed market board for yield sources
  - right rail for deposit / withdraw and user position
  - recent activity feed styled like a ledger
- [ ] Fix vault action logic at the same time:
  - separate deposit wallet balance from withdrawable vault balance
  - adjust percent buttons to the correct source balance for each action
  - ensure success / error / pending states remain explicit in the new visual language
- [ ] Redesign the liquidity side panel with:
  - full-height drawer backdrop
  - mobile-safe width
  - proper field labels and focus states
  - framed progress steps for approve -> approve -> add/remove

### Phase 4: Trade Surface
- [ ] Consolidate visual direction around the dynamic trade route pages, not the legacy `/swap` shell
- [ ] Restyle `trade-page.tsx`, `swap-panel.tsx`, `swap-form.tsx`, and `route-diagram.tsx`
- [ ] Convert trade tabs into bold retro segmented controls
- [ ] Reframe the route diagram as a route board with ranked cards, leg markers, and protocol stamps
- [ ] Normalize informational surfaces:
  - warnings
  - fees
  - slippage
  - route type
  - execution call-to-action
- [ ] Ensure limit and cross-chain tabs visually read as product modules, not placeholders

### Phase 5: Insights / Agent / Strategies / Cross-Chain
- [ ] Apply the same design system to secondary pages without making them visually identical
- [ ] Insights:
  - framed charts
  - clearer hierarchy between metrics and analysis widgets
- [ ] Agent:
  - decision cards become real interactive controls
  - event feed styled as an operations log
- [ ] Strategies:
  - update explorer links to Polkadot Hub TestNet
  - restyle detail drawer with the retro panel system
- [ ] Cross-chain:
  - remove any stale Paseo naming
  - present chain topology and health in framed operational panels

### Phase 6: Verification & Cleanup
- [ ] Replace the broken lint flow with a non-interactive ESLint setup
- [ ] Re-run:
  - `pnpm --filter @obidot/app run typecheck`
  - `pnpm --filter @obidot/app run lint`
  - `pnpm --filter @obidot/app run build`
- [ ] Fix the MetaMask / RainbowKit build warning or explicitly isolate it with a documented workaround
- [ ] Run a final accessibility pass on:
  - navigation
  - drawers / dialogs
  - all numeric inputs
  - icon buttons
  - live / loading states

## Rollout Order

- [ ] 1. Theme tokens + primitives
- [ ] 2. Navbar + app shell
- [ ] 3. Yields page + vault actions + liquidity drawer
- [ ] 4. Dynamic trade pages
- [ ] 5. Insights / Agent / Strategies / Cross-chain
- [ ] 6. Verification, lint migration, and final polish

## Review

- `ccc index` completed successfully for this repo before planning
- `pnpm --filter @obidot/app run typecheck` passes
- `pnpm --filter @obidot/app run build` passes with a RainbowKit / MetaMask warning
- `pnpm --filter @obidot/app run lint` is currently not usable because `next lint` prompts for initial setup

---

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

### Manual Smoke Checklist
- Split swap:
  - Open `/swap` or `/swap/polkadot-hub-testnet/<pair>`
  - Select two live local routes with weights summing to `10000`
  - Confirm high-impact acknowledgement resets after changing route, amount, or token pair
  - Execute with a connected wallet and verify `swapSplit()` settles on Polkadot Hub TestNet Blockscout
- Relay teleport:
  - Open the `Cross-Chain` tab and select `Relay Teleport`
  - Verify only `tDOT` input is executable and other destination lanes stay preview-only
  - Approve once, execute, and confirm the button progression is `Approve -> Teleporting -> Done`
  - Verify the receive estimate and transaction link match Polkadot Hub TestNet
- Liquidity add/remove:
  - Open `/yields`, choose a UV2 row, and launch the liquidity panel
  - Add flow: approve token0, approve token1, add liquidity, then confirm LP balance updates
  - Remove flow: use a percentage shortcut, compare expected output to pool share, approve LP, remove liquidity
  - Reject one wallet signature in both add/remove flows and confirm the UI falls into an error state instead of hanging

_To be filled in after completion._
