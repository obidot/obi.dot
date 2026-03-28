# Obidot Master Extension — Architecture & Design Spec

**Date:** 2026-03-27
**Plan:** `docs/superpowers/plans/2026-03-27-master-extension-plan.md`
**Status:** Draft

---

## Current Architecture (Baseline)

```
Browser (Next.js 15)
    ├── wagmi + RainbowKit → Polkadot Hub EVM (chain 420420417)
    ├── /api/* → Agent (Fastify, port 3001)
    └── GraphQL WS → obi.index (Apollo, port 4350)

Agent (Fastify)
    ├── SwapRouterService → SwapQuoter contract (eth_call)
    ├── YieldService → Bifrost/Hydration (stubbed)
    ├── AutonomousLoop → LLM → EIP-712 sign → ObidotVault.executeIntent()
    └── /api/chat (read-only)

obi.index
    ├── Blockscout REST → Decoder → Handlers → PostgreSQL (Prisma)
    ├── Apollo GraphQL (port 4350)
    └── Agent Orchestrator (5min loop)

obi.router (Polkadot Hub EVM)
    ├── SwapRouter (9 adapter slots)
    │   ├── [0] HydrationOmnipoolAdapter (XCM → para 2034) — testnet broken
    │   ├── [1] AssetHubPairAdapter (XCM → para 1000) — testnet broken
    │   ├── [2] BifrostDEXAdapter (XCM → para 2030) — testnet broken
    │   ├── [3] UniswapV2PoolAdapter — WORKING ✅
    │   ├── [4] RelayTeleportAdapter — WORKING (relay teleport) ✅
    │   ├── [5] KaruraAdapter — mainnet only
    │   ├── [6] MoonbeamAdapter — mainnet only
    │   ├── [7] InterlayAdapter — mainnet only
    │   └── [8] empty
    ├── ObidotVault (ERC-4626 + EIP-712 intents)
    ├── SwapQuoter (read-only route quoter)
    ├── XCMExecutor (native Polkadot XCM dispatch)
    └── HyperExecutor (Hyperbridge ISMP)

obi-kit (local packages, not published)
    ├── @obidot-kit/core — ABIs, types, chain config
    ├── @obidot-kit/llm — 19 LangChain tools
    ├── @obidot-kit/sdk — ObiKit facade class
    └── @obidot-kit/cli — obi-kit init/run/info
```

---

## Target Architecture (Post-Extension)

```
Browser (Next.js 15)
    ├── wagmi + RainbowKit → Polkadot Hub (testnet + mainnet)
    ├── /api/* → Agent (Fastify, port 3001)
    │   └── POST /api/chat → streaming LLM response + proposed intent
    ├── GraphQL WS → obi.index
    └── CrossChainStatusPanel → Hyperbridge explorer API

Agent (Fastify)
    ├── SwapRouterService → dynamic adapter enumeration
    ├── Multi-hop path builder → graph search (BFS on LP pairs)
    ├── Interactive chat → streaming SSE + user-approved execution
    ├── Limit order monitor → check pending orders vs oracle price
    └── AutonomousLoop (enhanced) → arbitrage + yield rebalance

obi.index
    ├── Blockscout REST (15s interval, retry logic)
    ├── ISMP event handlers (CrossChainDispatch lifecycle)
    ├── Analytics aggregations (volume24h, fees, priceHistory)
    └── Apollo GraphQL (enhanced with analytics queries)

obi.router (Polkadot Hub EVM)
    ├── SwapRouter (10 adapter slots)
    │   ├── [0] HydrationOmnipoolAdapter (simulation mode + mainnet XCM) ✅
    │   ├── [1] AssetHubPairAdapter (fixed SCALE encoding) ✅
    │   ├── [2] BifrostDEXAdapter (simulation mode + mainnet XCM) ✅
    │   ├── [3] UniswapV2PoolAdapter — WORKING ✅
    │   ├── [4] RelayTeleportAdapter — WORKING ✅
    │   ├── [5] KaruraAdapter — mainnet
    │   ├── [6] MoonbeamAdapter — mainnet
    │   ├── [7] InterlayAdapter — mainnet
    │   ├── [8] UniswapV3PoolAdapter — NEW ✅ (concentrated liquidity)
    │   └── [9] ChainflipAdapter — stub (coming soon)
    ├── LimitOrderBook.sol — NEW (Phase 4+)
    └── (all existing contracts unchanged)

obi-kit (npm published ✅)
    ├── @obidot-kit/core@1.0.0
    ├── @obidot-kit/llm@1.0.0 (23+ tools)
    ├── @obidot-kit/sdk@1.0.0
    └── @obidot-kit/cli@1.0.0
        └── templates: dca-bot, arbitrage-bot, yield-optimizer
```

---

## Key Design Decisions

### D1: Route Status Model

All routes carry a `status` field. The app MUST display this honestly.

```typescript
type RouteStatus =
  | "live"           // executable now on current network
  | "simulated"      // oracle-backed estimate, shown clearly labelled
  | "mainnet_only"   // works on mainnet, not testnet
  | "coming_soon"    // adapter deployed but pair/chain not available yet
  | "no_liquidity"   // pair exists, zero reserves

// Route display rules:
// live → green badge, Execute button enabled
// simulated → grey badge, "Estimated — Mainnet Required" tooltip, Execute disabled
// mainnet_only → grey badge, show estimated output (oracle price), Execute disabled
// coming_soon → grey badge, no amount shown
// no_liquidity → orange badge, Execute disabled
```

**Why:** Grant reviewers and real users must understand what's real. Silent failures erode trust. Honest simulation is better than misleading "live" labels on broken routes.

---

### D2: Dynamic Adapter Enumeration

**Problem:** Current `findRoutes()` uses hardcoded pair arrays. Adding a new adapter requires code changes in agent.

**Solution:** Read `SwapRouter.getPoolAdapter(i)` for i=0..N−1 at startup. Cache result. Re-fetch every 5 minutes.

```typescript
// In SwapRouterService:
async function loadAdapters(): Promise<AdapterInfo[]> {
  const adapters: AdapterInfo[] = [];
  for (let i = 0; i < 10; i++) {
    const addr = await publicClient.readContract({
      address: SWAP_ROUTER,
      abi: SWAP_ROUTER_ABI,
      functionName: 'getPoolAdapter',
      args: [i],
    });
    if (addr === zeroAddress) break;
    adapters.push({ slot: i, address: addr });
  }
  return adapters;
}
```

**Why:** New adapters become available automatically without code deploy.

---

### D3: Multi-Hop Path Building (BFS Graph)

**Problem:** Current path building is hardcoded. Doesn't scale with new pairs.

**Solution:** Build a graph from UV2 pair reserves and do BFS to find all paths up to depth 3.

```typescript
// Build adjacency graph from LP_PAIRS
function buildTokenGraph(pairs: LpPairMeta[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const pair of pairs) {
    const { token0, token1 } = pair;
    graph.set(token0, [...(graph.get(token0) ?? []), token1]);
    graph.set(token1, [...(graph.get(token1) ?? []), token0]);
  }
  return graph;
}

// BFS to find all paths tokenIn → tokenOut up to maxHops
function findAllPaths(
  graph: Map<string, string[]>,
  tokenIn: string,
  tokenOut: string,
  maxHops = 3,
): string[][] {
  // Standard BFS returning all paths
}
```

**Why:** Automatic discovery of routes as new pairs are added. No hardcoding.

---

### D4: Interactive Agent Chat (Non-Custodial)

**Constraint:** Agent MUST NOT auto-execute transactions from the browser chat. Users sign their own transactions.

**Flow:**
```
User types: "Swap 100 DOT to USDC with best route"
    ↓
POST /api/chat/message { content, address, chainId }
    ↓
Agent → LLM with tools → calls GetSwapRouteTool → GetQuoteTool
    ↓
Agent returns: proposed StrategyIntent (NOT yet signed)
    ↓
Browser shows: "I found this route: tDOT → tUSDC via UV2 @ rate X.
                Estimated: 95.2 USDC. Approve?"
    ↓
User clicks Approve → browser calls useWriteContract (user signs)
    ↓
Transaction submitted, agent stream updates with tx hash
```

**Implementation:**
- `POST /api/chat/message` → returns `text/event-stream`
- Events: `token` (LLM chunk), `tool_call` (tool being invoked), `proposal` (structured intent), `done`
- Frontend: uses `EventSource` to consume stream
- When `proposal` event arrives: show confirmation dialog

**Why:** Non-custodial. Agent can't drain user funds. Respects wallet ownership.

---

### D5: obi-kit Versioning Strategy

```
v0.x.y (current) — local development, local link
v1.0.0 — First npm release, stable API, Milestone 2 deliverable
v1.1.0 — Mainnet addresses, new tools (Milestone 3)
v2.0.0 — LimitOrderBook support, advanced strategies
```

**Breaking change policy:** Increment major version for any tool API changes. Additive tools increment minor.

---

### D6: Simulation Mode for XCM Adapters

Adapters that cannot execute on testnet MUST implement a `getAmountOutEstimated()` function:

```solidity
interface IPoolAdapterV2 is IPoolAdapter {
  /// @notice True if this adapter can execute real swaps on the current chain.
  function isLive() external view returns (bool);

  /// @notice Oracle-backed estimate when isLive() == false.
  /// Uses OracleRegistry price with spread factor applied.
  function getAmountOutEstimated(
    address pool,
    address tokenIn,
    address tokenOut,
    uint256 amountIn
  ) external view returns (uint256 estimatedOut);
}
```

**Adapter status table:**

| Adapter | testnet isLive | testnet estimate source | mainnet isLive |
|---------|---------------|------------------------|----------------|
| UniswapV2PoolAdapter | ✅ true | live reserves | ✅ true |
| UniswapV3PoolAdapter | ✅ true | live quoter | ✅ true |
| HydrationOmnipoolAdapter | ❌ false | oracle price × 0.997 | ✅ true |
| AssetHubPairAdapter | ⚠️ TBD | oracle price × 0.997 | ✅ true |
| BifrostDEXAdapter | ❌ false | oracle price × 0.997 | ✅ true |
| RelayTeleportAdapter | ✅ true | 1:1 (teleport) | ✅ true |
| KaruraAdapter | ❌ false | oracle price × 0.998 | ✅ true |
| MoonbeamAdapter | ❌ false | oracle price × 0.997 | ✅ true |
| InterlayAdapter | ❌ false | N/A (lending) | ✅ true |
| ChainflipAdapter | ❌ false | N/A (stub) | ⚠️ TBD |

---

## Component Designs

### A. `RouteStatusBadge` (modules/app)

```tsx
// src/components/ui/route-status-badge.tsx
interface RouteStatusBadgeProps {
  status: RouteStatus;
  tooltip?: string;
}

// Renders:
// live → green dot + "Live"
// simulated → grey dot + "Simulated" + info icon with tooltip
// mainnet_only → grey dot + "Mainnet"
// coming_soon → grey dot + "Coming Soon"
// no_liquidity → orange dot + "No Liquidity"
```

---

### B. `CrossChainStatusPanel` (modules/app)

```tsx
// src/components/swap/cross-chain-status-panel.tsx
// Shows pending/recent cross-chain intents for connected wallet
// Data source: obi.index GraphQL subscription

interface CrossChainDispatchDisplay {
  id: string;
  destination: string;    // "Hydration" | "Bifrost" | etc.
  tokenIn: string;
  amountIn: string;
  status: "pending" | "relayed" | "executed" | "failed";
  txHash: string;
  blockscoutUrl: string;
  hyperbridgeUrl?: string; // For ISMP messages
  timestamp: number;
}
```

---

### C. `PriceImpactWarning` (modules/app)

```tsx
// src/components/swap/price-impact-warning.tsx
// impact in BPS (basis points)
// < 100 bps (1%) → no warning
// 100-300 bps → amber warning "High price impact"
// > 300 bps → red warning "Very high price impact" + require checkbox
// > 500 bps → blocking error "Price impact too high — split your trade"
```

---

### D. Analytics GraphQL Schema additions (obi.index)

```graphql
# New queries
type ProtocolStats {
  volume24h: String!
  volume7d: String!
  feeRevenue24h: String!
  uniqueTraders24h: Int!
  tvl: String!
  topPairs: [PairStats!]!
}

type PairStats {
  pair: String!
  token0Symbol: String!
  token1Symbol: String!
  volume24h: String!
  feesEarned24h: String!
  liquidity: String!
}

type PricePoint {
  timestamp: Int!
  open: String!
  high: String!
  low: String!
  close: String!
  volume: String!
}

extend type Query {
  protocolStats: ProtocolStats!
  priceHistory(
    tokenIn: String!
    tokenOut: String!
    from: Int!
    to: Int!
    resolution: String!   # "1h" | "4h" | "1d"
  ): [PricePoint!]!
  topRoutes(limit: Int = 10): [RouteStats!]!
}
```

---

## Data Flow: Interactive Chat

```
POST /api/chat/message
{
  "content": "Swap 100 tDOT to tUSDC",
  "address": "0x...",
  "chainId": 420420417
}

→ Server-Sent Events stream:

data: {"type":"token","content":"Let me find"}
data: {"type":"token","content":" the best route"}
data: {"type":"tool_call","tool":"get_swap_routes","args":{"tokenIn":"tDOT","tokenOut":"tUSDC","amountIn":"100000000000000000000"}}
data: {"type":"tool_result","tool":"get_swap_routes","success":true}
data: {"type":"token","content":"I found 3 routes. Best: tDOT→tUSDC direct via UV2 @ 0.9524 USDC/DOT"}
data: {"type":"proposal","intent":{"tokenIn":"0x...","tokenOut":"0x...","amountIn":"100000000000000000000","minAmountOut":"93000000","route":[...],"deadline":1743100000}}
data: {"type":"done"}
```

---

## File Change Summary (All Repos)

### obi.router/
| File | Change |
|------|--------|
| `src/adapters/HydrationOmnipoolAdapter.sol` | Add `isLive()`, `getAmountOutEstimated()`, simulation mode |
| `src/adapters/AssetHubPairAdapter.sol` | Fix SCALE encoding, add simulation fallback |
| `src/adapters/BifrostDEXAdapter.sol` | Add simulation mode |
| `src/adapters/UniswapV3PoolAdapter.sol` | NEW — V3 concentrated liquidity adapter |
| `src/adapters/ChainflipAdapter.sol` | NEW — stub, coming soon |
| `src/router/IPoolAdapter.sol` | Extend to `IPoolAdapterV2` with simulation interface |
| `src/LimitOrderBook.sol` | NEW — on-chain limit orders (Phase 4+) |
| `script/deploy/DeployMainnet.s.sol` | NEW — mainnet deployment script |
| `script/deploy/DeployMorePairs.s.sol` | NEW — deploy 3 more UV2 pairs |
| `test/UniswapV3PoolAdapter.t.sol` | NEW |
| `test/SimulationMode.t.sol` | NEW |

### obidot/modules/app/
| File | Change |
|------|--------|
| `src/components/ui/route-status-badge.tsx` | NEW |
| `src/components/ui/price-impact-warning.tsx` | NEW |
| `src/components/swap/cross-chain-status-panel.tsx` | NEW |
| `src/components/swap/quote-display.tsx` | Add price impact, min received |
| `src/components/swap/swap-form.tsx` | Wire PriceImpactWarning, CrossChainStatus |
| `src/components/swap/route-diagram.tsx` | Show per-hop status badges |
| `src/lib/constants.ts` | Add new pair addresses, mainnet addresses |
| `src/lib/chains.ts` | Add mainnet chain |
| `src/lib/graphql.ts` | Add analytics query functions |
| `src/hooks/use-swap.ts` | Reduce stale time, add auto-refresh |
| `src/app/agent/page.tsx` | Interactive chat with streaming |

### obidot/modules/agent/
| File | Change |
|------|--------|
| `src/api/routes/swap.ts` | Dynamic adapter enumeration, BFS path building |
| `src/api/routes/chat.ts` | NEW — streaming SSE chat with tool calls |
| `src/services/swap-router.service.ts` | Dynamic adapters, simulation mode detection |
| `src/agent/tools.ts` | Add 4 new tools |
| `src/agent/systemPrompt.ts` | Update with new routes, simulation awareness |

### obi.index/
| File | Change |
|------|--------|
| `src/sync/handlers/crosschain.ts` | Add ISMP lifecycle event tracking |
| `src/graphql/typeDefs.ts` | Add analytics types |
| `src/graphql/resolvers.ts` | Add analytics resolvers |
| `src/sync/poller.ts` | Reduce to 15s interval, add retry |
| `prisma/schema.prisma` | Add PriceHistory model, analytics views |

### obi-kit/
| File | Change |
|------|--------|
| `packages/llm/src/tools/` | Add 4 new tools |
| `packages/core/src/addresses.ts` | Add new pair + mainnet addresses |
| `packages/cli/src/templates/` | Add 3 bot templates |
| `.github/workflows/publish.yml` | NEW — npm publish workflow |
| All packages | Version bump to 1.0.0 |
