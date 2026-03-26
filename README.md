# Obidot

Obidot is the frontend, off-chain agent, and docs workspace for the Obidot protocol on Polkadot Hub. This repo is focused on three local surfaces:

- `modules/app` — Next.js trading and vault dashboard UI
- `modules/agent` — Fastify + LangChain autonomous agent and read-only HTTP assistant
- `docs` — Fumadocs documentation site

## Quick Start

```bash
pnpm install

# App: http://localhost:3010
pnpm app:dev

# Agent API: http://127.0.0.1:3011
pnpm agent:dev

# Docs: http://localhost:4010
pnpm docs:dev
```

## Tooling

- Node.js 20+
- `pnpm` is the canonical package manager for this repo
- Root verification commands:
  - `pnpm check` runs lint, typecheck, and build
  - `pnpm test` runs the real test suite currently present in the workspace

## Repo Layout

```text
obidot/
├── modules/
│   ├── agent/   # Off-chain agent, API server, Telegram bot
│   └── app/     # Next.js app
├── docs/        # Fumadocs docs site
└── pnpm-workspace.yaml
```

## Notes

- The browser-exposed `POST /api/chat` surface is intentionally read-only. It can inspect vault state, yields, and swap routes, but it does not execute transactions.
- The agent binds to `127.0.0.1` by default. If you intentionally expose it beyond loopback, pair that with an explicit `API_ALLOWED_ORIGINS` configuration.
- `SITE_URL` controls docs metadata and sitemap generation. It defaults to `https://obidot.com`.

## Related Repos

- [obi.router](https://github.com/obidot/obi.router) — smart contracts
- [obi-kit](https://github.com/obidot/obi-kit) — SDK and agent tooling
- [obi.index](https://github.com/obidot/obi.index) — indexer and backend data services
