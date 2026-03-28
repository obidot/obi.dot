# Obidot

Obidot is the frontend, off-chain agent, and docs workspace for the Obidot protocol on Polkadot Hub. This repo is focused on three local surfaces:

- `modules/app` — Next.js trading and vault dashboard UI
- `modules/agent` — Fastify + LangChain autonomous agent with read-only chat, streamed execution proposals, and limit-order monitoring APIs
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

- `POST /api/chat` remains the read-only inspection surface.
- `POST /api/chat/execute` streams proposals for the browser UI, keeps short per-wallet in-memory history, and still requires wallet approval in the app for any execution.
- Limit orders are now agent-monitored and stored server-side; the browser reviews triggered orders before any approval flow starts.
- `/insights` is backed by `obi.index` GraphQL analytics (`protocolStats`, `topRoutes`, `priceHistory`), while `/swap` also consumes indexed cross-chain lifecycle rows for the status panel.
- Cross-chain tracking is currently strongest for locally indexed Polkadot Hub router/executor surfaces. Remote destination-host receipts are still a documented limitation.
- The agent binds to `127.0.0.1` by default. If you intentionally expose it beyond loopback, pair that with an explicit `API_ALLOWED_ORIGINS` configuration.
- `SITE_URL` controls docs metadata and sitemap generation. It defaults to `https://obidot.com`.

## Related Repos

- [obi.router](https://github.com/obidot/obi.router) — smart contracts
- [obi-kit](https://github.com/obidot/obi-kit) — SDK and agent tooling
- [obi.index](https://github.com/obidot/obi.index) — indexer and backend data services
