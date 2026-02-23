# Obidot Autonomous CFO — Off-Chain AI Agent

The off-chain AI agent that serves as the "brain" of the Obidot cross-chain yield vault. It analyzes DeFi yields across Polkadot parachains, uses GPT-4o to make financial decisions, and generates cryptographically secure EIP-712 execution intents.

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
│  └──────────┘    └──────────┘    └──────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ObiKit SDK (Plugin Layer)               │    │
│  │  fetch_yields │ fetch_vault_state │ execute_strategy │    │
│  │  vault_deposit │ vault_withdraw   │ (PAK tools)     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
         │                                      │
         ▼                                      ▼
  ┌─────────────┐                    ┌────────────────────┐
  │ DeFi APIs   │                    │  Polkadot Hub EVM  │
  │ (mock APYs) │                    │  ObidotVault.sol   │
  └─────────────┘                    │  Chain ID 420420417│
                                     └────────────────────┘
```

## Project Structure

```
src/
├── main.ts                    # Entrypoint — bootstrap & shutdown
├── config/
│   ├── env.ts                 # Zod-validated environment variables
│   └── constants.ts           # EIP-712 domain, ABIs, parachain registry
├── agent/
│   ├── loop.ts                # Autonomous loop orchestrator
│   ├── systemPrompt.ts        # LangChain system prompt
│   └── tools.ts               # Custom LangChain tools (ObiKit plugins)
├── services/
│   ├── signer.service.ts      # EIP-712 signing + on-chain execution
│   └── yield.service.ts       # DeFi yield data aggregation
├── types/
│   └── index.ts               # StrategyIntent, AI decision schemas
└── utils/
    └── logger.ts              # Structured logging (pino)
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

## Key Design Decisions

### Security: Intent-Only Architecture
The agent does **not** custody funds. It only produces signed `StrategyIntent` messages that the vault's on-chain policy engine validates before execution. The private key (`AGENT_PRIVATE_KEY`) only needs `STRATEGIST_ROLE` — it never holds or transfers user deposits.

### Hallucination Prevention: Zod Validation
Every LLM output is parsed through a strict Zod discriminated union schema (`aiDecisionSchema`) before any cryptographic operation. Invalid JSON, missing fields, out-of-range values, or unexpected action types are caught and the agent retries (up to 3 attempts).

### Fault Tolerance
The autonomous loop catches all errors at the cycle level. A single RPC failure, LLM timeout, or transaction revert does not crash the daemon — it logs the error and continues to the next cycle.

### Plugin Architecture
Custom tools (`FetchYieldsTool`, `FetchVaultStateTool`, `ExecuteStrategyTool`) are injected into ObiKit via `kit.addTool()`, making them available alongside the built-in PAK (Polkadot Agent Kit) tools for balance queries, transfers, and XCM operations.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for GPT-4o |
| `AGENT_PRIVATE_KEY` | Yes | — | 0x-prefixed secp256k1 private key |
| `VAULT_ADDRESS` | Yes | — | Deployed ObidotVault address |
| `ASSET_ADDRESS` | Yes | — | Underlying ERC-20 asset address |
| `RPC_URL` | No | Paseo testnet | Polkadot Hub EVM RPC endpoint |
| `LOOP_INTERVAL_MINUTES` | No | `5` | Minutes between decision cycles |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `MAX_STRATEGY_AMOUNT` | No | `100000...` (100k) | Max deployment per strategy (wei) |
| `DEFAULT_MAX_SLIPPAGE_BPS` | No | `100` | Default max slippage (1%) |
| `INTENT_DEADLINE_SECONDS` | No | `600` | EIP-712 deadline offset (10 min) |

## Dependencies

- **LangChain** — AI agent orchestration + tool binding
- **OpenAI** — GPT-4o for financial reasoning
- **viem** — EIP-712 typed data signing + EVM RPC
- **@obidot-kit/sdk** — ObiKit SDK (tools, vault, PAK integration)
- **zod** — Schema validation for env vars + LLM output
- **pino** — Structured JSON logging
