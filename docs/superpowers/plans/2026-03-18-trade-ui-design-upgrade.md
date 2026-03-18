# Trade UI Design Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Obidot swap UI from a basic form into an intelligent execution layer with prominent execution metrics, animated route visualization, fill probability, and polished design tokens.

**Architecture:** Targeted in-place upgrades to `swap-form.tsx`, `quote-display.tsx`, `route-diagram.tsx`, and `globals.css`. No new pages, no new hooks — the data already exists, we're upgrading how it's presented. Each task is a focused file edit.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v4, wagmi v2, viem v2, lucide-react

---

## File Map

| File | Change |
|---|---|
| `src/app/globals.css` | Add `--color-primary-soft`, `--color-primary-glow`, `--color-primary-hover`; upgrade `.btn-primary` height, radius; new `.execution-metric` utility |
| `src/components/swap/quote-display.tsx` | Promote Min Received + Price Impact to large, color-coded metric rows |
| `src/components/swap/swap-form.tsx` | Input typography upgrade (28px amount), token box refinement, improve button label clarity |
| `src/components/swap/route-diagram.tsx` | Animated SVG connector lines, route quality metrics box, fill probability badge, cleaner route cards |
| `src/components/trade/trade-page.tsx` | Improve right-panel empty state with adapter pills; tighten outer layout padding |

---

## Task 1: Design Token Additions

**Files:**
- Modify: `src/app/globals.css` (lines 9–36)

- [ ] **Step 1: Add missing primary variants to `@theme`**

In `globals.css`, inside the `@theme { }` block after `--color-primary-dim`, add:

```css
  --color-primary-soft: rgba(230, 0, 122, 0.08);
  --color-primary-glow: rgba(230, 0, 122, 0.25);
  --color-primary-hover: #ff1a8c;
```

- [ ] **Step 2: Add `.execution-metric` utility class** (add after `.stat-number` section ~line 619)

```css
/* ── Execution Metric (large key stats in quote display) ─────────────── */

.execution-metric-label {
  font-size: 12px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}

.execution-metric-value {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}
```

- [ ] **Step 3: Upgrade `.btn-primary` glow transition**

Find and **remove** the existing `.btn-primary:hover` block in `globals.css` (it currently sets `background: #ff1a8c` and `box-shadow: 0 0 20px rgba(230, 0, 122, 0.3)`). Replace it with this new rule:

```css
.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: 0 0 24px var(--color-primary-glow);
  transform: translateY(-1px);
}
```

Note: `--color-primary-hover` is added as a plain CSS custom property (not a Tailwind utility). It is used only in raw CSS rules like this one — not via Tailwind class names. This is correct since the `@theme inline` block would shadow it otherwise.

- [ ] **Step 4: Verify build compiles**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot && git add modules/app/src/app/globals.css && git commit -m "feat(design): add primary-soft/glow tokens, execution-metric utility"
```

---

## Task 2: Quote Display — Execution Summary Upgrade

**Files:**
- Modify: `src/components/swap/quote-display.tsx`

The current QuoteDisplay shows Rate / Route / Pool Fee / Slippage / Min Received as a plain list. Upgrade: promote **Min Received** and **Price Impact** to large metric cards at the top; move Rate/Fee/Slippage to a collapsible details row below.

The `quote` object from `useSwapQuote` has `totalPriceImpactBps` (number). The `SwapQuoteResult` type should have this. Check:

```bash
grep -n "priceImpact\|totalPriceImpact" /home/harry-riddle/dev/github.com/obidot/obidot/modules/app/src/types/index.ts
```

If `totalPriceImpactBps` is not on `SwapQuoteResult`, it comes from the route — use `0` as fallback for now.

- [ ] **Step 1: Rewrite `quote-display.tsx`**

```tsx
import { formatUnits } from "viem";
import { cn } from "@/lib/format";
import { PoolType, POOL_TYPE_LABELS } from "@/types";
import type { SwapQuoteResult, SwapToken } from "@/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface QuoteDisplayProps {
  quote: SwapQuoteResult;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  slippageBps: number;
  minAmountOut: string;
  priceImpactBps?: number;
}

export function QuoteDisplay({
  quote,
  tokenIn,
  tokenOut,
  slippageBps,
  minAmountOut,
  priceImpactBps = 0,
}: QuoteDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const feePercent = (quote.feeBps / 100).toFixed(2);
  const sourceLabel = POOL_TYPE_LABELS[quote.source as PoolType] ?? "Unknown";
  const slippagePercent = (slippageBps / 100).toFixed(1);
  const impactPct = (priceImpactBps / 100).toFixed(2);

  const impactColor =
    priceImpactBps < 50
      ? "text-bull"
      : priceImpactBps < 200
        ? "text-warning"
        : "text-danger";

  const rateDisplay = (() => {
    try {
      const inFloat = Number(formatUnits(BigInt(quote.amountIn), tokenIn.decimals));
      const outFloat = Number(formatUnits(BigInt(quote.amountOut), tokenOut.decimals));
      if (inFloat <= 0) return null;
      return `1 ${tokenIn.symbol} = ${(outFloat / inFloat).toFixed(6)} ${tokenOut.symbol}`;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-3 mb-4 pb-3 border-b border-border">
      {/* Big metric row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Min Received */}
        {minAmountOut && (
          <div className="bg-background/60 border border-border px-3 py-2.5">
            <p className="execution-metric-label mb-1">Min Received</p>
            <p className="execution-metric-value text-text-primary">
              {Number(minAmountOut).toFixed(4)}
              <span className="text-[12px] text-text-muted font-normal ml-1">{tokenOut.symbol}</span>
            </p>
          </div>
        )}
        {/* Price Impact */}
        <div className="bg-background/60 border border-border px-3 py-2.5">
          <p className="execution-metric-label mb-1">Price Impact</p>
          <p className={cn("execution-metric-value", impactColor)}>
            {impactPct}
            <span className="text-[12px] font-normal ml-0.5">%</span>
          </p>
        </div>
      </div>

      {/* Expandable details */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-[12px] text-text-muted hover:text-text-secondary transition-colors"
      >
        <span>{rateDisplay ?? "Details"}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Route</span>
            <span className="font-mono text-[13px] text-accent">{sourceLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Pool Fee</span>
            <span className="font-mono text-[13px] text-text-secondary">{feePercent}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Max Slippage</span>
            <span className="font-mono text-[13px] text-text-secondary">{slippagePercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `swap-form.tsx` to pass `priceImpactBps` to QuoteDisplay**

In `swap-form.tsx`, find the `<QuoteDisplay ... />` usage (~line 502) and add the `priceImpactBps` prop:

```tsx
<QuoteDisplay
  quote={quote}
  tokenIn={tokenIn}
  tokenOut={tokenOut}
  slippageBps={slippageBps}
  minAmountOut={minOutDisplay}
  priceImpactBps={activeImpactBps}
/>
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot && git add modules/app/src/components/swap/quote-display.tsx modules/app/src/components/swap/swap-form.tsx && git commit -m "feat(swap): upgrade QuoteDisplay with prominent min-received and price-impact metrics"
```

---

## Task 3: Swap Form Input Typography

**Files:**
- Modify: `src/components/swap/swap-form.tsx`

Goal: make the amount input feel like a proper trading UI (large, dominant number). Token picker should feel secondary.

- [ ] **Step 1: Upgrade Token-In box input size**

In `swap-form.tsx`, find the `input` for Token In (~line 421):

```tsx
className="input-trading text-left text-2xl font-semibold w-full bg-transparent border-0 focus:ring-0 p-0"
```

Change to:

```tsx
className="input-trading text-left text-[28px] font-bold w-full bg-transparent border-0 focus:ring-0 p-0 tracking-tight"
```

- [ ] **Step 2: Upgrade Token-Out display size**

Find the read-only output input (~line 486):

```tsx
className="input-trading text-left text-2xl font-semibold w-full bg-transparent border-0 focus:ring-0 p-0 text-text-secondary"
```

Change to:

```tsx
className="input-trading text-left text-[28px] font-bold w-full bg-transparent border-0 focus:ring-0 p-0 text-text-secondary tracking-tight"
```

- [ ] **Step 3: Add USD value placeholder line** (after both inputs' `<p>` with `≈ —`)

Update both `≈ —` lines to be more informative when loading:

Token In `<p>` (~line 429): change from `{amountIn && Number(amountIn) > 0 ? "≈ —" : ""}` to:
```tsx
{amountIn && Number(amountIn) > 0 ? (
  <span className="text-text-muted">≈ market value</span>
) : null}
```

Token Out `<p>` (~line 490): same pattern.

- [ ] **Step 4: Typecheck and commit**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck 2>&1 | tail -5
cd /home/harry-riddle/dev/github.com/obidot/obidot && git add modules/app/src/components/swap/swap-form.tsx && git commit -m "feat(swap): upgrade amount input to 28px bold for trading-terminal feel"
```

---

## Task 4: Route Diagram — Animated Connectors & Fill Probability

**Files:**
- Modify: `src/components/swap/route-diagram.tsx`
- Modify: `src/app/globals.css` (add animation)

Goal:
1. Replace flat `h-px bg-border` hop connectors with animated SVG flow lines in primary color
2. Add a **Fill Probability** badge to each route card based on status + impact
3. Upgrade the `HopFlow` connector to use primary-tinted dashes with a traveling dot animation

### 4a: Add CSS animation for route flow

- [ ] **Step 1: Add `route-flow` animation to `globals.css`**

After `.xcm-dot` section (~line 655):

```css
/* ── Route Flow (animated connector line) ─────────────────────────────── */

@keyframes route-dash {
  to {
    stroke-dashoffset: -20;
  }
}

.route-flow-line {
  stroke: var(--color-primary);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  animation: route-dash 0.8s linear infinite;
  opacity: 0.7;
}

.route-flow-line-static {
  stroke: var(--color-border);
  stroke-width: 1.5;
}
```

### 4b: Upgrade HopFlow component

- [ ] **Step 2: Replace `HopFlow` connector lines with SVG**

In `route-diagram.tsx`, replace the `HopFlow` function entirely:

Use CSS-only animated connector instead of SVG (avoids SVG percentage coordinate browser issues):

```tsx
function HopFlow({ hops, animated = false }: { hops: RouteHop[]; animated?: boolean }) {
  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto pb-1 min-h-[64px]">
      {hops.map((hop, i) => (
        <div key={i} className="flex items-center gap-0 flex-1 min-w-0">
          {i === 0 && (
            <>
              <TokenNode symbol={hop.tokenInSymbol} amount={hop.amountIn} />
              <div
                className={cn(
                  "flex-1 self-center mx-1 min-w-[20px] h-px",
                  animated
                    ? "bg-primary/40 shadow-[0_0_4px_rgba(230,0,122,0.4)]"
                    : "bg-border",
                )}
                style={animated ? { backgroundImage: "repeating-linear-gradient(90deg, var(--color-primary) 0, var(--color-primary) 6px, transparent 6px, transparent 10px)", backgroundSize: "20px 100%", animation: "route-dash-bg 0.6s linear infinite" } : {}}
              />
            </>
          )}
          <div className="flex flex-col items-center shrink-0 mx-1">
            <div className={cn(
              "border px-2.5 py-1.5 text-center transition-colors",
              animated ? "bg-primary/5 border-primary/20" : "bg-surface-hover border-border",
            )}>
              <p className={cn("font-mono text-[12px] font-medium whitespace-nowrap", animated ? "text-primary" : "text-text-secondary")}>{hop.poolLabel}</p>
              <p className="font-mono text-[11px] text-text-muted">{(Number(hop.feeBps) / 100).toFixed(2)}%</p>
            </div>
          </div>
          <div
            className={cn(
              "flex-1 self-center mx-1 min-w-[20px] h-px",
              animated
                ? "bg-primary/40"
                : "bg-border",
            )}
            style={animated ? { backgroundImage: "repeating-linear-gradient(90deg, var(--color-primary) 0, var(--color-primary) 6px, transparent 6px, transparent 10px)", backgroundSize: "20px 100%", animation: "route-dash-bg 0.6s linear infinite" } : {}}
          />
          <TokenNode symbol={hop.tokenOutSymbol} amount={hop.amountOut} />
        </div>
      ))}
    </div>
  );
}
```

And in `globals.css`, replace the `route-dash` keyframe with a background-position animation:

```css
@keyframes route-dash-bg {
  from { background-position: 0 0; }
  to   { background-position: 20px 0; }
}
```

Remove the `route-flow-line` and `route-flow-line-static` CSS classes (they're no longer needed with the CSS-only approach).

### 4c: Add Fill Probability to route cards

- [ ] **Step 3: Add `fillProbability` helper and badge**

Add before the `LocalRouteCard` function:

```tsx
/** Estimate fill probability 0–100 from route metadata */
function fillProbability(route: SwapRouteResult): number {
  if (route.status !== "live") return 0;
  const impact = Number(route.totalPriceImpactBps);
  if (impact < 30) return 97;
  if (impact < 100) return 90;
  if (impact < 200) return 78;
  if (impact < 500) return 55;
  return 30;
}

function FillBadge({ prob }: { prob: number }) {
  const color = prob >= 90 ? "text-bull border-bull/30 bg-bull/5" : prob >= 70 ? "text-warning border-warning/30 bg-warning/5" : "text-danger border-danger/30 bg-danger/5";
  return (
    <span className={cn("font-mono text-[11px] border px-1.5 py-0.5", color)}>
      {prob}% FILL
    </span>
  );
}
```

- [ ] **Step 4: Use animated HopFlow + FillBadge in LocalRouteCard**

In `LocalRouteCard`, update two things:

1. Change `<HopFlow hops={route.hops} />` to `<HopFlow hops={route.hops} animated={selected || splitSelected} />`

2. Add `<FillBadge prob={fillProbability(route)} />` next to the BEST badge in the top row:
```tsx
{isBest && <FillBadge prob={fillProbability(route)} />}
```

- [ ] **Step 5: Typecheck and commit**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck 2>&1 | tail -10
cd /home/harry-riddle/dev/github.com/obidot/obidot && git add modules/app/src/components/swap/route-diagram.tsx modules/app/src/app/globals.css && git commit -m "feat(route): animated SVG connectors, fill probability badges on route cards"
```

---

## Task 5: Right Panel — Empty State & Layout Polish

**Files:**
- Modify: `src/components/trade/trade-page.tsx`

Goal: the right panel empty state ("Enter an amount to see routes") is currently generic. Upgrade it to show a proper "ready to route" visual with the adapter grid, and tighten the overall trade page outer padding for more content density.

- [ ] **Step 1: Update outer padding in trade-page**

Line ~79: change `px-8 py-10` to `px-4 py-6 md:px-8 md:py-8`:

```tsx
<div className="w-full px-4 py-6 md:px-8 md:py-8 max-w-[1440px] mx-auto">
```

- [ ] **Step 2: Upgrade empty state panel**

Replace the empty-state `div` (~lines 112–138):

```tsx
<div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
  {/* Animated network icon */}
  <div className="relative">
    <div className="h-16 w-16 border border-primary/20 bg-primary/5 flex items-center justify-center">
      <Network className="h-8 w-8 text-primary/60" />
    </div>
    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary/40 animate-ping" />
    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
  </div>

  <div className="space-y-2">
    <p className="text-[16px] font-semibold text-text-secondary">
      Intelligent routing ready
    </p>
    <p className="text-[13px] text-text-muted max-w-[260px] leading-relaxed">
      Enter an amount to discover the optimal path across all Polkadot adapters
    </p>
  </div>

  {routes && routes.adapters.filter((a) => a.deployed).length > 0 && (
    <div className="w-full max-w-[280px]">
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">
        Active adapters
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {routes.adapters
          .filter((a) => a.deployed)
          .map((a) => (
            <span
              key={a.label}
              className="pill bg-primary/5 text-primary border border-primary/20 text-[12px]"
            >
              {a.label}
            </span>
          ))}
      </div>
    </div>
  )}

  <div className="flex items-center gap-4 text-[12px] text-text-muted">
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-bull" />
      Best price
    </div>
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      Split routes
    </div>
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      Multi-hop
    </div>
  </div>
</div>
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck 2>&1 | tail -5
cd /home/harry-riddle/dev/github.com/obidot/obidot && git add modules/app/src/components/trade/trade-page.tsx && git commit -m "feat(trade): upgrade right-panel empty state with intelligent routing visual"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run typecheck
```

Expected: 0 errors

- [ ] **Step 2: Lint**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run lint 2>&1 | tail -20
```

Expected: no errors (warnings acceptable)

- [ ] **Step 3: Build check**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app && pnpm run build 2>&1 | tail -20
```

Expected: successful build

---

## Execution Order

Tasks 1 → 2 → 3 → 4 → 5 → 6 (sequential; each builds on shared CSS/types)

Tasks 2 and 3 both touch `swap-form.tsx` — do Task 2 first (adds prop to QuoteDisplay call), then Task 3 (typography). Don't interleave.
