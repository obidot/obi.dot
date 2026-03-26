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
- Document `POST /api/chat` as read-only; it does not execute transactions

## Architecture Notes

- `source.config.ts` defines the docs collection schema
- `src/lib/source.ts` exposes the loaded docs source to the app
- `next.config.mjs` sets `turbopack.root` for the monorepo
- `src/app/layout.tsx` owns `metadataBase`

## Tooling

- Formatting and linting use Biome
- MDX types are generated through `fumadocs-mdx`
