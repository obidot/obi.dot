# modules/agent — Obidot Autonomous AI Agent

Off-chain TypeScript agent that analyzes DeFi yields, makes decisions via GPT-5-mini, and submits signed EIP-712 intents to the Obidot vault on-chain. The agent never holds or transfers user funds — it only produces signed intent messages validated by the vault's on-chain policy engine.

## What It Does

1. **Perceive** — reads vault state, oracle prices, and swap quotes from Polkadot Hub
2. **Reason** — sends a structured snapshot to GPT-5-mini; receives a typed action decision (Zod-validated)
3. **Execute** — signs the decision as an EIP-712 `StrategyIntent` or `UniversalIntent` and submits it on-chain

Decision branches: `DEPLOY`, `REBALANCE`, `HARVEST`, `HOLD`, `LOCAL_SWAP`, `UNIVERSAL_INTENT`

## Quick Start

```bash
pnpm install
cp .env.example .env   # fill OPENAI_API_KEY, AGENT_PRIVATE_KEY, VAULT_ADDRESS

pnpm dev    # hot reload
pnpm build && pnpm start
```

## REST API

The agent exposes a Fastify API for frontend integration:

| Method | Path             | Description                       |
| ------ | ---------------- | --------------------------------- |
| `GET`  | `/health`        | Health check                      |
| `GET`  | `/agent/status`  | Agent loop status + last decision |
| `POST` | `/agent/trigger` | Force an immediate decision cycle |
| `GET`  | `/vault/state`   | Current vault state (TVL, shares) |
| `GET`  | `/oracle/prices` | Latest oracle prices              |
| `GET`  | `/swap/quote`    | Get best swap quote               |
| `POST` | `/swap/execute`  | Execute a swap via agent signer   |

## Environment Variables

| Variable                | Required | Description                                |
| ----------------------- | -------- | ------------------------------------------ |
| `OPENAI_API_KEY`        | Yes      | OpenAI key for GPT-5-mini                  |
| `AGENT_PRIVATE_KEY`     | Yes      | `0x`-prefixed key with `STRATEGIST_ROLE`   |
| `VAULT_ADDRESS`         | Yes      | Deployed ObidotVault address               |
| `ASSET_ADDRESS`         | Yes      | Underlying ERC-20 asset address            |
| `RPC_URL`               | No       | Polkadot Hub EVM RPC (defaults to TestNet) |
| `LOOP_INTERVAL_MINUTES` | No       | Decision cycle interval (default: 5)       |
| `MAX_STRATEGY_AMOUNT`   | No       | Max deployment per strategy in wei         |
| `API_HOST`              | No       | API bind host (default: `0.0.0.0`)         |
| `API_PORT`              | No       | Preferred API port (default: `3011`)       |
| `API_PORT_MAX_TRIES`    | No       | Port retry window when busy (default: `5`) |

## Security

The agent holds a private key with `STRATEGIST_ROLE` / `SOLVER_ROLE` only. Every LLM output is parsed through a Zod discriminated union schema before any signing operation. Invalid or out-of-range values are rejected; the loop retries up to 3 times before skipping the cycle. A single RPC failure or tx revert never crashes the daemon.

## Stack

- **LangChain** — agent orchestration + tool binding
- **viem** — EIP-712 signing, eth_call
- **@obidot-kit/sdk** — vault tools, PAK integration
- **Fastify** — REST API
- **zod** — env var + LLM output validation
- **pino** — structured JSON logging
