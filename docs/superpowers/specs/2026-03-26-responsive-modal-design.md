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
| `src/components/swap/swap-form.tsx` | Remove inline slippage row; accept `slippageBps` + `onSlippageChange` as props |
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
- Returns `true` on the server (SSR defaults to desktop = no drawer flash on first paint).
- Cleans up listener on unmount.

### `ResponsiveModal`

```tsx
// src/components/ui/responsive-modal.tsx
interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Optional fixed height for the drawer sheet (default: auto) */
  drawerHeight?: string;
}
```

**Desktop (`md+`) — Radix Dialog:**
- `Dialog.Overlay`: fixed inset, `bg-foreground/20` backdrop
- `Dialog.Content`:
  - `border-[3px] border-border`
  - `shadow-[8px_8px_0_0_var(--border)]`
  - `rounded-none`
  - `bg-popover`
  - `w-full max-w-sm`
- Header: `panel-header` class with `panel-title` for the title and an `✕` `btn-ghost` close button
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
  - Max height `85dvh` with `overflow-y-auto`
- No drag handle (retro feel preserved)
- Swipe-to-close via vaul's built-in gesture handling
- Same header pattern as Dialog

### `TokenPicker` refactor

- Trigger button: unchanged (same retro bordered button with token icon + symbol + ChevronDown)
- Remove: `createPortal`, `dropdownRef`, `dropdownStyle`, `updateDropdownPosition`, all scroll/resize listeners
- Add: `<ResponsiveModal open={open} onOpenChange={setOpen} title="Select Token">`
- Modal content:
  - Search input (`input-trading` class) at top with autofocus
  - Filtered token list (same row design: `TokenVisual` + symbol + name + Check icon)
  - `disabledIdx` / `aria-selected` / keyboard selection preserved

### Settings modal in `SwapPanel`

- `SwapPanel` gains local state: `slippageBps` (default `200`) and `settingsOpen` (default `false`)
- `Settings2` button sets `settingsOpen = true`
- `<ResponsiveModal open={settingsOpen} onOpenChange={setSettingsOpen} title="Settings">` renders:
  - Slippage label + pill buttons (same UI as current inline row in `SwapForm`)
- `slippageBps` and `onSlippageChange` passed down as props to `SwapForm`
- `SwapForm` removes the inline slippage `<div>` at the top; receives the values via props

---

## Styling Rules

All modal/drawer content must stay within the existing design system:
- Zero border-radius everywhere (`rounded-none`)
- Hard `3px` borders using `var(--border)`
- Block shadows using `var(--shadow-block)` or custom offset values
- `retro-label` font for headings and labels
- `panel-header` / `panel-title` / `panel-kicker` classes for the modal header
- `btn-ghost` for the close button
- No glassmorphism, no blur, no soft shadows

---

## Data Flow

```
SwapPanel
  ├── slippageBps state (moved here from SwapForm)
  ├── settingsOpen state (new)
  ├── <Settings2 button> → settingsOpen = true
  ├── <ResponsiveModal> (settings) → slippage pill buttons
  └── <SwapForm slippageBps={slippageBps} onSlippageChange={...} />
        └── <TokenPicker> (uses ResponsiveModal internally)
```

---

## Dependency

```
vaul  — ^1.x  (peer: react ≥ 18)
```

Install via: `pnpm add vaul --filter @obidot/app`

---

## Out of Scope

- Mobile hamburger navigation menu
- Yields or Dashboard page changes
- LimitOrderPanel or CrossChainPanel token pickers (apply same pattern later if tokens are added)
- Dark mode theming
