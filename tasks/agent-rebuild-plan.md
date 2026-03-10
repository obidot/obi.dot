# Agent Module Rebuild Plan — `modules/agent/`

> **Repo:** `obidot/obidot` → `modules/agent/` (`@obidot/agent`)
> **Status:** Working but has duplicate tools, stale config, placeholder data, and missing integrations
> **Goal:** Migrate to obi-kit SDK tools, wire real data, close all placeholder gaps, add persistence and deployment artifacts

---

## Current State Summary

| Area | Status |
|---|---|
| Autonomous loop (4 phases) | Working — `src/agent/loop.ts:32` |
| 6 custom LangChain tools | Working but **duplicate** what obi-kit already provides |
| ObiKit integration | Shallow — uses `addTool()` only, ignores ObiKit built-in tools |
| EIP-712 signing + on-chain tx | Working — `src/services/signer.service.ts:292` |
| Fastify API (port 3001) | Working but **port mismatch** — app expects 3011 |
| Telegram bot | Working |
| APY data | **Simulated** (sine-wave) — `src/services/yield.service.ts` |
| Cross-chain rebalance | **Detected but not executed** — `src/agent/loop.ts:323-333` |
| BifrostAdapter address | **Zero address** — `config/constants.ts` |
| CrossChainRouter address | **Zero address** — `config/constants.ts` |
| Oracle integration | Working with real contracts but **individual txs** (not batched) |
| Strategy store | **In-memory** — lost on restart |
| `PLACEHOLDER_XCM_CALL` | **Hardcoded bytes** — `config/constants.ts` |
| WebSocket | Working but unused by app |

---

## Phase 1 — Configuration & Address Fix

**Priority:** Critical (unblocks everything)
**Files:** `src/config/constants.ts`, `src/config/env.ts`, `src/api/server.ts`, `.env.example`

### 1.1 Fix API Port

`src/api/server.ts:23` defaults to `3001`. `modules/app/.env.example` and `next.config.ts` rewrite to `3011`. Fix the agent default to match.

```
File: src/api/server.ts
Line 23: const API_PORT = Number(process.env["API_PORT"] ?? "3001");
Change to:                                                 "3011"
```

Update `.env.example` to include `API_PORT=3011`.

### 1.2 Wire Deployed Addresses

`src/config/constants.ts` has `BIFROST_ADAPTER_ADDRESS` and `CROSS_CHAIN_ROUTER_ADDRESS` that default to zero address. Wire the real deployed addresses from `obi.router/docs/addresses.md` (Phase 1 + Phase 2).

| Constant | Value |
|---|---|
| `BIFROST_ADAPTER_ADDRESS` | `0x265Cb785De0fF2e5BcebDEb53095aDCAE9175527` |
| `CROSS_CHAIN_ROUTER_ADDRESS` | `0xE65D7B65a1972A82bCF65f6711a43355Faa3f490` |
| `XCM_EXECUTOR_ADDRESS` (new) | `0xE8FDc9093395eA02017d5D66899F3E04CFF1CF64` |
| `HYPER_EXECUTOR_ADDRESS` (new) | `0xaEC0009B15449102a39204259d07c2517cf8fC0f` |
| `ORACLE_REGISTRY_ADDRESS` (new) | `0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B` |
| `KEEPER_ORACLE_ADDRESS` (already in env) | `0xf64d93DC125AC1B366532BBbA165615f6D566C7F` |

These should be configurable via env vars (with deployed testnet addresses as defaults).

### 1.3 Remove `PLACEHOLDER_XCM_CALL`

`src/config/constants.ts` exports a `PLACEHOLDER_XCM_CALL` (hardcoded hex bytes) used in `ExecuteStrategyTool` at `tools.ts:345`. The on-chain vault contract handles XCM encoding via `XCMExecutor` — the agent only needs to pass `amount`, `targetParachain`, `targetProtocol`, and the contracts build the actual XCM message.

- Replace `PLACEHOLDER_XCM_CALL` with `"0x"` (empty bytes)
- Add a comment explaining the contracts handle XCM encoding
- Update `ExecuteStrategyTool._call()` at `tools.ts:345` to use `"0x"` instead

### 1.4 Add Missing Env Vars to `.env.example`

```env
# ── API Server ────────────────────────────────────────────────────────
API_PORT=3011
API_HOST=0.0.0.0

# ── Phase 2 Contracts ────────────────────────────────────────────────
XCM_EXECUTOR_ADDRESS=0xE8FDc9093395eA02017d5D66899F3E04CFF1CF64
HYPER_EXECUTOR_ADDRESS=0xaEC0009B15449102a39204259d07c2517cf8fC0f

# ── Data Persistence ─────────────────────────────────────────────────
DATA_DIR=./data
```

---

## Phase 2 — Migrate Tools to obi-kit

**Priority:** High
**Files:** `src/agent/tools.ts`, `src/agent/loop.ts`, `src/main.ts`

### 2.1 Current Tool Duplication

The agent defines 6 custom tools in `tools.ts` that overlap with obi-kit's 10 tools:

| Agent tool (`tools.ts`) | obi-kit replacement (`@obidot-kit/llm`) | Action |
|---|---|---|
| `FetchYieldsTool` | None — DeFiLlama + simulated APY | **Keep** (unique to agent) |
| `FetchBifrostYieldsTool` | `BifrostYieldTool` | **Replace** |
| `FetchVaultStateTool` | `PerformanceTool` + `OracleCheckTool` | **Replace** — obi-kit version covers P&L, fees, daily loss |
| `FetchCrossChainStateTool` | `CrossChainStateTool` | **Replace** |
| `ExecuteStrategyTool` | `BatchStrategyTool` | **Keep** — agent version has custom EIP-712 signing flow |
| `ExecuteBifrostStrategyTool` | `BifrostStrategyTool` | **Replace** (when obi-kit gets real viem service) |

### 2.2 Refactor `AutonomousLoop` Constructor (`loop.ts:63-112`)

Current flow at `loop.ts:63`:
```
constructor()
  → new SignerService()
  → new YieldService()
  → new CrossChainService()
  → new ObiKit({ chainConfig })
  → kit.registerVault(vaultConfig)
  → createObidotTools(signerService, yieldService, crossChainService)
  → for (tool of customTools) kit.addTool(tool)
  → this.tools = kit.getTools()
```

New flow:
```
constructor()
  → new SignerService()
  → new YieldService()
  → new CrossChainService()
  → new ObiKit({
      chainConfig,
      evmVaultConfig: {  // enables ObiKit EVM mode
        vaultAddress: VAULT_ADDRESS,
        chainId: CHAIN_ID,
        rpcUrl: RPC_URL,
      },
      bifrostConfig: {
        adapterAddress: BIFROST_ADAPTER_ADDRESS,
        paraId: 2030,
      },
      satellites: env.ETH_SATELLITE_VAULT ? [{ ... }] : [],
    })
  → Keep only: FetchYieldsTool, ExecuteStrategyTool (custom EIP-712)
  → kit.addTool(fetchYieldsTool)
  → kit.addTool(executeStrategyTool)
  → this.tools = kit.getTools()
```

This gives the agent 10 obi-kit tools + 2 custom tools = 12 tools total:
- `vault_deposit`, `vault_withdraw` (obi-kit)
- `withdrawal_queue`, `vault_performance`, `oracle_check` (obi-kit)
- `fetch_bifrost_yields`, `execute_bifrost_strategy` (obi-kit)
- `fetch_cross_chain_state`, `execute_cross_chain_rebalance` (obi-kit)
- `execute_batch_strategies` (obi-kit)
- `fetch_yields` (custom — DeFiLlama)
- `execute_strategy` (custom — agent EIP-712 signing)

### 2.3 Reduce `tools.ts` to 2 Classes

Delete `FetchBifrostYieldsTool`, `FetchVaultStateTool`, `FetchCrossChainStateTool`, `ExecuteBifrostStrategyTool` from `tools.ts`. Keep:

1. `FetchYieldsTool` — wraps `YieldService.fetchYields()` (DeFiLlama + simulated data)
2. `ExecuteStrategyTool` — unique EIP-712 signing flow using agent's private key

Rename `createObidotTools()` to `createAgentTools()` and return only these 2.

### 2.4 Update System Prompt (`systemPrompt.ts`)

Update the tools listing in the system prompt to reflect the full 12-tool set. Add descriptions of the new obi-kit tools the agent now has access to:
- `vault_deposit` / `vault_withdraw` — for direct vault operations
- `withdrawal_queue` — manage withdrawal requests
- `vault_performance` — P&L, per-protocol performance, fee accrual
- `oracle_check` — oracle freshness, staleness warnings, daily loss check
- `execute_batch_strategies` — submit multiple strategies atomically
- `execute_cross_chain_rebalance` — hub↔satellite rebalance via ISMP

---

## Phase 3 — Real APY Data

**Priority:** High
**Files:** `src/services/yield.service.ts`

### 3.1 Current Implementation

`yield.service.ts` has:
- `fetchYields()` → DeFiLlama TVL fetch (real) + sine-wave APY simulation (fake)
- `fetchBifrostYields()` → Hardcoded catalogue with simulated APYs

### 3.2 Real Data Sources

Add real APY fetchers (each with fallback to simulated if the API fails):

| Protocol | Data Source | Endpoint |
|---|---|---|
| Bifrost vDOT/vKSM | Bifrost API | `https://api.bifrost.app/api/site` (`vtoken_list[].apy`) |
| Bifrost Farming | Bifrost API | `https://api.bifrost.app/api/dex/farming` |
| Hydration Omnipool | Hydration API | `https://api.hydradx.io/pools/apy` |
| DOT staking | Subscan | `https://polkadot.api.subscan.io/api/scan/staking/validator/averageapy` |

### 3.3 Implementation

```
src/services/yield.service.ts
  ├── fetchBifrostApys(): Promise<BifrostApyData[]>   // NEW — real Bifrost API
  ├── fetchHydrationApys(): Promise<HydrationApyData[]> // NEW — real Hydration API
  ├── fetchYields(): Promise<ProtocolYield[]>          // UPDATE — use real data
  ├── fetchBifrostYields(): Promise<BifrostYield[]>    // UPDATE — use real data
  └── private simulateApy(baseApy, seed): number       // KEEP — fallback
```

Add:
- `YIELD_CACHE_TTL_MS` (default 300_000 = 5 min) — configurable cache duration
- `YIELD_FETCH_TIMEOUT_MS` (default 10_000) — per-source timeout
- `BIFROST_API_URL` env var (default `https://api.bifrost.app`)
- `HYDRATION_API_URL` env var (default `https://api.hydradx.io`)

### 3.4 Graceful Degradation

Each fetcher catches errors and falls back to simulated data with a warning log. The agent never fails a cycle because an external API is down.

---

## Phase 4 — Cross-Chain Rebalance Execution

**Priority:** Medium
**Files:** `src/agent/loop.ts`, `src/services/signer.service.ts`

### 4.1 Current Gap

`loop.ts:322-333` — when the LLM decides `CROSS_CHAIN_REBALANCE`, the agent logs it and returns without executing:

```typescript
case "CROSS_CHAIN_REBALANCE":
  loopLog.info({ ... }, "CROSS_CHAIN_REBALANCE detected — logging for manual execution");
  return;
```

### 4.2 Implementation

With Phase 2 complete, the agent has `execute_cross_chain_rebalance` from obi-kit in its tool set. Update the switch-case in `loop.ts:314-342`:

```typescript
case "CROSS_CHAIN_REBALANCE":
  toolName = "execute_cross_chain_rebalance";
  break;
```

This delegates to `CrossChainRebalanceTool` from obi-kit, which calls `CrossChainRouter.broadcastAssetSync()` via viem.

### 4.3 Add `executeCrossChainRebalance` to `SignerService`

For the case where the agent needs direct on-chain access (not through obi-kit tools):

```typescript
// signer.service.ts — new method
async executeCrossChainRebalance(
  targetChainId: bigint,
  amount: bigint,
  direction: "TO_SATELLITE" | "FROM_SATELLITE",
): Promise<Hex>
```

Calls `CrossChainRouter.requestCrossChainDeposit()` or `requestCrossChainWithdraw()` depending on direction.

### 4.4 Safety Guardrails

- Check `crossChainService.isRouterActive()` before executing
- Check `crossChainService.getStaleSatellites()` — refuse to rebalance to stale satellites
- Enforce `MAX_STRATEGY_AMOUNT` cap on rebalance amounts
- Log the decision + tx hash to `StrategyStore`

---

## Phase 5 — Oracle Improvements

**Priority:** Medium
**Files:** `src/services/oracle.service.ts`, `src/services/price-aggregator.service.ts`

### 5.1 Batch Price Updates

`oracle.service.ts` `updatePrices()` currently sends individual transactions for each feed. Use `multicall`:

```typescript
// Instead of N separate walletClient.writeContract() calls:
const calls = feeds.map((feed) => ({
  address: feed.oracleAddress,
  abi: KEEPER_ORACLE_ABI,
  functionName: "updatePrice",
  args: [feed.price],
}));

// Batch via multicall3 (deployed at standard address on EVM chains)
await walletClient.writeContract({
  address: MULTICALL3_ADDRESS,
  abi: MULTICALL3_ABI,
  functionName: "aggregate3",
  args: [calls],
});
```

Fallback: if multicall fails (e.g., Polkadot Hub doesn't have multicall3), fall back to sequential individual calls.

### 5.2 OracleRegistry Multi-Feed Routing

`oracle.service.ts` uses a single oracle for all assets. Add routing via `OracleRegistry`:

```typescript
async resolveOracleAddress(asset: Address): Promise<Address> {
  // Try OracleRegistry first
  if (this.oracleRegistryAddress) {
    const hasFeed = await this.publicClient.readContract({
      address: this.oracleRegistryAddress,
      abi: ORACLE_REGISTRY_ABI,
      functionName: "hasFeed",
      args: [asset],
    });
    if (hasFeed) {
      return this.oracleRegistryAddress; // Use registry for this asset
    }
  }
  // Fall back to default KeeperOracle
  return this.keeperOracleAddress;
}
```

### 5.3 Pre-Flight Oracle Check in Loop

Before executing any strategy in `loop.ts`, add an oracle freshness check:

```typescript
// After Phase 1: Perception, before Phase 2: Reasoning
const oracleStatus = await this.oracleService.checkHealth();
if (oracleStatus.isStale) {
  loopLog.warn("Oracle price is stale — attempting update before strategy execution");
  await this.oracleService.updatePrices();
}
```

---

## Phase 6 — Strategy Store Persistence

**Priority:** Medium
**Files:** `src/services/strategy-store.service.ts`

### 6.1 Current Implementation

`strategy-store.service.ts` stores strategies and decisions in memory arrays (max 500 strategies, 1000 decisions). All data is lost on restart.

### 6.2 File-Backed JSON Store

Replace the in-memory arrays with a file-backed store:

```typescript
// strategy-store.service.ts

const DATA_DIR = process.env["DATA_DIR"] ?? "./data";
const STRATEGIES_FILE = path.join(DATA_DIR, "strategies.json");
const DECISIONS_FILE = path.join(DATA_DIR, "decisions.json");

class StrategyStoreService {
  private strategies: StrategyRecord[] = [];
  private decisions: AgentDecision[] = [];

  /** Load from disk on construction. */
  constructor() {
    this.strategies = this.loadFile(STRATEGIES_FILE);
    this.decisions = this.loadFile(DECISIONS_FILE);
  }

  /** Persist after every mutation. */
  addStrategy(record: StrategyRecord): void {
    this.strategies.push(record);
    if (this.strategies.length > 1000) this.strategies.shift();
    this.saveFile(STRATEGIES_FILE, this.strategies);
  }

  addDecision(decision: AgentDecision): void {
    this.decisions.push(decision);
    if (this.decisions.length > 2000) this.decisions.shift();
    this.saveFile(DECISIONS_FILE, this.decisions);
  }

  // ... existing getAll(), getRecent(), getByStatus() stay the same
}
```

### 6.3 New API Endpoint: P&L History

Add `GET /api/vault/pnl-history` that returns time-series P&L data from the store:

```typescript
// routes/vault.ts — new route
app.get("/api/vault/pnl-history", async () => {
  const strategies = strategyStore.getAll();
  const pnlSeries = strategies
    .filter((s) => s.status === "executed" && s.returnedAmount !== undefined)
    .map((s) => ({
      timestamp: s.timestamp,
      pnl: Number(s.returnedAmount) - Number(s.amount),
      cumulativePnl: 0, // Computed below
    }));
  // Compute running cumulative
  let cumulative = 0;
  for (const point of pnlSeries) {
    cumulative += point.pnl;
    point.cumulativePnl = cumulative;
  }
  return { success: true, data: pnlSeries };
});
```

---

## Phase 7 — System Prompt Improvements

**Priority:** Medium
**Files:** `src/agent/systemPrompt.ts`

### 7.1 Add Deployed Addresses to Context

The LLM needs to know actual contract addresses to reference in reasoning:

```
Deployed Contracts (Polkadot Hub Testnet, Paseo, chain ID 420420417):
  ObidotVault:       0x37D7959f5f97D37799E0d04b7684c41CB2Ff878d
  KeeperOracle:      0xf64d93DC125AC1B366532BBbA165615f6D566C7F
  OracleRegistry:    0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B
  BifrostAdapter:    0x265Cb785De0fF2e5BcebDEb53095aDCAE9175527
  CrossChainRouter:  0xE65D7B65a1972A82bCF65f6711a43355Faa3f490
  XCMExecutor:       0xE8FDc9093395eA02017d5D66899F3E04CFF1CF64
  HyperExecutor:     0xaEC0009B15449102a39204259d07c2517cf8fC0f
```

### 7.2 Add `ORACLE_UPDATE` Action Type

Add a new discriminated union variant to `types/index.ts` and the system prompt:

```typescript
// types/index.ts — new variant in aiDecisionSchema
const oracleUpdateDecision = z.object({
  action: z.literal("ORACLE_UPDATE"),
  reasoning: z.string().min(1),
  assets: z.array(z.string()).min(1).describe("Asset addresses to refresh"),
});
```

Handle in `loop.ts` phase 3:
```typescript
case "ORACLE_UPDATE":
  await this.oracleService.updatePrices();
  return;
```

### 7.3 Add Remaining Daily Loss Budget

In `buildUserMessage()` at `loop.ts:392`, add:

```
  Remaining Daily Loss Budget: ${(maxDailyLoss - dailyLoss).toString()} wei
```

This gives the LLM explicit awareness of how much risk budget remains for the day.

### 7.4 Add Full Tool Descriptions

Update the system prompt to list all 12 tools with their exact names and input schemas, so the LLM knows how to invoke each one.

---

## Phase 8 — Docker & Deployment

**Priority:** Low
**Files:** New files

### 8.1 Agent Dockerfile

Create `modules/agent/Dockerfile`:

```dockerfile
FROM node:20-slim AS base
RUN corepack enable pnpm
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY modules/agent/package.json modules/agent/
RUN pnpm install --frozen-lockfile --filter @obidot/agent

# Build
COPY modules/agent/ modules/agent/
RUN pnpm --filter @obidot/agent run build

# Run
FROM node:20-slim
WORKDIR /app
COPY --from=base /app/modules/agent/dist ./dist
COPY --from=base /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
```

### 8.2 Docker Compose

Create `docker-compose.yml` at monorepo root:

```yaml
services:
  agent:
    build:
      context: .
      dockerfile: modules/agent/Dockerfile
    env_file: modules/agent/.env
    ports:
      - "3011:3011"
    volumes:
      - agent-data:/app/data
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: modules/app/Dockerfile
    env_file: modules/app/.env
    ports:
      - "3010:3010"
    depends_on:
      - agent
    restart: unless-stopped

volumes:
  agent-data:
```

### 8.3 App Dockerfile

Create `modules/app/Dockerfile`:

```dockerfile
FROM node:20-slim AS base
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY modules/app/package.json modules/app/
RUN pnpm install --frozen-lockfile --filter @obidot/app

COPY modules/app/ modules/app/
RUN pnpm --filter @obidot/app run build

FROM node:20-slim
WORKDIR /app
COPY --from=base /app/modules/app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/modules/app/package.json ./
CMD ["node", "node_modules/.bin/next", "start", "-p", "3010"]
```

---

## Phase 9 — Event Bus & WebSocket Enrichment

**Priority:** Low
**Files:** `src/services/event-bus.service.ts`, `src/agent/loop.ts`

### 9.1 Structured Event Types

Define typed event schemas for WebSocket broadcast:

```typescript
// event-bus.service.ts
type WsEvent =
  | { type: "CYCLE_START"; cycle: number; timestamp: number }
  | { type: "CYCLE_END"; cycle: number; elapsedMs: number; timestamp: number }
  | { type: "PERCEPTION"; yields: number; vaultState: VaultStateSummary; timestamp: number }
  | { type: "DECISION"; action: string; reasoning: string; timestamp: number }
  | { type: "EXECUTION"; action: string; txHash?: string; success: boolean; timestamp: number }
  | { type: "OUTCOME_VERIFIED"; strategyId: string; status: string; timestamp: number }
  | { type: "ORACLE_UPDATE"; asset: string; price: string; timestamp: number }
  | { type: "VAULT_STATE"; state: VaultStateSummary; timestamp: number };
```

### 9.2 Emit Events from Loop

Add `eventBus.emit()` calls at each phase transition in `loop.ts`:

- `runCycle()` start → `CYCLE_START`
- After perception → `PERCEPTION`
- After LLM decision → `DECISION`
- After execution → `EXECUTION`
- After outcome verification → `OUTCOME_VERIFIED`
- `runCycle()` end → `CYCLE_END`

This enables the dashboard to show real-time loop progression without polling.

---

## Verification Checklist

After all phases:

- [ ] `pnpm --filter @obidot/agent run typecheck` — 0 errors
- [ ] `pnpm --filter @obidot/agent run lint` — 0 issues
- [ ] `pnpm --filter @obidot/agent run build` — succeeds
- [ ] Agent starts with `pnpm agent:dev` on port 3011
- [ ] `curl localhost:3011/api/health` returns `{ status: "ok" }`
- [ ] `curl localhost:3011/api/vault/state` returns vault data
- [ ] `curl localhost:3011/api/yields` returns real APY data (or graceful fallback)
- [ ] `curl localhost:3011/api/yields/bifrost` returns Bifrost products
- [ ] WebSocket at `ws://localhost:3011/ws` receives events during cycle
- [ ] Telegram bot responds to messages (when token configured)
- [ ] `data/strategies.json` persists across restarts
- [ ] Docker build succeeds: `docker compose build agent`

---

## File Manifest

| File | Action | Phase |
|---|---|---|
| `src/config/constants.ts` | MODIFY — wire real addresses, remove PLACEHOLDER_XCM_CALL | 1 |
| `src/config/env.ts` | MODIFY — add new env vars (API_PORT default, DATA_DIR, API URLs) | 1 |
| `src/api/server.ts` | MODIFY — default port 3001→3011 | 1 |
| `.env.example` | MODIFY — add all new vars | 1 |
| `src/agent/tools.ts` | REWRITE — keep only FetchYieldsTool + ExecuteStrategyTool | 2 |
| `src/agent/loop.ts` | MODIFY — new ObiKit config, cross-chain exec, oracle check | 2, 4 |
| `src/agent/systemPrompt.ts` | MODIFY — new tools, addresses, ORACLE_UPDATE action | 7 |
| `src/services/yield.service.ts` | MODIFY — real Bifrost/Hydration API fetchers | 3 |
| `src/services/signer.service.ts` | MODIFY — add executeCrossChainRebalance() | 4 |
| `src/services/oracle.service.ts` | MODIFY — batch updates, registry routing, pre-flight check | 5 |
| `src/services/strategy-store.service.ts` | REWRITE — file-backed JSON persistence | 6 |
| `src/services/event-bus.service.ts` | MODIFY — typed events | 9 |
| `src/types/index.ts` | MODIFY — add ORACLE_UPDATE action variant | 7 |
| `src/api/routes/vault.ts` | MODIFY — add pnl-history endpoint | 6 |
| `Dockerfile` | CREATE | 8 |
| `../docker-compose.yml` | CREATE (monorepo root) | 8 |
| `../modules/app/Dockerfile` | CREATE | 8 |
