# docs

Fumadocs-based documentation site for the Obidot app, agent, and protocol surfaces.

## Quick Start

```bash
pnpm install
pnpm dev
```

The docs site runs on `http://localhost:4010`.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
```

## Structure

```text
docs/
├── content/docs/          # MDX content
├── src/app/               # Next.js routes and layouts
├── src/lib/source.ts      # Fumadocs source wiring
├── source.config.ts       # MDX/frontmatter collection config
├── next.config.mjs        # Next.js + Turbopack config
└── next-sitemap.config.js # Sitemap/robots generation
```

## Notes

- `SITE_URL` controls `metadataBase` and sitemap generation. See `.env.example`.
- This package uses Biome, not ESLint/Prettier.
- `pnpm build` generates the Next.js build and sitemap output.
