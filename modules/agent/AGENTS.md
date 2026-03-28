# Package: @obidot/agent (modules/agent/)

Off-chain AI agent that autonomously manages the ObidotVault. Built with
TypeScript, LangChain, viem, and pino logging. Includes DEX aggregator routing,
universal intent execution, and a Fastify API server.

## Build & Test Commands

```sh
# From repo root
pnpm --filter @obidot/agent run typecheck     # Strict TypeScript check (mandatory)
pnpm --filter @obidot/agent run lint          # Biome check
pnpm --filter @obidot/agent run test          # Node test runner
pnpm --filter @obidot/agent run format        # Biome format
pnpm --filter @obidot/agent run dev           # Dev mode with tsx watch
pnpm --filter @obidot/agent run build         # Compile to dist/
pnpm --filter @obidot/agent run start         # Run compiled agent

# Or from modules/agent/
npx tsc --noEmit                              # Typecheck
```

Targeted Vitest coverage exists. Run `pnpm --filter @obidot/agent run test` alongside `typecheck` and `lint` before close-out.

## TypeScript Configuration

- **Target:** ES2022, **Module:** Node16, **Resolution:** Node16
- **Strict mode** with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **ESM only** (`"type": "module"` in package.json)
- Node >= 20 required

## Project Layout

```
modules/agent/src/
├── bootstrap.ts                    # Current entry used by dev/start scripts
├── main.ts                         # Service construction + lifecycle wiring
├── agent/
│   ├── llm.ts                      # Chat-model factory
│   ├── loop.ts                     # Autonomous loop orchestrator
│   ├── systemPrompt.ts             # Loop prompt
│   └── tools.ts                    # Loop/browser tool wiring
├── services/
│   ├── crosschain.service.ts       # Satellite state aggregation
│   ├── event-bus.service.ts        # WebSocket event relay
│   ├── intent.service.ts           # Universal intent execution helpers
│   ├── limit-order-monitor.service.ts # Off-chain limit-order monitor
│   ├── oracle.service.ts           # Oracle reads and freshness checks
│   ├── price-aggregator.service.ts # Multi-source pricing
│   ├── signer.service.ts           # EIP-712 signing for strategy intents
│   ├── strategy-store.service.ts   # In-memory decision log/history
│   ├── swap-router.service.ts      # SwapRouter + SwapQuoter reads
│   └── yield.service.ts            # Bifrost + DeFiLlama yield data
├── api/
│   ├── server.ts                   # Fastify API server + WebSocket
│   └── routes/
│       ├── agent.ts                # Agent log + chat routes
│       ├── crosschain.ts           # Cross-chain state
│       ├── limit-orders.ts         # Limit-order CRUD
│       ├── strategies.ts           # Strategy history
│       ├── swap.ts                 # Swap quote/routes
│       ├── vault.ts                # Vault state/performance
│       └── yields.ts               # Yield routes
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
| POST   | `/api/chat`              | Read-only inspection chat                                |
| POST   | `/api/chat/execute`      | Streamed browser chat with route proposals               |
| GET    | `/api/swap/quote`        | DEX aggregator quote (pool, tokenIn, tokenOut, amountIn) |
| GET    | `/api/swap/routes`       | Available pool adapters + router status                  |
| GET    | `/api/limit-orders/:address` | List limit orders for a wallet                       |
| POST   | `/api/limit-orders`      | Create a monitored limit order                           |
| DELETE | `/api/limit-orders/:id`  | Cancel a monitored limit order                           |

### Chat Surfaces
- `POST /api/chat` remains read-only even if the model recommends a trade.
- `POST /api/chat` can use caller-supplied history or short in-memory history keyed by wallet address.
- `POST /api/chat/execute` can emit streamed trade proposals, but it never signs or submits transactions server-side.
- `POST /api/chat/execute` requires an `address`, caps prompts at `4000` characters, stores up to `40` recent history messages per address, and rate-limits each address to `10` requests per minute.
- Browser execution flows are approval-gated in `modules/app`; keep the server documentation explicit about that boundary.

### GET /api/swap/routes Response

The `/api/swap/routes` endpoint includes cross-chain stubs appended to all live on-chain routes:

| Stub | routeType | status |
|------|-----------|--------|
| RelayTeleport (XCM) | xcm | live |
| Hydration Omnipool (XCM) | xcm | simulated or mainnet_only |
| AssetHub Pair | xcm | simulated |
| Bifrost DEX (XCM) | xcm | mainnet_only |
| Uniswap V2 (Polkadot Hub) | local | live |
| Karura DEX (XCM) | xcm | mainnet_only |
| Interlay Loans (XCM) | xcm | mainnet_only |
| Moonbeam DEX (XCM) | xcm | coming_soon |
| Uniswap V3 (Polkadot Hub) | local | coming_soon |
| Hyperbridge (ISMP) | bridge | mainnet_only |
| Snowbridge (BridgeHub → Ethereum) | bridge | coming_soon |
| ChainFlip (Polkadot → Ethereum) | bridge | coming_soon |

Stubs have `amountOut: "0"` and `hops: []`. The UI filters them from on-chain route cards and displays them separately in the cross-chain section.

## UniswapV2 Pairs (SP-1)

`UV2_PAIRS` in `src/config/constants.ts` is the agent's source of truth for UV2 pair labels.
`LP_PAIRS` in `modules/app/src/lib/constants.ts` must stay in sync — the frontend uses label matching
(`LP_PAIRS.find(p => p.label === y.name)`) to open the `LiquidityPanel` for UV2 rows.

If you add a new UV2 pair to `UV2_PAIRS`, also add the matching entry to `LP_PAIRS` in the app.

**Deployed LP pairs (Polkadot Hub TestNet, 2026-03-20):**
| Label | Pair Address |
|---|---|
| tDOT/TKB | `0xDc1b4a27d44613aa5072Ca6edC20151D94e7f93A` |
| tDOT/tUSDC | `0x9576F7b40bC3a8Bb5d236Cd4bEBC29dC40AF0fa4` |
| tDOT/tETH | `0x4a0183BA79Ab7072240B5Fd8B6A1055E8e60aC83` |
| tUSDC/tETH | `0x3FBa4A4db176201d3A3a5B25e7561274ceCb6ef5` |
| TKB/TKA | `0xd6F5C4b7b3911Db7D062D0457f8b3D4045C86d50` |

## PR Instructions

- Branch/title format: `[@obidot/agent] <Title>`
- Run `typecheck` and `lint` before committing — both must pass cleanly
