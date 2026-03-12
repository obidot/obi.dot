# Package: @obidot/agent (modules/agent/)

Off-chain AI agent that autonomously manages the ObidotVault. Built with
TypeScript, LangChain, viem, and pino logging. Includes DEX aggregator routing,
universal intent execution, and a Fastify API server.

## Build & Test Commands

```sh
# From repo root
pnpm --filter @obidot/agent run typecheck     # Strict TypeScript check (mandatory)
pnpm --filter @obidot/agent run lint          # ESLint
pnpm --filter @obidot/agent run dev           # Dev mode with tsx watch
pnpm --filter @obidot/agent run build         # Compile to dist/
pnpm --filter @obidot/agent run start         # Run compiled agent

# Or from modules/agent/
npx tsc --noEmit                              # Typecheck
```

No unit test suite — validate via `typecheck` and `lint` before committing.

## TypeScript Configuration

- **Target:** ES2022, **Module:** Node16, **Resolution:** Node16
- **Strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **ESM only** (`"type": "module"` in package.json)
- Node >= 20 required

## Project Layout

```
modules/agent/src/
├── main.ts                         # Entrypoint — bootstrap & shutdown
├── agent/
│   ├── loop.ts                     # Autonomous loop orchestrator (LangChain + strategy verification)
│   ├── systemPrompt.ts             # LangChain system prompt (vault, DEX aggregator, intent sections)
│   └── tools.ts                    # Custom LangChain tools (6 tools: fetch yields/state/strategy + swap quote/local swap/intent)
├── services/
│   ├── yield.service.ts            # Bifrost + DeFiLlama yield data
│   ├── signer.service.ts           # EIP-712 signing for strategy intents
│   ├── price-aggregator.service.ts # Multi-source oracle (Pyth, CoinGecko, Binance, Subsquid)
│   ├── swap-router.service.ts      # SwapRouter + SwapQuoter on-chain reads (getBestQuote, getAllQuotes, etc.)
│   └── intent.service.ts           # Universal intent signing + execution (EIP-712, executeIntent, executeLocalSwap)
├── api/
│   ├── server.ts                   # Fastify API server (vault, yields, strategies, swap, agent, chat)
│   └── routes/
│       └── swap.ts                 # GET /api/swap/quote, GET /api/swap/routes
├── config/
│   ├── env.ts                      # Zod-validated environment variables (including DEX addresses)
│   ├── constants.ts                # Chain IDs, API URLs, protocol addresses, ABIs, EIP-712 types
│   └── oracle.config.ts            # Oracle source configuration
├── types/
│   └── index.ts                    # StrategyIntent, UniversalIntent, PoolType, AI decision schemas (incl. LOCAL_SWAP, UNIVERSAL_INTENT)
├── telegram/                       # Telegram bot integration
└── utils/
    └── logger.ts                   # pino logger setup (vaultLog, yieldLog, swapLog, intentLog)
```

## Code Style

### Imports

```typescript
// 1. External packages first
import { ChatOpenAI } from "@langchain/openai";
import { createPublicClient } from "viem";

// 2. Type-only imports separate (use `import type`)
import type { ProtocolYield, BifrostYield } from "../types/index.js";

// 3. Local imports with .js extension
import { KNOWN_PARACHAINS } from "../config/constants.js";
import { yieldLog } from "../utils/logger.js";
```

### Naming

- `camelCase` — variables, functions, methods
- `PascalCase` — classes, types, interfaces, enums
- `UPPER_SNAKE_CASE` — constants (`FETCH_TIMEOUT_MS`, `CACHE_TTL_MS`)
- Prefix private class fields: `private readonly BIFROST_API_URL`

### Structure

- Section headers: `// ── Section Name ──────────` bars (mirrors Solidity style)
- Classes: constructor → public methods → private methods
- JSDoc on exported classes and public methods
- Interfaces for API response shapes (e.g. `BifrostVTokenInfo`, `DeFiLlamaPool`)

### Error Handling

- `try/catch` with typed errors; log via pino, never `console.log`
- Use `unknown` not `any`; narrow with type guards
- `as` casts only when truly unavoidable (e.g. viem account types)
- Required viem pattern: `chain: ctx.chain, account: ctx.account as \`0x${string}\``

### Dependencies

- **LangChain:** `@langchain/core`, `@langchain/openai`, `langchain`
- **viem:** on-chain reads/writes
- **obi-kit:** `@obidot-kit/core`, `@obidot-kit/llm`, `@obidot-kit/sdk` (linked locally)
- **pino:** structured logging
- **zod:** runtime schema validation
- **fastify:** API server
- **grammy:** Telegram bot integration

## API Endpoints

| Method | Path                     | Description                                              |
| ------ | ------------------------ | -------------------------------------------------------- |
| GET    | `/api/vault/state`       | Vault state (totalAssets, paused, etc.)                  |
| GET    | `/api/vault/performance` | Vault PnL, HWM, fees                                     |
| GET    | `/api/yields`            | All protocol yields                                      |
| GET    | `/api/yields/bifrost`    | Bifrost-specific yields                                  |
| GET    | `/api/strategies`        | Strategy execution history                               |
| GET    | `/api/crosschain/state`  | Satellite vault states                                   |
| GET    | `/api/agent/log`         | Agent decision log                                       |
| POST   | `/api/chat`              | Chat with AI agent                                       |
| GET    | `/api/swap/quote`        | DEX aggregator quote (pool, tokenIn, tokenOut, amountIn) |
| GET    | `/api/swap/routes`       | Available pool adapters + router status                  |

## PR Instructions

- Branch/title format: `[@obidot/agent] <Title>`
- Run `typecheck` and `lint` before committing — both must pass cleanly
