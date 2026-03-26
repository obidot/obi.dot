# modules/agent

Off-chain agent runtime for Obidot. It runs the autonomous decision loop, exposes a Fastify API for local integrations, and optionally starts a Telegram bot.

## Quick Start

```bash
pnpm install
cp .env.example .env

pnpm dev
```

The API binds to `127.0.0.1:3011` by default.

## What It Does

1. Reads vault state, yield data, cross-chain state, and swap routing data.
2. Uses the configured LLM provider via `createLlm()` for the autonomous loop and interactive surfaces.
3. Signs and submits strategy/intention transactions only through operator-controlled tool paths.

## API Surface

All HTTP routes are prefixed with `/api`.

| Method | Path                     | Description |
| ------ | ------------------------ | ----------- |
| `GET`  | `/api/health`            | Health check |
| `GET`  | `/api/vault/state`       | Current vault state |
| `GET`  | `/api/vault/performance` | Vault performance snapshot |
| `GET`  | `/api/yields`            | Yield data |
| `GET`  | `/api/yields/bifrost`    | Bifrost-specific yield data |
| `GET`  | `/api/yields/uniswap`    | Uniswap-related yield data |
| `GET`  | `/api/strategies`        | Strategy history |
| `GET`  | `/api/crosschain/state`  | Cross-chain vault state |
| `GET`  | `/api/agent/log`         | Recent decision log |
| `GET`  | `/api/swap/routes`       | Swap route discovery |
| `POST` | `/api/chat`              | Read-only assistant endpoint |
| `GET`  | `/ws`                    | WebSocket event stream |

`POST /api/chat` is intentionally read-only. It can inspect state and quotes, but it does not execute deposits, swaps, or strategy transactions.

## Environment

Important variables:

| Variable | Description |
| -------- | ----------- |
| `LLM_PROVIDER` | `openai`, `anthropic`, or `openrouter` |
| `LLM_MODEL` | Optional model override |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider credentials |
| `AGENT_PRIVATE_KEY` | Strategist key for signing execution paths |
| `RPC_URL` | Polkadot Hub RPC endpoint |
| `VAULT_ADDRESS` | Vault contract address |
| `ASSET_ADDRESS` | Vault underlying asset |
| `API_HOST` | Loopback by default (`127.0.0.1`) |
| `API_ALLOWED_ORIGINS` | Comma-separated browser origins allowed by CORS |
| `API_PORT` | Preferred API port (`3011`) |

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
```
