# Responsive Modal Pattern — Design Spec

**Date:** 2026-03-26
**Scope:** `modules/app` — Trade surface (TokenPicker + SwapPanel settings)
**Status:** Approved

---

## Problem

- `TokenPicker` uses a `createPortal` + fixed-position dropdown that is awkward on mobile (anchored to button, can clip viewport, no swipe-to-close).
- The `Settings2` button in `SwapPanel` is a no-op ghost button; slippage lives inline in `SwapForm`, cluttering the form before the user even interacts with it.

## Solution

Introduce a shared `<ResponsiveModal>` primitive that renders a centered Radix `Dialog` on desktop and a vaul `Drawer` (bottom sheet) on mobile. Apply it to `TokenPicker` and the transaction-settings panel.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/hooks/use-media-query.ts` | SSR-safe `useMediaQuery(query)` hook |
| `src/components/ui/responsive-modal.tsx` | `<ResponsiveModal>` wrapper |

### Modified files

| File | Change |
|---|---|
| `src/components/swap/token-picker.tsx` | Replace `createPortal` dropdown with `<ResponsiveModal>` |
| `src/components/swap/swap-form.tsx` | Remove inline slippage row; accept `slippageBps` + `onSlippageChange` as props; `QuoteDisplay` call unchanged (already receives `slippageBps` as prop) |
| `src/components/swap/swap-panel.tsx` | Wire `Settings2` button to settings `<ResponsiveModal>`; own slippage state |
| `modules/app/package.json` | Add `vaul` dependency |

---

## Component Design

### `useMediaQuery`

```ts
// src/hooks/use-media-query.ts
"use client";
export function useMediaQuery(query: string): boolean
```

- Uses `window.matchMedia` with a `change` event listener.
- **SSR default is `false`** — both server and first client render agree on `false` (drawer variant). A `mounted` boolean guards the switch: until `useEffect` fires, `isDesktop` is always `false`, avoiding hydration mismatch. After mount the real `matchMedia` result is applied.
- Implementation pattern:
  ```ts
  const [matches, setMatches] = useState(false); // false = SSR-safe
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
  ```
- Cleans up listener on unmount.

### `ResponsiveModal`

```tsx
// src/components/ui/responsive-modal.tsx
interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Optional max-height for the drawer sheet (default: "85dvh") */
  drawerMaxHeight?: string;
}
```

**Import conventions (required):**
```ts
import { Dialog as DialogPrimitive } from "radix-ui";
// Sub-components: DialogPrimitive.Root, .Portal, .Overlay, .Content, .Title, .Close
import { Drawer } from "vaul";
// Sub-components: Drawer.Root, .Portal, .Overlay, .Content, .Title
```

The project uses the unified `radix-ui` v1.4.3 package. Do NOT import from `@radix-ui/react-dialog` — that sub-package is not installed separately.

**Desktop (`md+`) — Radix Dialog:**
- `DialogPrimitive.Overlay`: fixed inset, `bg-foreground/20` backdrop
- `DialogPrimitive.Content`:
  - `border-[3px] border-border`
  - `shadow-[8px_8px_0_0_var(--border)]`
  - `rounded-none`
  - `bg-popover`
  - `w-full max-w-sm`
- Header: a simple `flex items-center justify-between border-b-[3px] border-border bg-surface-alt px-4 py-3` div (do **not** use the `panel-header` CSS class — that class includes `flex-wrap`, `justify-content: space-between`, and a gradient background designed for full-width panel tops, which produces unexpected layout inside a `max-w-sm` modal). Title uses `retro-label panel-title` classes. Close button uses `btn-ghost min-h-0 px-2 py-1`.
- Closes on overlay click and Escape (Radix default)

**Mobile (`< md`) — vaul Drawer:**
- `Drawer.Root` with `direction="bottom"`
- `Drawer.Overlay`: same backdrop as Dialog
- `Drawer.Content`:
  - `border-t-[3px] border-x-[3px] border-border`
  - `shadow-[0_-4px_0_0_var(--border)]`
  - `rounded-none`
  - `bg-popover`
  - `fixed bottom-0 left-0 right-0`
  - `max-h-[85dvh] overflow-y-auto`
- No drag handle (retro feel preserved)
- Swipe-to-close via vaul's built-in gesture handling
- Same header pattern as Dialog (simple flex div, not `panel-header`)

### `TokenPicker` refactor

- Trigger button: unchanged (same retro bordered button with token icon + symbol + ChevronDown)
- Remove: `createPortal`, `dropdownRef`, `dropdownStyle`, `updateDropdownPosition`, all scroll/resize listeners, `CSSProperties` import
- Add: `<ResponsiveModal open={open} onOpenChange={setOpen} title="Select Token">`
- Modal content:
  - Search `<input>` (`input-trading` class) at top, autofocused via `autoFocus` prop
  - Filtered token list rendered from `TOKENS.filter(...)` using the search value
  - Same row design per token: `TokenVisual` + symbol + name + `Check` icon when selected
  - `disabledIdx` / `aria-selected` / Escape-to-close behaviour preserved (Escape handled by the modal primitive)
  - On selection: `onSelect(idx)` then `setOpen(false)`

### Settings modal in `SwapPanel`

**Slippage default:** `200` (bps). The canonical value comes from `SLIPPAGE_OPTIONS` in `src/lib/constants.ts` — the default selected option is `200` bps (2%). `SwapPanel` owns this state after the lift; `SwapForm` removes its own `useState(200)`.

**Updated `SwapFormProps` interface** (add these two props, keep all others):
```ts
interface SwapFormProps {
  // ... existing props ...
  slippageBps: number;          // was internal useState — now required prop
  onSlippageChange: (bps: number) => void; // new
}
```

**Data responsibilities:**
- `SwapPanel` gains: `const [slippageBps, setSlippageBps] = useState(200)` and `const [settingsOpen, setSettingsOpen] = useState(false)`
- `Settings2` button: `onClick={() => setSettingsOpen(true)}`
- `<ResponsiveModal open={settingsOpen} onOpenChange={setSettingsOpen} title="Settings">` contains the slippage pill buttons (same JSX as the current inline row in `SwapForm`, lines 572–593 of `swap-form.tsx`)
- `SwapForm` receives `slippageBps` and `onSlippageChange` as props; the inline slippage `<div>` (lines 571–593) is deleted; `QuoteDisplay` at line 731 already receives `slippageBps` as a prop and requires no change
- `LimitOrderPanel` and `CrossChainSwapPanel` do not receive slippage props (they have no swap execution today)

---

## Styling Rules

All modal/drawer content must stay within the existing design system:
- Zero border-radius everywhere (`rounded-none`)
- Hard `3px` borders using `var(--border)`
- Block shadows using custom offset values (e.g. `shadow-[8px_8px_0_0_var(--border)]`)
- `retro-label` + `panel-title` for modal heading text
- Simple `flex items-center justify-between` header div with `border-b-[3px] border-border bg-surface-alt px-4 py-3` — **not** the `panel-header` CSS class
- `btn-ghost` for the close button
- No glassmorphism, no blur, no soft shadows

---

## Data Flow

```
SwapPanel
  ├── slippageBps: number (useState(200), canonical default from SLIPPAGE_OPTIONS)
  ├── settingsOpen: boolean (useState(false))
  ├── <Settings2 button onClick> → setSettingsOpen(true)
  ├── <ResponsiveModal title="Settings"> → slippage pill buttons → setSlippageBps
  └── <SwapForm slippageBps={slippageBps} onSlippageChange={setSlippageBps} />
        ├── uses slippageBps for minAmountOut / splitMinAmountOut calculation
        ├── passes slippageBps to <QuoteDisplay> (no interface change needed)
        └── <TokenPicker> (uses ResponsiveModal internally, self-contained)
```

---

## Dependency

```
vaul  — ^1.x  (peer: react ≥ 18, react-dom ≥ 18)
```

Install via: `pnpm add vaul --filter @obidot/app`

---

## Out of Scope

- Mobile hamburger navigation menu
- Yields or Dashboard page changes
- LimitOrderPanel or CrossChainPanel token pickers (apply same pattern later if tokens are added)
- Dark mode theming
