# Package Context: docs

This package is the Obidot documentation site built with Next.js and Fumadocs.

## What Is Here

- One MDX content collection rooted at `content/docs/`
- One Fumadocs source loader in `src/lib/source.ts`
- One docs route tree under `src/app/docs`
- One site layout in `src/app/layout.tsx`

Do not assume multiple docs collections or separate developer/frontend/protocol trees. Those old instructions are stale.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
```

- Dev server port: `4010`
- Sitemap config: `next-sitemap.config.js`
- Site URL source: `SITE_URL` in the environment, with fallback `https://obidot.com`

## Editing Rules

- Write docs in `content/docs/*.mdx`
- Keep examples and ports aligned with the live repo:
  - app: `3010`
  - agent API: `3011`
  - docs: `4010`
- Use `Polkadot Hub TestNet` as the current testnet naming unless a page is explicitly describing historical context
- `docs/public/` is generated output from docs builds (`robots.txt`, sitemap files). Treat it as build output, not authored content.
- Document both chat surfaces accurately:
  - `POST /api/chat` is read-only inspection
  - `POST /api/chat/execute` is streamed proposal generation for the browser, with per-address short-term memory/rate limiting and wallet approval required for any execution
- Limit orders are agent-monitored via `/api/limit-orders*`; do not describe them as localStorage-only unless a page is explicitly talking about historical behavior
- The docs site should describe `/insights` as an indexed analytics surface backed by `obi.index` (`protocolStats`, `topRoutes`, `priceHistory`)
- The cross-chain tracker currently covers locally indexed Polkadot Hub lifecycle events. Do not overstate remote destination-host indexing coverage.
- The docs site should point developer-facing package guidance at the shipped Agent Kit surface, not only the in-app `/docs/agent-kit` page

## Architecture Notes

- `source.config.ts` defines the docs collection schema
- `src/lib/source.ts` exposes the loaded docs source to the app
- `next.config.mjs` sets `turbopack.root` for the monorepo
- `src/app/layout.tsx` owns `metadataBase`

## Tooling

- Formatting and linting use Biome
- MDX types are generated through `fumadocs-mdx`
