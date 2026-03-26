# Responsive Modal Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `TokenPicker` portal dropdown with a `ResponsiveModal` (Radix Dialog on desktop, vaul Drawer on mobile) and wire the inert `Settings2` button in `SwapPanel` to a settings modal that owns slippage state.

**Architecture:** A shared `ResponsiveModal` primitive switches between Radix `Dialog` and vaul `Drawer` based on a `useMediaQuery` hook (SSR-safe, defaults to `false`). `TokenPicker` drops its `createPortal` machinery and mounts the token list inside `ResponsiveModal`. Slippage state lifts from `SwapForm` into `SwapPanel`, enabling the settings button to open a second `ResponsiveModal` with the slippage controls.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, `radix-ui` v1.4.3 (unified package), `vaul` ^1.x, TypeScript 5, Biome (lint/format)

**Spec:** `docs/superpowers/specs/2026-03-26-responsive-modal-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/use-media-query.ts` | SSR-safe matchMedia hook |
| Create | `src/components/ui/responsive-modal.tsx` | Dialog/Drawer switcher primitive |
| Modify | `src/components/swap/token-picker.tsx` | Replace createPortal with ResponsiveModal |
| Modify | `src/components/swap/swap-form.tsx` | Accept slippageBps + onSlippageChange as props |
| Modify | `src/components/swap/swap-panel.tsx` | Own slippage state; wire Settings2 button |
| Modify | `modules/app/package.json` | Add vaul dependency |

---

## Task 1: Install vaul and verify baseline

**Files:**
- Modify: `modules/app/package.json`

- [ ] **Step 1: Install vaul**

From the monorepo root:
```bash
pnpm add vaul --filter @obidot/app
```

Expected: vaul appears in `modules/app/package.json` under `dependencies`.

- [ ] **Step 2: Verify baseline typechecks**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: `0 errors`. This establishes a green baseline before any edits.

- [ ] **Step 3: Commit**

```bash
git add modules/app/package.json pnpm-lock.yaml
git commit -m "chore(app): add vaul dependency for responsive drawer"
```

---

## Task 2: `useMediaQuery` hook

**Files:**
- Create: `src/hooks/use-media-query.ts`

- [ ] **Step 1: Create the hook**

`modules/app/src/hooks/use-media-query.ts`:
```ts
"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe matchMedia hook.
 * Defaults to `false` on the server so server/client renders agree.
 * The correct value is applied after the first client-side effect fires.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/hooks/use-media-query.ts
git commit -m "feat(app): add SSR-safe useMediaQuery hook"
```

---

## Task 3: `ResponsiveModal` component

**Files:**
- Create: `src/components/ui/responsive-modal.tsx`

This component renders a Radix `Dialog` on desktop (≥ 768 px) and a vaul `Drawer` on mobile.
Both surfaces share the same `ModalHeader` sub-component.

- [ ] **Step 1: Create the component**

`modules/app/src/components/ui/responsive-modal.tsx`:
```tsx
"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type React from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Max height of the drawer sheet on mobile (default: "85dvh") */
  drawerMaxHeight?: string;
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b-[3px] border-border bg-surface-alt px-4 py-3">
      <p className="retro-label panel-title">{title}</p>
      <button
        type="button"
        onClick={onClose}
        className="btn-ghost min-h-0 px-2 py-1"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
  drawerMaxHeight = "85dvh",
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-none border-[3px] border-border bg-popover shadow-[8px_8px_0_0_var(--border)]">
            <DialogPrimitive.Title asChild>
              <ModalHeader title={title} onClose={() => onOpenChange(false)} />
            </DialogPrimitive.Title>
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 overflow-y-auto rounded-none border-x-[3px] border-t-[3px] border-border bg-popover shadow-[0_-4px_0_0_var(--border)]"
          style={{ maxHeight: drawerMaxHeight }}
        >
          <Drawer.Title asChild>
            <ModalHeader title={title} onClose={() => onOpenChange(false)} />
          </Drawer.Title>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: `0 errors`.

- [ ] **Step 3: Lint**

```bash
pnpm --filter @obidot/app run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/components/ui/responsive-modal.tsx
git commit -m "feat(app): add ResponsiveModal primitive (Dialog/Drawer)"
```

---

## Task 4: Refactor `TokenPicker`

**Files:**
- Modify: `src/components/swap/token-picker.tsx`

Replace the `createPortal` fixed-dropdown approach with `<ResponsiveModal>`. The trigger button is unchanged. A search input is added inside the modal.

- [ ] **Step 1: Replace token-picker.tsx entirely**

`modules/app/src/components/swap/token-picker.tsx`:
```tsx
"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { resolveTokenAssetId } from "@/lib/asset-registry";
import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";

function TokenVisual({
  symbol,
  size = "default",
}: {
  symbol: string;
  size?: "default" | "compact";
}) {
  const assetId = resolveTokenAssetId(symbol);
  const colors = tokenColor(symbol);

  if (assetId) {
    return (
      <AssetIcon
        assetId={assetId}
        size={size === "compact" ? "sm" : "md"}
        variant="tile"
        className="h-8 w-8 rounded-full bg-surface border-[2px] shadow-[2px_2px_0_0_var(--border)]"
        imageClassName="p-1"
      />
    );
  }

  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-border text-[13px] font-bold",
        colors.circle,
        colors.text,
      )}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}

interface TokenPickerProps {
  selectedIdx: number;
  onSelect: (idx: number) => void;
  disabledIdx?: number;
  label?: string;
}

export default function TokenPicker({
  selectedIdx,
  onSelect,
  disabledIdx,
  label = "Select token",
}: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const token = TOKENS[selectedIdx];

  const filtered = search.trim()
    ? TOKENS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search.toLowerCase()) ||
          t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : TOKENS;

  function handleClose() {
    setOpen(false);
    setSearch("");
  }

  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-w-[128px] items-center gap-2 border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)] transition",
          "hover:bg-surface-hover hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--border)]",
        )}
      >
        <TokenVisual symbol={token.symbol} />
        <span className="flex-1 text-left font-mono text-[15px] font-semibold text-text-primary">
          {token.symbol}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={(v) => {
          if (!v) handleClose();
          else setOpen(true);
        }}
        title={label}
      >
        {/* Search */}
        <div className="border-b-[3px] border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              // biome-ignore lint/a11y/noAutofocus: intentional focus for modal search
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tokens..."
              aria-label="Search tokens"
              className="input-trading py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {/* Token list */}
        <div role="listbox" aria-label={label}>
          {filtered.map((item) => {
            const idx = TOKENS.indexOf(item);
            const isSelected = idx === selectedIdx;
            const isDisabled = idx === disabledIdx;

            return (
              <button
                key={item.address}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(idx);
                  handleClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border-subtle px-3 py-3 text-left transition-colors last:border-b-0",
                  isSelected
                    ? "bg-primary/14"
                    : "bg-popover hover:bg-surface-hover",
                  isDisabled && "cursor-not-allowed opacity-45",
                )}
              >
                <TokenVisual symbol={item.symbol} size="compact" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-semibold text-text-primary">
                    {item.symbol}
                  </p>
                  <p className="truncate text-[12px] text-text-muted">
                    {item.name}
                  </p>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-text-muted">
              No tokens match "{search}"
            </p>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: `0 errors`.

- [ ] **Step 3: Lint**

```bash
pnpm --filter @obidot/app run lint
```

Expected: no errors (the `autoFocus` biome-ignore comment handles the a11y rule intentionally).

- [ ] **Step 4: Smoke test in dev**

```bash
pnpm --filter @obidot/app run dev
```

Open `http://localhost:3010/swap/polkadot-hub-testnet`. Click either token button. Verify:
- **Desktop (≥ 768 px):** centered Dialog appears with hard border + block shadow, search input focused, token list renders, selecting a token closes the modal
- **Mobile (< 768 px):** bottom sheet slides up, same behaviour

- [ ] **Step 5: Commit**

```bash
git add modules/app/src/components/swap/token-picker.tsx
git commit -m "feat(app): replace TokenPicker portal dropdown with ResponsiveModal"
```

---

## Task 5: Lift slippage state + wire Settings modal

This task modifies both `SwapForm` and `SwapPanel` atomically — changing SwapForm's interface without updating SwapPanel would break the build.

**Files:**
- Modify: `src/components/swap/swap-form.tsx`
- Modify: `src/components/swap/swap-panel.tsx`

### SwapForm changes

Remove the `slippageBps` `useState` (line 63). Remove the `SLIPPAGE_OPTIONS` import. Remove the entire inline slippage `<div>` block (lines 571–593). Add `slippageBps` and `onSlippageChange` to the `SwapFormProps` interface.

- [ ] **Step 1: Update `SwapFormProps` interface**

In `swap-form.tsx`, change:
```ts
// BEFORE (line 39)
interface SwapFormProps {
  onInputChange?: (params: { ... }) => void;
  selectedRoute?: SwapRouteResult | null;
  selectedSplitRoutes?: SplitRouteSelection[];
  initialTokenInIdx?: number;
  initialTokenOutIdx?: number;
}
```
To:
```ts
// AFTER
interface SwapFormProps {
  onInputChange?: (params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
  }) => void;
  selectedRoute?: SwapRouteResult | null;
  selectedSplitRoutes?: SplitRouteSelection[];
  initialTokenInIdx?: number;
  initialTokenOutIdx?: number;
  slippageBps: number;
  onSlippageChange: (bps: number) => void;
}
```

- [ ] **Step 2: Remove internal slippage state and import**

Remove from `swap-form.tsx`:
- Line 28: `SLIPPAGE_OPTIONS,` from the constants import
- Line 63: `const [slippageBps, setSlippageBps] = useState(200);`
- Destructure `slippageBps` and `onSlippageChange` from the function params instead

The function signature becomes:
```ts
export default function SwapForm({
  onInputChange,
  selectedRoute,
  selectedSplitRoutes,
  initialTokenInIdx = 0,
  initialTokenOutIdx = 1,
  slippageBps,
  onSlippageChange: _onSlippageChange, // unused in form body; kept for future inline use
}: SwapFormProps) {
```

Note: `onSlippageChange` is accepted but not used inside `SwapForm` itself — slippage is now changed via the Settings modal in `SwapPanel`. Accept it as `_onSlippageChange` (prefixed underscore) to satisfy Biome's `noUnusedVariables` rule, which honours the `_` prefix convention for parameters.

- [ ] **Step 3: Remove the inline slippage block**

Delete this block from `swap-form.tsx` (currently lines 571–593):
```tsx
{/* ── Slippage selector ───────────────────────────────────────────── */}
<div className="flex items-center justify-between border-[3px] border-border bg-surface-alt px-3 py-3 shadow-[2px_2px_0_0_var(--border)]">
  <span className="retro-label text-[0.9rem] text-text-muted">
    Max Slippage
  </span>
  <div className="flex gap-1">
    {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
      <button
        key={bps}
        type="button"
        onClick={() => setSlippageBps(bps)}
        className={cn(
          "retro-label border-[2px] px-2.5 py-1 text-[0.85rem] transition-colors",
          slippageBps === bps
            ? "border-border bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--border)]"
            : "border-transparent bg-surface text-text-secondary hover:border-border/40",
        )}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

The rest of the file (`QuoteDisplay`, swap button, etc.) is untouched — `slippageBps` is still passed to `QuoteDisplay` and used in `minAmountOut` / `splitMinAmountOut` calculations because those now use the prop value directly.

### SwapPanel changes

Add `slippageBps` + `settingsOpen` state, wire `Settings2` button, add the Settings `ResponsiveModal`, pass slippage props to `SwapForm`.

- [ ] **Step 4: Update `swap-panel.tsx`**

Add to imports at top of `swap-panel.tsx`:
```ts
import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { SLIPPAGE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/format";
```

Inside `SwapPanel` function body, add two new state variables before the `prevTokenPairRef`:
```ts
const [slippageBps, setSlippageBps] = useState(200);
const [settingsOpen, setSettingsOpen] = useState(false);
```

Change the `Settings2` button's `onClick`:
```tsx
// BEFORE
<button
  type="button"
  className="btn-ghost min-h-0 px-2 py-2 text-text-muted hover:text-text-secondary"
  aria-label="Settings"
>
  <Settings2 className="h-4 w-4" />
</button>

// AFTER
<button
  type="button"
  onClick={() => setSettingsOpen(true)}
  className="btn-ghost min-h-0 px-2 py-2 text-text-muted hover:text-text-secondary"
  aria-label="Settings"
>
  <Settings2 className="h-4 w-4" />
</button>
```

Add the Settings modal just before the closing `</div>` of the SwapPanel return (after the `<div className="flex-1">` block):
```tsx
<ResponsiveModal
  open={settingsOpen}
  onOpenChange={setSettingsOpen}
  title="Transaction Settings"
>
  <div className="space-y-4 p-4">
    <div className="flex items-center justify-between">
      <span className="retro-label text-[0.9rem] text-text-muted">
        Max Slippage
      </span>
      <div className="flex gap-1">
        {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
          <button
            key={bps}
            type="button"
            onClick={() => setSlippageBps(bps)}
            className={cn(
              "retro-label border-[2px] px-2.5 py-1 text-[0.85rem] transition-colors",
              slippageBps === bps
                ? "border-border bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--border)]"
                : "border-transparent bg-surface text-text-secondary hover:border-border/40",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    <p className="text-[12px] text-text-muted">
      Your transaction will revert if the price moves more than this
      percentage unfavorably.
    </p>
  </div>
</ResponsiveModal>
```

Pass `slippageBps` and `onSlippageChange` down to `SwapForm`:
```tsx
// BEFORE
<SwapForm
  key={routerParam}
  initialTokenInIdx={tokenInIdx}
  initialTokenOutIdx={tokenOutIdx}
  onInputChange={handleInputChange}
  selectedRoute={selectedRoute}
  selectedSplitRoutes={selectedSplitRoutes}
/>

// AFTER
<SwapForm
  key={routerParam}
  initialTokenInIdx={tokenInIdx}
  initialTokenOutIdx={tokenOutIdx}
  onInputChange={handleInputChange}
  selectedRoute={selectedRoute}
  selectedSplitRoutes={selectedSplitRoutes}
  slippageBps={slippageBps}
  onSlippageChange={setSlippageBps}
/>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @obidot/app run typecheck
```

Expected: `0 errors`.

- [ ] **Step 6: Lint**

```bash
pnpm --filter @obidot/app run lint
```

Expected: no errors.

- [ ] **Step 7: Smoke test in dev**

```bash
pnpm --filter @obidot/app run dev
```

Open `http://localhost:3010/swap/polkadot-hub-testnet`. Verify:
- The inline slippage row **no longer appears** at the top of the swap form
- Clicking the ⚙ (Settings) icon opens a `ResponsiveModal` titled "Transaction Settings"
- Changing slippage in the settings modal and closing it: the new value is reflected in the swap execution (minAmountOut changes — visible in the `QuoteDisplay` row if a quote is present)
- Token swap execution still works end-to-end

- [ ] **Step 8: Commit**

```bash
git add modules/app/src/components/swap/swap-form.tsx \
        modules/app/src/components/swap/swap-panel.tsx
git commit -m "feat(app): lift slippage to SwapPanel, wire Settings modal"
```

---

## Verification Checklist (post all tasks)

Run the full check suite from the monorepo root:

```bash
pnpm --filter @obidot/app run typecheck
pnpm --filter @obidot/app run lint
```

Both must pass with zero errors before opening a PR.

Manual cross-device checks:
- [ ] Desktop (≥ 768 px): TokenPicker → centered Dialog, Settings → centered Dialog
- [ ] Mobile (< 768 px): TokenPicker → bottom Drawer slides up, swipe to close works, Settings → bottom Drawer
- [ ] SSR: no hydration mismatch warning in browser console on first load
- [ ] Escape key closes both Dialog and Drawer
- [ ] Selecting a disabled token does nothing
- [ ] Empty search shows full token list; no-results state renders when search finds nothing
- [ ] Slippage change in Settings modal carries through to swap execution (minAmountOut recalculates)
