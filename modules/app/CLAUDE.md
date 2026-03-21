# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs on port 3010)
bun --bun next dev --turbopack -p 3010
# or via pnpm from monorepo root:
pnpm --filter @obidot/app run dev

# Build / start / lint / typecheck
pnpm --filter @obidot/app run build
pnpm --filter @obidot/app run start
pnpm --filter @obidot/app run lint
pnpm --filter @obidot/app run typecheck
```

## Architecture

This is a **Next.js 15 App Router** frontend for the Obidot DEX aggregator on Polkadot Hub. It uses **Bun + Turbopack** for local development, and the stable **Next CLI** for production build/start. Wallet/chain connectivity is handled with **wagmi + RainbowKit**, server state with **TanStack Query**, and styling with **Tailwind CSS v4 + shadcn/ui**.

### Key structural patterns

**Dynamic trade routing** — The primary user flow lives at `src/app/[trade]/[chain]/[router]/page.tsx`. URL segments encode the trade type (`swap | limit | crosschain`), chain slug (`polkadot-hub-testnet`), and token pair (`tdot-to-tusdc`). `src/shared/trade/index.ts` owns all route parsing and normalization (`resolveTradeRoute`, `slugToTokenIdx`, `chainToSlug`). The wallet's connected chain auto-redirects the URL via `useEffect` in `TradePage`.

**On-chain reads** — `src/hooks/use-swap.ts` reads contract state directly via wagmi (`useReadContract`, `useReadContracts`). Contract addresses live in `src/lib/constants.ts` (CONTRACTS map). ABIs live in `src/lib/abi.ts`. `bigint` values from contracts are always serialized to strings before leaving hooks.

**Off-chain API** — `src/hooks/use-swap.ts#useRouteFinder` debounces 600ms and calls `/api/routes` for multi-hop route discovery. The Next.js dev server proxies `/api` to the backend agent (`localhost:3001`).

**Real-time data** — `src/hooks/use-websocket.ts` connects to `WS_URL` (agent events). `src/hooks/use-graphql-subscription.ts` connects to `GRAPHQL_WS_URL` (obi.index). Both URLs are configurable via `NEXT_PUBLIC_*` env vars; defaults to localhost.

**Provider stack** — `src/app/providers.tsx` wraps `WagmiProvider → QueryProvider → RainbowKitClientProvider`. All are client components; the root layout is a server component.

**Theme presets** — `src/app/globals.css` contains named palette presets on `:root[data-theme=...]`. The active preset is selected in `src/app/layout.tsx` via the `<html data-theme="...">` attribute. Keep new palette work additive so prior presets remain easy to restore.

### Supported chains

Only two chains are defined (`src/lib/chains.ts`):
- **Polkadot Hub TestNet** — chain ID `420420417`, EVM RPC at `eth-rpc-testnet.polkadot.io`
- **Polkadot Hub** — chain ID `420420419`, EVM RPC at `eth-rpc.polkadot.io`

### Token/pool index mapping

Token slugs map to on-chain indices in `src/shared/trade/index.ts#TOKEN_SLUG_TO_IDX`:
- `tdot / dot` → `0`
- `tusdc / usdc` → `1`
- `teth / eth` → `2`

Pool adapter types are defined as `PoolType` enum in `src/types/index.ts` and must match the on-chain `PoolType` enum in the contracts.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws` | Agent WebSocket events |
| `NEXT_PUBLIC_GRAPHQL_WS_URL` | `ws://localhost:4350/graphql` | obi.index subscriptions |
| `NEXT_PUBLIC_GRAPHQL_HTTP_URL` | `http://localhost:4350/graphql` | obi.index queries |
