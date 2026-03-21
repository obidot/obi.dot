# Package: @obidot/app (modules/app/)

Next.js 15 App Router frontend for the Obidot trading terminal on Polkadot Hub.
This package is the user-facing dashboard for swap, yields, cross-chain routes,
strategies, and agent telemetry.

## Commands

```sh
# From repo root
pnpm --filter @obidot/app run dev         # Dev mode (Next.js + Turbopack, port 3010)
pnpm --filter @obidot/app run build       # Production build
pnpm --filter @obidot/app run start       # Production server
pnpm --filter @obidot/app run lint        # Biome check
pnpm --filter @obidot/app run format      # Biome format
pnpm --filter @obidot/app run typecheck   # TypeScript check
```

## Architecture

This package uses:
- **Next.js 15 App Router**
- **Bun + Turbopack** for local development
- **Next CLI** for production build/start
- **wagmi + RainbowKit** for wallet connectivity
- **TanStack Query** for client-side server state
- **Tailwind CSS v4 + shadcn/ui** for styling primitives

### Core routing model

The primary trading flow lives at:

`src/app/[trade]/[chain]/[router]/page.tsx`

URL segments encode:
- trade type: `swap | limit | crosschain`
- chain slug: `polkadot-hub-testnet`
- token pair slug: `tdot-to-tusdc`

Trade route parsing and normalization live in:
- `src/shared/trade/index.ts`
- `src/shared/trade/swap.ts`

### Data flow

- **On-chain reads**: `src/hooks/use-swap.ts`, `src/hooks/use-liquidity.ts`, and vault-related hooks use wagmi read hooks directly.
- **Agent API**: `/api/*` requests are proxied by Next.js rewrites to the backend agent in development.
- **Realtime streams**:
  - `src/hooks/use-websocket.ts` for agent events
  - `src/hooks/use-graphql-subscription.ts` for `obi.index`

### Provider stack

`src/app/providers.tsx` wraps:

`WagmiProvider -> QueryProvider -> RainbowKitClientProvider`

The root layout is a server component. Provider components are client components.

## Theme System

Theme presets are defined in:

`src/app/globals.css`

The active theme is selected in:

`src/app/layout.tsx`

via:

`<html data-theme="...">`

Current presets:
- `retro-classic`
- `obidot-polkadot`
- `obidot-orbital`
- `obidot-signal`

When adding new palettes, keep them additive. Do not overwrite older presets if
the change is only a visual variant.

## Supported Chains

Defined in `src/lib/chains.ts`:
- **Polkadot Hub TestNet** — chain ID `420420417`
- **Polkadot Hub** — chain ID `420420419`

Always use the network name:

`Polkadot Hub TestNet`

Do not use `Paseo`.

## Token / Pool Mapping

Token slug to on-chain index mapping lives in:

`src/shared/trade/index.ts#TOKEN_SLUG_TO_IDX`

Current mapping:
- `tdot / dot` -> `0`
- `tusdc / usdc` -> `1`
- `teth / eth` -> `2`

Pool adapter types in `src/types/index.ts` must stay aligned with the on-chain
`PoolType` enum.

## Styling and UI Guidance

- Preserve the shared framed retro visual system unless the user explicitly asks
  for a different direction.
- Keep changes consistent across pages and shared components; avoid one-off card
  or button styles that drift from the rest of the app.
- Prefer theme-token changes over hardcoded colors.
- If you adjust wallet theme colors, update
  `src/components/providers/rainbow-provider.tsx` as well.

## Verification

Before committing app changes, run:

```sh
pnpm --filter @obidot/app run lint
pnpm --filter @obidot/app run typecheck
pnpm --filter @obidot/app run build
```

For wallet-driven flows, code checks are not enough. Use the manual smoke
checklist in:

`modules/app/tasks/todo.md`

for:
- split swap
- relay teleport
- liquidity add/remove

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws` | Agent WebSocket events |
| `NEXT_PUBLIC_GRAPHQL_WS_URL` | `ws://localhost:4350/graphql` | obi.index subscriptions |
| `NEXT_PUBLIC_GRAPHQL_HTTP_URL` | `http://localhost:4350/graphql` | obi.index queries |

