# Obidot Autonomous CFO — Off-Chain AI Agent

The off-chain AI agent that serves as the "brain" of the Obidot cross-chain DEX aggregator. It analyzes DeFi yields across Polkadot parachains, routes swaps through the on-hub DEX aggregator (SwapRouter), uses GPT-4o to make financial decisions, generates cryptographically secure EIP-712 execution intents (both `StrategyIntent` and `UniversalIntent`), and exposes a Fastify REST API for frontend integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Autonomous Loop                          │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐  │
│  │Perception│───▶│Reasoning │───▶│     Execution        │  │
│  │          │    │ (GPT-4o) │    │                      │  │
│  │• Yields  │    │• Analyze │    │• Zod validate        │  │
│  │• Vault   │    │• Decide  │    │• EIP-712 sign        │  │
│  │  state   │    │• JSON    │    │• Submit tx           │  │
│  │• Swap    │    │          │    │• SwapRouter dispatch  │  │
│  │  quotes  │    │          │    │• Universal intents    │  │
│  └──────────┘    └──────────┘    └──────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ObiKit SDK (Plugin Layer)               │    │
│  │  fetch_yields │ fetch_vault_state │ execute_strategy │    │
│  │  vault_deposit │ vault_withdraw   │ (PAK tools)     │    │
│  │  swap_quote   │ execute_swap      │ execute_intent   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Fastify API Server                      │    │
│  │  /health │ /agent/* │ /vault/* │ /swap/* │ /oracle/* │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ┌─────────────┐            ┌────────────────────┐
  │ DeFi APIs   │            │  Polkadot Hub EVM  │
  │ (mock APYs) │            │  ObidotVault.sol   │
  └─────────────┘            │  SwapRouter.sol    │
                             │  Chain ID 420420417│
                             └────────────────────┘
```

## Project Structure

```
src/
├── main.ts                    # Entrypoint — bootstrap, API server & shutdown
├── config/
│   ├── env.ts                 # Zod-validated environment variables (15 vars)
│   └── constants.ts           # EIP-712 domains, ABIs (vault + router + quoter + oracle),
│                              #   parachain registry, DEX aggregator addresses,
│                              #   UNIVERSAL_INTENT_TYPES
├── agent/
│   ├── loop.ts                # Autonomous loop — 6 decision branches
│   │                          #   (DEPLOY, REBALANCE, HARVEST, HOLD,
│   │                          #    LOCAL_SWAP, UNIVERSAL_INTENT)
│   ├── systemPrompt.ts        # LangChain system prompt with DEX + intent sections
│   └── tools.ts               # 6 custom LangChain tools:
│                              #   FetchYieldsTool, FetchVaultStateTool,
│                              #   ExecuteStrategyTool, SwapQuoteTool,
│                              #   ExecuteLocalSwapTool, ExecuteIntentTool
├── services/
│   ├── signer.service.ts      # EIP-712 signing + on-chain execution
│   ├── yield.service.ts       # DeFi yield data aggregation
│   ├── swap-router.service.ts # SwapRouter + SwapQuoter interaction:
│   │                          #   getQuote, getBestQuote, executeLocalSwap,
│   │                          #   getAdapters, buildSwapParams
│   └── intent.service.ts      # Universal intent lifecycle:
│   │                          #   buildIntent, signIntent, executeIntent,
│   │                          #   computeDigest, getNonce
├── api/
│   ├── server.ts              # Fastify server setup + route registration
│   └── routes/
│       └── swap.ts            # /swap/quote, /swap/routes, /swap/execute endpoints
├── types/
│   └── index.ts               # StrategyIntent, UniversalIntent, PoolType enum,
│                              #   Route, SwapParams, SwapQuote, AI decision schemas
│                              #   (LOCAL_SWAP + UNIVERSAL_INTENT branches)
└── utils/
    └── logger.ts              # Structured logging (pino) — swapLog, intentLog children
```

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your keys and addresses

# 3. Development mode (hot reload)
pnpm dev

# 4. Production build & run
pnpm build
pnpm start
```

## API Endpoints

The agent exposes a Fastify REST API for frontend integration:

| Method | Path              | Description                         |
| ------ | ----------------- | ----------------------------------- |
| GET    | `/health`         | Health check                        |
| GET    | `/agent/status`   | Agent loop status + last decision   |
| POST   | `/agent/trigger`  | Force an immediate decision cycle   |
| GET    | `/vault/state`    | Current vault state (TVL, shares)   |
| GET    | `/vault/position` | User position details               |
| GET    | `/oracle/prices`  | Latest oracle prices                |
| GET    | `/swap/quote`     | Get swap quote from SwapQuoter      |
| GET    | `/swap/routes`    | Available swap routes + adapters    |
| POST   | `/swap/execute`   | Execute a swap via the agent signer |
| GET    | `/yields`         | Current DeFi yield data             |

## Key Design Decisions

### Security: Intent-Only Architecture

The agent does **not** custody funds. It only produces signed `StrategyIntent` or `UniversalIntent` messages that the vault's on-chain policy engine validates before execution. The private key (`AGENT_PRIVATE_KEY`) only needs `STRATEGIST_ROLE` / `SOLVER_ROLE` — it never holds or transfers user deposits.

### DEX Aggregator Integration

The agent queries `SwapQuoter` for best prices across all registered pool adapters (Hydration Omnipool, AssetHub Pair, Bifrost DEX), then routes swaps through the vault's `executeLocalSwap()` function which delegates to `SwapRouter`. This keeps all swap execution within the vault's policy engine.

### Universal Intent System

Beyond `StrategyIntent` (cross-chain yield strategies), the agent can build and sign `UniversalIntent` structs for arbitrary cross-chain operations — XCM transfers to parachains or Hyperbridge dispatches to EVM chains. The intent specifies source/destination assets, amounts, and routing, and is validated on-chain with `SOLVER_ROLE` access.

### Hallucination Prevention: Zod Validation

Every LLM output is parsed through a strict Zod discriminated union schema (`aiDecisionSchema`) before any cryptographic operation. The schema includes 6 action types: `DEPLOY`, `REBALANCE`, `HARVEST`, `HOLD`, `LOCAL_SWAP`, and `UNIVERSAL_INTENT`. Invalid JSON, missing fields, out-of-range values, or unexpected action types are caught and the agent retries (up to 3 attempts).

### Fault Tolerance

The autonomous loop catches all errors at the cycle level. A single RPC failure, LLM timeout, or transaction revert does not crash the daemon — it logs the error and continues to the next cycle.

### Plugin Architecture

Custom tools (`FetchYieldsTool`, `FetchVaultStateTool`, `ExecuteStrategyTool`, `SwapQuoteTool`, `ExecuteLocalSwapTool`, `ExecuteIntentTool`) are injected into ObiKit via `kit.addTool()`, making them available alongside the built-in PAK (Polkadot Agent Kit) tools for balance queries, transfers, and XCM operations.

## Environment Variables

| Variable                      | Required | Default              | Description                       |
| ----------------------------- | -------- | -------------------- | --------------------------------- |
| `OPENAI_API_KEY`              | Yes      | —                    | OpenAI API key for GPT-4o         |
| `AGENT_PRIVATE_KEY`           | Yes      | —                    | 0x-prefixed secp256k1 private key |
| `VAULT_ADDRESS`               | Yes      | —                    | Deployed ObidotVault address      |
| `ASSET_ADDRESS`               | Yes      | —                    | Underlying ERC-20 asset address   |
| `RPC_URL`                     | No       | Polkadot Hub TestNet | Polkadot Hub EVM RPC endpoint     |
| `LOOP_INTERVAL_MINUTES`       | No       | `5`                  | Minutes between decision cycles   |
| `LOG_LEVEL`                   | No       | `info`               | Pino log level                    |
| `MAX_STRATEGY_AMOUNT`         | No       | `100000...` (100k)   | Max deployment per strategy (wei) |
| `DEFAULT_MAX_SLIPPAGE_BPS`    | No       | `100`                | Default max slippage (1%)         |
| `INTENT_DEADLINE_SECONDS`     | No       | `600`                | EIP-712 deadline offset (10 min)  |
| `SWAP_ROUTER_ADDRESS`         | No       | `0x0...0`            | SwapRouter contract address       |
| `SWAP_QUOTER_ADDRESS`         | No       | `0x0...0`            | SwapQuoter contract address       |
| `HYDRATION_ADAPTER_ADDRESS`   | No       | `0x0...0`            | HydrationOmnipoolAdapter address  |
| `ASSET_HUB_ADAPTER_ADDRESS`   | No       | `0x0...0`            | AssetHubPairAdapter address       |
| `BIFROST_DEX_ADAPTER_ADDRESS` | No       | `0x0...0`            | BifrostDEXAdapter address         |

> DEX aggregator addresses default to zero-address. The agent gracefully degrades when contracts are not deployed — swap/quote operations return errors but don't crash the loop.

## Dependencies

- **LangChain** — AI agent orchestration + tool binding
- **OpenAI** — GPT-4o for financial reasoning
- **viem** — EIP-712 typed data signing + EVM RPC
- **@obidot-kit/sdk** — ObiKit SDK (tools, vault, PAK integration)
- **zod** — Schema validation for env vars + LLM output
- **pino** — Structured JSON logging
- **fastify** — REST API server for frontend integration
- **grammy** — Telegram bot integration (optional)
