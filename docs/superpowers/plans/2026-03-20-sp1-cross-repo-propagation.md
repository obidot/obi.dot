# SP-1 Cross-Repo Propagation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate the SP-1 UniswapV2 liquidity provision deployment across `obi.index` (indexer) and `obi-kit` (SDK) so LP pair events are indexed, queryable via GraphQL, and accessible to LangChain agent tooling.

**Architecture:** SP-1 deployed 5 LP pairs (`LiquidityPair`) and a `LiquidityRouter` to Polkadot Hub TestNet. The LP pairs emit `Mint`, `Burn`, `Sync`, and `Swap` events (UniswapV2-compatible). `LiquidityRouter` emits no events — it calls `mint`/`burn` directly on pairs. `obi.index` must watch all 5 pair addresses; `obi-kit` must export their ABIs and a LangChain tool for reserve reads.

**Tech Stack:** TypeScript, Prisma/PostgreSQL (obi.index), viem, LangChain (obi-kit), Apollo GraphQL, Biome linting.

**Context — deployed pair addresses (Polkadot Hub TestNet, 2026-03-20):**
| Label | Address |
|---|---|
| tDOT/TKB | `0xDc1b4a27d44613aa5072Ca6edC20151D94e7f93A` |
| tDOT/tUSDC | `0x9576F7b40bC3a8Bb5d236Cd4bEBC29dC40AF0fa4` |
| tDOT/tETH | `0x4a0183BA79Ab7072240B5Fd8B6A1055E8e60aC83` |
| tUSDC/tETH | `0x3FBa4A4db176201d3A3a5B25e7561274ceCb6ef5` |
| TKB/TKA | `0xd6F5C4b7b3911Db7D062D0457f8b3D4045C86d50` |

**LiquidityPair events (exact signatures from LiquidityPair.sol):**
- `Mint(address indexed sender, uint256 amount0, uint256 amount1)`
- `Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)`
- `Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)`
- `Sync(uint112 reserve0, uint112 reserve1)`

**Status of other repos (already done):**
- `obidot/` — SP-1 complete: Task 10 done, `LP_PAIRS` addresses filled, docs updated
- `obi.router/` — contracts deployed + verified, `DeployLiquidityPairs.s.sol` updated
- `brand-kit/` — no changes needed

---

## Repo A: obi.index

**Repo path:** `~/dev/github.com/obidot/obi.index`
**Check commands:** `pnpm typecheck`, `pnpm build`, `npx prisma generate`, `npx prisma migrate dev`
**Architecture:** Blockscout REST API poller → event handlers → Prisma writes → Apollo GraphQL

### File Map

| File | Action |
|---|---|
| `src/config/contracts.ts` | Modify — add LP addresses, `LP_PAIR_ABI`, 5 `CONTRACT_REGISTRY` entries |
| `prisma/schema.prisma` | Modify — add `LpMint`, `LpBurn`, `LpSync`, `LpPoolState` models |
| `src/sync/handlers/liquidity.ts` | Create — `handleLiquidityPairEvent()` handler |
| `src/sync/poller.ts` | Modify — add 5 LP pair entries to `HANDLER_MAP` |
| `src/graphql/pubsub.ts` | Modify — add `LP_MINT`, `LP_BURN` topics |
| `src/graphql/typeDefs.ts` | Modify — add `LpMint`, `LpBurn`, `LpPoolState` types + queries + subscriptions |
| `src/graphql/resolvers.ts` | Modify — add LP resolvers |

---

### Task A1: Add LP pair addresses + ABI + registry entries to `contracts.ts`

**Files:**
- Modify: `src/config/contracts.ts` (lines ~1–31 for ADDRESSES, ~633–690 for CONTRACT_REGISTRY)

- [ ] **Step 1: Read the current file**

Read `src/config/contracts.ts` lines 1–35 to confirm the ADDRESSES block shape, then lines 630–691 to confirm CONTRACT_REGISTRY shape.

- [ ] **Step 2: Add LP pair addresses to ADDRESSES**

Append after the last address entry (`ObidotVault`):

```typescript
  // SP-1 liquidity provision (2026-03-20)
  LiquidityPairDotTkb:   "0xDc1b4a27d44613aa5072Ca6edC20151D94e7f93A" as Address,
  LiquidityPairDotUsdc:  "0x9576F7b40bC3a8Bb5d236Cd4bEBC29dC40AF0fa4" as Address,
  LiquidityPairDotEth:   "0x4a0183BA79Ab7072240B5Fd8B6A1055E8e60aC83" as Address,
  LiquidityPairUsdcEth:  "0x3FBa4A4db176201d3A3a5B25e7561274ceCb6ef5" as Address,
  LiquidityPairTkbTka:   "0xd6F5C4b7b3911Db7D062D0457f8b3D4045C86d50" as Address,
```

- [ ] **Step 3: Add `LP_PAIR_ABI` constant before `CONTRACT_REGISTRY`**

Insert after the last existing ABI block (before the CONTRACT_REGISTRY section):

```typescript
/** LiquidityPair — UniswapV2-compatible LP pair events + view functions */
export const LP_PAIR_ABI = [
  {
    type: "event",
    name: "Mint",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Burn",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Sync",
    inputs: [
      { name: "reserve0", type: "uint112", indexed: false },
      { name: "reserve1", type: "uint112", indexed: false },
    ],
  },
  {
    type: "function",
    name: "token0",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token1",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [
      { name: "_reserve0", type: "uint112" },
      { name: "_reserve1", type: "uint112" },
      { name: "_blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;
```

- [ ] **Step 4: Add 5 LP pair entries to CONTRACT_REGISTRY**

Append inside the `CONTRACT_REGISTRY` array after the last `NativeAssetUSDC` entry:

```typescript
  { name: "LiquidityPairDotTkb",  address: ADDRESSES.LiquidityPairDotTkb,  abi: LP_PAIR_ABI },
  { name: "LiquidityPairDotUsdc", address: ADDRESSES.LiquidityPairDotUsdc, abi: LP_PAIR_ABI },
  { name: "LiquidityPairDotEth",  address: ADDRESSES.LiquidityPairDotEth,  abi: LP_PAIR_ABI },
  { name: "LiquidityPairUsdcEth", address: ADDRESSES.LiquidityPairUsdcEth, abi: LP_PAIR_ABI },
  { name: "LiquidityPairTkbTka",  address: ADDRESSES.LiquidityPairTkbTka,  abi: LP_PAIR_ABI },
```

- [ ] **Step 5: Typecheck**

```bash
cd ~/dev/github.com/obidot/obi.index && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/contracts.ts
git commit -m "feat(index): add SP-1 LP pair addresses + ABI + registry"
```

---

### Task A2: Add LP Prisma models + run migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `LpMint`, `LpBurn`, `LpSync`, `LpPoolState` models**

Append after the existing `BifrostStrategy` model (before the INFRASTRUCTURE section):

```prisma
/// UniswapV2 Mint event — liquidity added to a pair
model LpMint {
  id          String   @id @default(cuid())
  txHash      String
  logIndex    Int
  blockNumber Int
  timestamp   DateTime
  pair        String   // LP pair address
  sender      String   // address that triggered mint
  amount0     String   // uint256
  amount1     String   // uint256

  @@unique([txHash, logIndex])
  @@index([pair])
  @@index([blockNumber])
  @@map("lp_mints")
}

/// UniswapV2 Burn event — liquidity removed from a pair
model LpBurn {
  id          String   @id @default(cuid())
  txHash      String
  logIndex    Int
  blockNumber Int
  timestamp   DateTime
  pair        String   // LP pair address
  sender      String
  to          String
  amount0     String   // uint256
  amount1     String   // uint256

  @@unique([txHash, logIndex])
  @@index([pair])
  @@index([blockNumber])
  @@map("lp_burns")
}

/// UniswapV2 Sync event — reserve snapshot after each interaction
model LpSync {
  id          String   @id @default(cuid())
  txHash      String
  logIndex    Int
  blockNumber Int
  timestamp   DateTime
  pair        String   // LP pair address
  reserve0    String   // uint112 as string
  reserve1    String   // uint112 as string

  @@unique([txHash, logIndex])
  @@index([pair])
  @@index([blockNumber])
  @@map("lp_syncs")
}

/// Latest reserve snapshot per LP pair (upserted on every Sync)
model LpPoolState {
  id              String   @id @default(cuid())
  pair            String   @unique // LP pair address
  token0          String   // address
  token1          String   // address
  reserve0        String   @default("0")
  reserve1        String   @default("0")
  totalSupply     String   @default("0")
  updatedAtBlock  Int      @default(0)
  updatedAt       DateTime @updatedAt

  @@map("lp_pool_state")
}
```

- [ ] **Step 2: Run migration**

```bash
cd ~/dev/github.com/obidot/obi.index
npx prisma migrate dev --name add_lp_models
```

Expected: Migration created and applied, Prisma Client regenerated.

- [ ] **Step 3: Verify Prisma generate**

```bash
npx prisma generate
```

Expected: 0 errors, Client updated.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(index): add LP mint/burn/sync/state Prisma models"
```

---

### Task A3: Create `src/sync/handlers/liquidity.ts`

**Files:**
- Create: `src/sync/handlers/liquidity.ts`

Follow the exact same style as `src/sync/handlers/router.ts`: named exports, typed `PrismaClient` + `DecodedEvent` parameters, pubsub publish for real-time subscriptions, `skipDuplicates` on `createMany`.

- [ ] **Step 1: Read the existing router handler for style reference**

Read `src/sync/handlers/router.ts` (already done — 94 lines, follows createMany + pubsub pattern).

- [ ] **Step 2: Create the file**

```typescript
// ── Liquidity Pair Event Handlers ─────────────────────────
// Processes LiquidityPair events → Prisma writes + pubsub publish.
// LiquidityRouter has no events; all LP data comes from the pairs.

import type { PrismaClient } from "@prisma/client";
import type { DecodedEvent } from "../decoder.js";
import { pubsub, Topics } from "../../graphql/pubsub.js";
import { logger } from "../../utils/logger.js";

export async function handleLiquidityPairEvent(
  prisma: PrismaClient,
  event: DecodedEvent,
): Promise<void> {
  const { eventName, args, txHash, logIndex, blockNumber, timestamp, address } =
    event;

  switch (eventName) {
    case "Mint":
      await prisma.lpMint.createMany({
        data: [
          {
            txHash,
            logIndex,
            blockNumber,
            timestamp,
            pair: address,
            sender: String(args.sender),
            amount0: String(args.amount0),
            amount1: String(args.amount1),
          },
        ],
        skipDuplicates: true,
      });
      logger.info(
        { pair: address, amount0: String(args.amount0), amount1: String(args.amount1) },
        "LP Mint indexed",
      );
      pubsub.publish(Topics.LP_MINT, {
        id: `${txHash}-${logIndex}`,
        txHash,
        logIndex,
        blockNumber,
        timestamp,
        pair: address,
        sender: String(args.sender),
        amount0: String(args.amount0),
        amount1: String(args.amount1),
      });
      break;

    case "Burn":
      await prisma.lpBurn.createMany({
        data: [
          {
            txHash,
            logIndex,
            blockNumber,
            timestamp,
            pair: address,
            sender: String(args.sender),
            to: String(args.to),
            amount0: String(args.amount0),
            amount1: String(args.amount1),
          },
        ],
        skipDuplicates: true,
      });
      logger.info(
        { pair: address, amount0: String(args.amount0), amount1: String(args.amount1) },
        "LP Burn indexed",
      );
      pubsub.publish(Topics.LP_BURN, {
        id: `${txHash}-${logIndex}`,
        txHash,
        logIndex,
        blockNumber,
        timestamp,
        pair: address,
        sender: String(args.sender),
        to: String(args.to),
        amount0: String(args.amount0),
        amount1: String(args.amount1),
      });
      break;

    case "Sync":
      await prisma.lpSync.createMany({
        data: [
          {
            txHash,
            logIndex,
            blockNumber,
            timestamp,
            pair: address,
            reserve0: String(args.reserve0),
            reserve1: String(args.reserve1),
          },
        ],
        skipDuplicates: true,
      });
      // Upsert latest state snapshot
      await prisma.lpPoolState.upsert({
        where: { pair: address },
        create: {
          pair: address,
          token0: "",   // populated on first Mint if not yet known
          token1: "",
          reserve0: String(args.reserve0),
          reserve1: String(args.reserve1),
          updatedAtBlock: blockNumber,
        },
        update: {
          reserve0: String(args.reserve0),
          reserve1: String(args.reserve1),
          updatedAtBlock: blockNumber,
        },
      });
      logger.debug(
        { pair: address, reserve0: String(args.reserve0), reserve1: String(args.reserve1) },
        "LP Sync indexed",
      );
      break;

    case "Swap":
      // LP pair swaps are direct UniswapV2-style swaps (not through SwapRouter).
      // Log only — these don't go into SwapExecution table (different poolType context).
      logger.info(
        {
          pair: address,
          amount0In: String(args.amount0In),
          amount1In: String(args.amount1In),
          amount0Out: String(args.amount0Out),
          amount1Out: String(args.amount1Out),
        },
        "LP pair Swap (direct)",
      );
      break;

    default:
      logger.debug({ eventName, txHash, pair: address }, "Unhandled LP pair event");
      break;
  }
}
```

Note: `event.address` must exist on `DecodedEvent`. Read `src/sync/decoder.ts` first to verify the shape — if `address` isn't on `DecodedEvent`, use `event.contractAddress` or whatever field holds the emitting contract address.

- [ ] **Step 3: Verify `DecodedEvent` has the contract address field**

Read `src/sync/decoder.ts` to check the exact field name on `DecodedEvent`. Update the handler if needed (e.g., rename `address` to `contractAddress`).

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/sync/handlers/liquidity.ts
git commit -m "feat(index): add LP pair event handler (Mint/Burn/Sync)"
```

---

### Task A4: Wire LP handler into `poller.ts`

**Files:**
- Modify: `src/sync/poller.ts`

- [ ] **Step 1: Add import**

```typescript
import { handleLiquidityPairEvent } from "./handlers/liquidity.js";
```

- [ ] **Step 2: Add 5 HANDLER_MAP entries**

Append after `SwapRouter: handleRouterEvent`:

```typescript
  LiquidityPairDotTkb:  handleLiquidityPairEvent,
  LiquidityPairDotUsdc: handleLiquidityPairEvent,
  LiquidityPairDotEth:  handleLiquidityPairEvent,
  LiquidityPairUsdcEth: handleLiquidityPairEvent,
  LiquidityPairTkbTka:  handleLiquidityPairEvent,
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/sync/poller.ts
git commit -m "feat(index): wire LP pair handler into poller HANDLER_MAP"
```

---

### Task A5: Add LP pubsub topics + GraphQL schema + resolvers

**Files:**
- Modify: `src/graphql/pubsub.ts`
- Modify: `src/graphql/typeDefs.ts`
- Modify: `src/graphql/resolvers.ts`

- [ ] **Step 1: Add topics to `pubsub.ts`**

Append to the `Topics` object:

```typescript
  LP_MINT: "LP_MINT",
  LP_BURN: "LP_BURN",
```

And add `LP_MINT` and `LP_BURN` as values of `Topic`.

- [ ] **Step 2: Add GraphQL types to `typeDefs.ts`**

Read the existing typeDefs to confirm structure (GraphQL SDL string), then append:

```graphql
  type LpMint {
    id: String!
    txHash: String!
    logIndex: Int!
    blockNumber: Int!
    timestamp: String!
    pair: String!
    sender: String!
    amount0: String!
    amount1: String!
  }

  type LpBurn {
    id: String!
    txHash: String!
    logIndex: Int!
    blockNumber: Int!
    timestamp: String!
    pair: String!
    sender: String!
    to: String!
    amount0: String!
    amount1: String!
  }

  type LpPoolState {
    pair: String!
    token0: String!
    token1: String!
    reserve0: String!
    reserve1: String!
    totalSupply: String!
    updatedAtBlock: Int!
    updatedAt: String!
  }
```

Add to the `Query` type:

```graphql
    lpPools: [LpPoolState!]!
    lpPool(pair: String!): LpPoolState
    lpMints(pair: String, limit: Int): [LpMint!]!
    lpBurns(pair: String, limit: Int): [LpBurn!]!
```

Add to the `Subscription` type:

```graphql
    lpMint: LpMint!
    lpBurn: LpBurn!
```

- [ ] **Step 3: Add resolvers to `resolvers.ts`**

Read the existing resolvers to confirm the shape (Query + Subscription resolver objects), then add:

```typescript
// In Query resolvers:
lpPools: (_: unknown, __: unknown, { prisma }: Context) =>
  prisma.lpPoolState.findMany({ orderBy: { updatedAtBlock: "desc" } }),

lpPool: (_: unknown, { pair }: { pair: string }, { prisma }: Context) =>
  prisma.lpPoolState.findUnique({ where: { pair } }),

lpMints: (_: unknown, { pair, limit }: { pair?: string; limit?: number }, { prisma }: Context) =>
  prisma.lpMint.findMany({
    where: pair ? { pair } : undefined,
    orderBy: { blockNumber: "desc" },
    take: limit ?? 50,
  }),

lpBurns: (_: unknown, { pair, limit }: { pair?: string; limit?: number }, { prisma }: Context) =>
  prisma.lpBurn.findMany({
    where: pair ? { pair } : undefined,
    orderBy: { blockNumber: "desc" },
    take: limit ?? 50,
  }),

// In Subscription resolvers:
lpMint: {
  subscribe: () => pubsub.asyncIterator(Topics.LP_MINT),
  resolve: (payload: unknown) => payload,
},
lpBurn: {
  subscribe: () => pubsub.asyncIterator(Topics.LP_BURN),
  resolve: (payload: unknown) => payload,
},
```

- [ ] **Step 4: Typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: 0 errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/graphql/pubsub.ts src/graphql/typeDefs.ts src/graphql/resolvers.ts
git commit -m "feat(index): add LP GraphQL types, queries, subscriptions"
```

---

## Repo B: obi-kit

**Repo path:** `~/dev/github.com/obidot/obi-kit`
**Check commands:** `pnpm --filter @obidot-kit/core typecheck`, `pnpm --filter @obidot-kit/core build`, `pnpm --filter @obidot-kit/llm typecheck`
**Architecture:** `packages/core` (ABIs + addresses + types) → `packages/llm` (LangChain tools) → `packages/sdk` (ObiKit facade)
**Note:** ABI files are marked `AUTO-GENERATED — do not edit manually / Run "pnpm sync:abis"`. However, there is no `sync:abis` script in `packages/core/package.json`. The header is aspirational — ABIs are currently hand-maintained. Add manually following the same pattern as `swap-router.ts`.

### File Map

| File | Action |
|---|---|
| `packages/core/src/abis/liquidity-pair.ts` | Create — `LIQUIDITY_PAIR_ABI` |
| `packages/core/src/abis/index.ts` | Modify — add export |
| `packages/core/src/addresses.ts` | Modify — add LP addresses to `POLKADOT_HUB_TESTNET_CONTRACTS` |
| `packages/llm/src/tools/lp-pool-state.ts` | Create — `LpPoolStateTool` LangChain tool |
| `packages/llm/src/tools/index.ts` | Modify — export `LpPoolStateTool` |

---

### Task B1: Add `LIQUIDITY_PAIR_ABI` + addresses

**Files:**
- Create: `packages/core/src/abis/liquidity-pair.ts`
- Modify: `packages/core/src/abis/index.ts`
- Modify: `packages/core/src/addresses.ts`

- [ ] **Step 1: Create `liquidity-pair.ts`**

Follow the style of `packages/core/src/abis/swap-router.ts` (comment header, named export):

```typescript
// Source: obi.router/src/periphery/LiquidityPair.sol
// Synced: 2026-03-20
//
// LiquidityPair — UniswapV2-compatible LP pair with ERC-20 LP tokens.
// Constructor pattern (no factory). Protocol fee disabled on testnet.

export const LIQUIDITY_PAIR_ABI = [
  {
    type: 'event',
    name: 'Mint',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address', indexed: true },
      { name: 'amount0', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'amount1', type: 'uint256', internalType: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Burn',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address', indexed: true },
      { name: 'amount0', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'amount1', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'to', type: 'address', internalType: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { name: 'sender', type: 'address', internalType: 'address', indexed: true },
      { name: 'amount0In', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'amount1In', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'amount0Out', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'amount1Out', type: 'uint256', internalType: 'uint256', indexed: false },
      { name: 'to', type: 'address', internalType: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Sync',
    inputs: [
      { name: 'reserve0', type: 'uint112', internalType: 'uint112', indexed: false },
      { name: 'reserve1', type: 'uint112', internalType: 'uint112', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'token0',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'token1',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [
      { name: '_reserve0', type: 'uint112', internalType: 'uint112' },
      { name: '_reserve1', type: 'uint112', internalType: 'uint112' },
      { name: '_blockTimestampLast', type: 'uint32', internalType: 'uint32' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
```

- [ ] **Step 2: Export from `abis/index.ts`**

Add after the existing exports:

```typescript
export { LIQUIDITY_PAIR_ABI } from './liquidity-pair.js';
```

- [ ] **Step 3: Add LP addresses to `addresses.ts`**

Append to `POLKADOT_HUB_TESTNET_CONTRACTS` (after `crossChainRouterAddress`):

```typescript
  // ── SP-1 Liquidity Provision (2026-03-20) ─────────────────────────────────
  /** LiquidityPair tDOT/TKB */
  lpPairDotTkb:  '0xDc1b4a27d44613aa5072Ca6edC20151D94e7f93A',
  /** LiquidityPair tDOT/tUSDC */
  lpPairDotUsdc: '0x9576F7b40bC3a8Bb5d236Cd4bEBC29dC40AF0fa4',
  /** LiquidityPair tDOT/tETH */
  lpPairDotEth:  '0x4a0183BA79Ab7072240B5Fd8B6A1055E8e60aC83',
  /** LiquidityPair tUSDC/tETH */
  lpPairUsdcEth: '0x3FBa4A4db176201d3A3a5B25e7561274ceCb6ef5',
  /** LiquidityPair TKB/TKA */
  lpPairTkbTka:  '0xd6F5C4b7b3911Db7D062D0457f8b3D4045C86d50',
```

- [ ] **Step 4: Typecheck + build**

```bash
cd ~/dev/github.com/obidot/obi-kit
pnpm --filter @obidot-kit/core typecheck
pnpm --filter @obidot-kit/core build
```

Expected: 0 errors, dist/ rebuilt.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/abis/liquidity-pair.ts packages/core/src/abis/index.ts packages/core/src/addresses.ts
git commit -m "feat(core): add LIQUIDITY_PAIR_ABI + LP pair addresses (SP-1)"
```

---

### Task B2: Create `LpPoolStateTool` LangChain tool

**Files:**
- Create: `packages/llm/src/tools/lp-pool-state.ts`
- Modify: `packages/llm/src/tools/index.ts`

The tool reads on-chain reserves for a given LP pair address via viem `multicall`. It returns human-readable token symbols, reserve amounts (formatted), and estimated pool price ratio.

Follow the style of `packages/llm/src/tools/swap-quote.ts` (constructor options pattern, viem reads, string-based output).

- [ ] **Step 1: Read `swap-quote.ts` for style reference**

Read `packages/llm/src/tools/swap-quote.ts` lines 1–60 to understand the options interface, constructor, and `_call` shape.

- [ ] **Step 2: Create `lp-pool-state.ts`**

```typescript
import { Tool } from '@langchain/core/tools';
import { createPublicClient, http } from 'viem';
import type { ObiEvmContext } from '@obidot-kit/core';
import { LIQUIDITY_PAIR_ABI } from '@obidot-kit/core';
import { POLKADOT_HUB_TESTNET_CONTRACTS } from '@obidot-kit/core';

/** Known LP pair label → address mapping (SP-1 deployment). */
const LP_PAIRS: Record<string, `0x${string}`> = {
  'tDOT/TKB':   POLKADOT_HUB_TESTNET_CONTRACTS.lpPairDotTkb,
  'tDOT/tUSDC': POLKADOT_HUB_TESTNET_CONTRACTS.lpPairDotUsdc,
  'tDOT/tETH':  POLKADOT_HUB_TESTNET_CONTRACTS.lpPairDotEth,
  'tUSDC/tETH': POLKADOT_HUB_TESTNET_CONTRACTS.lpPairUsdcEth,
  'TKB/TKA':    POLKADOT_HUB_TESTNET_CONTRACTS.lpPairTkbTka,
};

export interface LpPoolStateToolOptions {
  evmContext?: ObiEvmContext;
}

/**
 * LangChain tool for reading UniswapV2 LP pair reserve state on-chain.
 *
 * Input: pair label ("tDOT/TKB") or raw pair address ("0x...")
 * Output: JSON with token0, token1, reserve0, reserve1, totalSupply, priceRatio
 */
export class LpPoolStateTool extends Tool {
  name = 'lp_pool_state';
  description =
    'Read current reserves and price ratio for a UniswapV2 LP pair. ' +
    'Input: pair label (e.g. "tDOT/TKB") or pair address (0x...). ' +
    'Available pairs: ' + Object.keys(LP_PAIRS).join(', ');

  private evmContext?: ObiEvmContext;

  constructor(options: LpPoolStateToolOptions = {}) {
    super();
    this.evmContext = options.evmContext;
  }

  protected async _call(input: string): Promise<string> {
    try {
      const trimmed = input.trim();
      const pairAddress: `0x${string}` =
        trimmed.startsWith('0x')
          ? (trimmed as `0x${string}`)
          : (LP_PAIRS[trimmed] ?? (() => { throw new Error(`Unknown pair: ${trimmed}`); })());

      const client = this.evmContext?.publicClient ?? createPublicClient({
        transport: http('https://eth-rpc-testnet.polkadot.io/'),
      });

      const [token0, token1, reserves, totalSupply] = await Promise.all([
        client.readContract({ address: pairAddress, abi: LIQUIDITY_PAIR_ABI, functionName: 'token0' }),
        client.readContract({ address: pairAddress, abi: LIQUIDITY_PAIR_ABI, functionName: 'token1' }),
        client.readContract({ address: pairAddress, abi: LIQUIDITY_PAIR_ABI, functionName: 'getReserves' }),
        client.readContract({ address: pairAddress, abi: LIQUIDITY_PAIR_ABI, functionName: 'totalSupply' }),
      ]);

      const [reserve0, reserve1] = reserves as [bigint, bigint, number];

      const priceRatio =
        reserve0 === 0n ? '0' : (Number(reserve1) / Number(reserve0)).toFixed(6);

      return JSON.stringify({
        pair: pairAddress,
        token0,
        token1,
        reserve0: String(reserve0),
        reserve1: String(reserve1),
        totalSupply: String(totalSupply),
        priceRatio,
      });
    } catch (err) {
      return `Error reading LP pool state: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
```

- [ ] **Step 3: Export from `tools/index.ts`**

Add:

```typescript
export { LpPoolStateTool } from './lp-pool-state.js';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @obidot-kit/llm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Build both packages**

```bash
pnpm --filter @obidot-kit/core build
pnpm --filter @obidot-kit/llm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/llm/src/tools/lp-pool-state.ts packages/llm/src/tools/index.ts
git commit -m "feat(llm): add LpPoolStateTool — reads UV2 pair reserves on-chain"
```

---

## Final Verification

After all tasks complete, confirm the following across repos:

### obi.index
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm build` — succeeds
- [ ] `npx prisma studio` or direct DB query confirms `lp_mints`, `lp_burns`, `lp_syncs`, `lp_pool_state` tables exist
- [ ] GraphQL query `{ lpPools { pair reserve0 reserve1 } }` returns data after indexer has run

### obi-kit
- [ ] `pnpm --filter @obidot-kit/core typecheck` — 0 errors
- [ ] `pnpm --filter @obidot-kit/core build` — 0 errors
- [ ] `pnpm --filter @obidot-kit/llm typecheck` — 0 errors
- [ ] `LIQUIDITY_PAIR_ABI` and `LpPoolStateTool` are importable from `@obidot-kit/core` and `@obidot-kit/llm`

---

## Out of Scope (follow-up work)

The following are future iterations, not part of this plan:

- **obi-kit `AddLiquidityTool` / `RemoveLiquidityTool`** — agent-driven LP management via `LiquidityRouter.addLiquidity()`/`removeLiquidity()`. Requires wallet signing context. Defer to SP-2.
- **`LpPoolState.token0/token1` population** — On first Mint, read `token0()` and `token1()` from chain and upsert into `LpPoolState`. Can be added as a post-Mint hook in the handler.
- **LP TVL aggregation in obi.index** — Add a computed `tvl` field to `LpPoolState` by reading oracle prices per token. Needs oracle price reads at index time.
- **obidot agent integration** — Wire `LpPoolStateTool` into the agent's tool registry in `modules/agent/src/agent/tools.ts`. After obi-kit is published/rebuilt.
