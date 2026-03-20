# Obidot MVP Design

**Date:** 2026-03-18
**Status:** Approved
**Goal:** Fix route and indexer data, add faucet, seed vault, wire agent — ship working public testnet MVP.

---

## 1. Problem Statement

The Obidot DEX aggregator is deployed on Polkadot Hub TestNet (chain ID 420420417) with all V2 pairs seeded and 9 pool adapters registered, but three critical misconfigurations prevent any data from flowing:

1. **Wrong vault address in obi.index** — the indexer monitors `0x4D327724C167ac4D66125a5DcC0724DDaCD63fF9` but the deployed vault is `0x03473a95971Ba0496786a615e21b1e87bDFf0025`. All vault events (deposits, withdrawals, strategies) are silently dropped.
2. **Stale SwapRouter in agent + obi-kit** — `0x0A85A1B0bb893cab3b5fad7312ac241e92C8Badf` (pre-Phase 17) vs deployed `0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c`. On-chain swap execution fails.
3. **tUSDC decimal mismatch** — deployed as 6 decimals (`TestToken("Test USDC", "tUSDC", 6)`) but agent and app treat it as 18 decimals. Route math produces amounts off by 10¹².

Additionally: the vault has no tokens, so the autonomous agent loop cannot execute any strategies.

---

## 2. Target Architecture (MVP)

```
User Browser (app :3010)
  │
  ├─ Wallet (wagmi/RainbowKit)─────────────────────► Polkadot Hub TestNet EVM
  │     ├─ swap via SwapRouter 0x60a72d1e...              │
  │     ├─ mint via tDOT/tUSDC/tETH.mint(to, amount)      │
  │     └─ deposit into Vault 0x03473a95...                │
  │                                                         │
  ├─ GET /api/routes → Agent (:3001)                       │
  │     └─ DFS on V2 pair graph → AMM math (getReserves)  │
  │                                                         │
  └─ GraphQL WS → obi.index (:4350)                       │
        ├─ Polls Blockscout every 60s ◄────────────────────┘
        ├─ Decodes SwapRouter.Swapped, Vault events
        ├─ Writes to Supabase (PostgreSQL)
        └─ Publishes real-time subscriptions to browser

Agent Autonomous Loop (:3001, every 5min)
  ├─ Reads vault state via viem eth_call
  ├─ Reads oracle prices
  ├─ LLM analyzes (Claude Sonnet / GPT-4o)
  └─ Signs EIP-712 intent → vault.executeIntent()
```

---

## 3. Deployed Contract Addresses (Phase 17, 2026-03-15)

| Contract | Address |
|---|---|
| ObidotVault | `0x03473a95971Ba0496786a615e21b1e87bDFf0025` |
| SwapRouter | `0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c` |
| SwapQuoter | `0x81d7aCFEF474DA6c76eC1b5A05a137cB9f3A5Db1` |
| KeeperOracle | `0xf64d93DC125AC1B366532BBbA165615f6D566C7F` |
| OracleRegistry | `0x8b7C7345d6cF9de45f4aacC61F56F0241d47e88B` |
| CrossChainRouter | `0xE2fFfb3B5C72f99811bC20D857035611bFCe5b5d` |
| XCMExecutor | `0x011b6FAf32370dCF92a452374FfCfCdbfA20278c` |
| HyperExecutor | `0x62919Cb6416Cb919fC4A30c5707a7867Ca874ca6` |

### Test Tokens

| Token | Address | Decimals | mint() access |
|---|---|---|---|
| tDOT | `0x2402C804aD8a6217BF73D8483dA7564065c56083` | 18 | Open (no role) |
| tUSDC | `0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626` | **6** | Open (no role) |
| tETH | `0xd92a5325fB3A56f5012F1EBD1bd37573d981144e` | 18 | Open (no role) |

### Seeded V2 Pairs (UniswapV2PoolAdapter)

| Pair | Address | Reserves |
|---|---|---|
| tDOT/tUSDC | `0x84864aff1aac120809f3a2ebf0be0f2cc3a51528` | 1000 tDOT + 7000 tUSDC |
| tUSDC/tETH | `0x9E628e8F4f26771F3208E2B9071d843cFeF45b1a` | seeded |
| tDOT/tETH | `0x412cfeb621f5a43a08adda9c8d09f29651570a01` | 1000 tDOT + 3 tETH |
| tDOT/TKB | `0xe01503Aeac95Ca39E8001aDa83121f1F8743e491` | seeded |
| TKA/TKB | `0xdd59E6121315237ACc953cd6aF1924F4320778dF` | seeded |

---

## 4. Implementation Plan: Four Parallel Streams

### Stream 0 — Address & Decimal Sync (shared unblock, must land first)

**Scope:** 6 targeted constant edits across 4 repos. No logic changes.

**Files and exact changes:**

#### `obi.index/src/config/contracts.ts`
```typescript
// BEFORE
ObidotVault: "0x4D327724C167ac4D66125a5DcC0724DDaCD63fF9"
// AFTER
ObidotVault: "0x03473a95971Ba0496786a615e21b1e87bDFf0025"
```

#### `obi-kit/packages/core/src/constants.ts`
```typescript
// BEFORE
swapRouterAddress: "0x0A85A1B0bb893cab3b5fad7312ac241e92C8Badf"
// AFTER
swapRouterAddress: "0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c"
```

#### `modules/agent/src/config/constants.ts`
```typescript
// BEFORE
SWAP_ROUTER_ADDRESS: "0x0A85A1B0bb893cab3b5fad7312ac241e92C8Badf"
{ symbol: "tUSDC", decimals: 18, ... }
// AFTER
SWAP_ROUTER_ADDRESS: "0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c"
{ symbol: "tUSDC", decimals: 6, ... }
```

#### `modules/app/src/shared/trade/swap.ts` (TOKENS array — verify only)
```typescript
// Already correct — tUSDC has decimals: 6 at line 15
// No edit needed; verify this remains correct
{ symbol: "tUSDC", decimals: 6, ... }
```

#### `modules/app/src/lib/constants.ts`
Verify only — no decimal assumptions present. The `swap.ts` TOKENS array is the single source of truth for token decimals in the app.

**Verification after Stream 0:**
```bash
# Confirm vault address in obi.index
grep "ObidotVault" obi.index/src/config/contracts.ts

# Confirm SwapRouter in agent
grep "SWAP_ROUTER" modules/agent/src/config/constants.ts

# Confirm tUSDC decimals in app
grep -r "tUSDC" modules/app/src/shared/trade/index.ts
```

**Commit message:** `fix: sync Phase 17 addresses and tUSDC decimals across all packages`

---

### Stream A — Route API Verification

**Goal:** `/api/routes` returns real route data with correct token amounts.

#### Step A1: Verify on-chain pair reserves
```bash
# For each V2 pair, call getReserves() to confirm liquidity exists
cast call 0x84864aff1aac120809f3a2ebf0be0f2cc3a51528 \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
# Expected: non-zero reserve0, reserve1

cast call 0x9E628e8F4f26771F3208E2B9071d843cFeF45b1a \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io

cast call 0x412cfeb621f5a43a08adda9c8d09f29651570a01 \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```

If any reserve is zero → run the seeding script:
```bash
cd /home/harry-riddle/dev/github.com/obidot/obi.router
forge script script/DeployPairsAndSeed.s.sol --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}" --broadcast
```

#### Step A2: Start agent and smoke-test route API
```bash
cd modules/agent && pnpm dev &

# Test tDOT → tUSDC (amountIn = 1 tDOT = 1e18)
curl "http://localhost:3001/api/routes?\
tokenIn=0x2402C804aD8a6217BF73D8483dA7564065c56083&\
tokenOut=0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626&\
amountIn=1000000000000000000"

# Expected: routes array with amountOut ≈ 7000000 (7 tUSDC in 6-decimal units)
```

#### Step A3: Verify app displays correctly
Open `http://localhost:3010/swap/polkadot-hub-testnet/tdot-to-tusdc`. Enter 1 tDOT. Expected: "You receive ≈ 7.000000 tUSDC" (not 0.000007).

---

### Stream B — Indexer Bootstrap

**Goal:** obi.index running locally, Supabase tables populated with live swap and oracle data.

#### Step B1: Apply Stream 0 vault address fix to obi.index

(Done in Stream 0.)

#### Step B2: Verify environment
```bash
cd /home/harry-riddle/dev/github.com/obidot/obi.index
cat .env | grep -E "DATABASE_URL|RPC_URL|BLOCKSCOUT_URL|VAULT"
```

Required values:
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `RPC_URL=https://eth-rpc-testnet.polkadot.io/`
- `BLOCKSCOUT_URL=https://blockscout-testnet.polkadot.io`

#### Step B3: Apply schema and generate client
```bash
npm run db:push
npm run db:generate
```

#### Step B4: Start the indexer
```bash
npm run dev
# Confirm: "Apollo Server ready at http://localhost:4350/graphql"
# Confirm: "Poller started, polling every 60000ms"
```

#### Step B5: Backfill historical events
```bash
npm run seed
# This re-indexes all Blockscout pages from block 0 for all 10 monitored contracts
# May take 2–5 minutes depending on event count
```

#### Step B6: Verify data in GraphQL
```graphql
# http://localhost:4350/graphql
query {
  swapExecutions(limit: 5) {
    id txHash recipient amountIn amountOut poolType timestamp
  }
  oracleStates { feedAddress price decimals lastUpdated }
  vaultState { totalAssets totalSupply paused }
}
```

Expected: non-empty arrays for at least `oracleStates` and `vaultState`.

---

### Stream C — Vault Seeding & Agent Loop

**Goal:** Vault has tDOT deposited, agent loop running and making live decisions.

> **IMPORTANT:** `PRIVATE_KEY` in `.env` has no `0x` prefix. All `cast send` commands must use `--private-key "0x${PRIVATE_KEY}"`.

#### Step C1: Mint 100,000 tDOT to deployer wallet
```bash
# Load PRIVATE_KEY from .env
export PRIVATE_KEY=$(grep PRIVATE_KEY /home/harry-riddle/dev/github.com/obidot/obi.router/.env | cut -d= -f2)
export DEPLOYER_ADDR=$(cast wallet address --private-key "0x${PRIVATE_KEY}")

cast send 0x2402C804aD8a6217BF73D8483dA7564065c56083 \
  "mint(address,uint256)" \
  "$DEPLOYER_ADDR" 100000000000000000000000 \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```

#### Step C2: Approve vault to spend tDOT
```bash
cast send 0x2402C804aD8a6217BF73D8483dA7564065c56083 \
  "approve(address,uint256)" \
  0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  100000000000000000000000 \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```

#### Step C3: Deposit 10,000 tDOT into vault
```bash
cast send 0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  "deposit(uint256,address)" \
  10000000000000000000000 \
  "$DEPLOYER_ADDR" \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```

#### Step C4: Verify vault balance
```bash
cast call 0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  "totalAssets()(uint256)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
# Expected: 10000000000000000000000 (10,000 * 1e18)
```

#### Step C5: Start agent loop
```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/agent
pnpm dev
# Agent reads vault state → queries oracle → LLM analyzes → signs intent
# Watch logs for: "Agent decision: HOLD/DEPLOY/REBALANCE"
```

---

### Stream D — Faucet UI

**Goal:** `/faucet` page in the Next.js app. Users connect wallet, click "Mint", pay their own gas.

#### Architecture

- New page: `src/app/faucet/page.tsx`
- New component: `src/components/faucet/faucet-panel.tsx`
- Reuses existing wagmi `useWriteContract` + `useWaitForTransactionReceipt` pattern (same as swap-form)
- No backend. No new API. No new contracts.

#### Token drip amounts

| Token | Amount | Raw value |
|---|---|---|
| tDOT | 100 | `100n * 10n**18n` |
| tUSDC | 1,000 | `1000n * 10n**6n` (6 decimals) |
| tETH | 0.1 | `10n**17n` |

#### Component design

```tsx
// src/components/faucet/faucet-panel.tsx
// Three FaucetCard components, one per token
// Each card: token symbol, drip amount, [Mint] button
// States: idle → pending wallet → confirming → done
// On done: show block explorer tx link
// On error: show error message with retry
```

#### Faucet page layout

```tsx
// src/app/faucet/page.tsx
// Header: "Test Token Faucet" + subtitle
// 3-column grid of FaucetCards on desktop, 1-col on mobile
// Note: "Tokens have no real value. For testnet use only."
// Note: "You pay your own gas. Connect wallet first."
```

#### Navbar link

Add "Faucet" to `NAV_ITEMS` in `src/shared/navbar.ts` — simple link, no dropdown, pointing to `/faucet`. Only shown when connected to Polkadot Hub TestNet (chain ID 420420417).

**Implementation mechanism:**

1. Add `visibleOnChainId?: number` to the `NavItem` type in `src/shared/navbar.ts`:
   ```typescript
   export type NavItem = { label: string; href: string | Function; children?: NavItem[]; visibleOnChainId?: number };
   ```
2. Set it on the Faucet entry: `{ label: "Faucet", href: "/faucet", visibleOnChainId: 420420417 }`
3. In `src/components/layout/navbar.tsx`, call `useChainId()` from wagmi and filter `NAV_ITEMS` before rendering: skip items where `item.visibleOnChainId !== undefined && item.visibleOnChainId !== chainId`.

#### mint() ABI — add to `src/lib/abi.ts`

Export `ERC20_MINT_ABI` from `src/lib/abi.ts` alongside existing ABI exports. The faucet component imports it from there, not inline.

```typescript
// src/lib/abi.ts — add this export
export const ERC20_MINT_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
```

---

## 5. MVP Success Criteria

- [ ] `GET /api/routes?tokenIn=tDOT&tokenOut=tUSDC&amountIn=1e18` → returns route with `amountOut ≈ 7000000` (7 tUSDC in 6-decimal units)
- [ ] App displays "You receive ≈ 7.0000 tUSDC" for 1 tDOT input (not 0.000007)
- [ ] Swap executes on-chain → tx confirmed
- [ ] Swap event appears in obi.index GraphQL within 60s
- [ ] Live Events feed in app shows the swap in real-time (via WebSocket subscription)
- [ ] `/faucet` page — user mints 100 tDOT in one wallet signature
- [ ] Vault has ≥ 10,000 tDOT deposited
- [ ] Agent loop logs a decision every 5 minutes
- [ ] Agent page in app shows recent decisions

---

## 6. Sequencing

```
Day 1 Morning:
  Stream 0 — Fix all addresses + decimals (1 commit, 1hr)
  Stream A — Verify reserves, smoke-test route API (1hr)
  Stream B — Start indexer, backfill Supabase (1hr)

Day 1 Afternoon:
  Stream C — Seed vault, start agent (1hr)
  Stream D — Build faucet UI (2hr)

Day 1 Evening:
  Integration test: full swap flow end-to-end
  Verify all success criteria checked off
```

---

## 7. Known Constraints & Risks

| Risk | Mitigation |
|---|---|
| V2 pair reserves zero after testnet reset | Re-run `DeployPairsAndSeed.s.sol` with `--broadcast` |
| Blockscout API rate limiting (429) | Indexer has built-in 2s exponential backoff |
| Agent LLM API key not configured | Check `.env` for `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| tUSDC decimal fix breaks existing pair seeding amounts | Pair was seeded with correct raw amounts — only display was wrong |
| `PRIVATE_KEY` has no `0x` prefix | All cast commands use `--private-key "0x${PRIVATE_KEY}"` |
| VPS deployment needed later | Locally tested first; env vars are the only delta for VPS |

---

## 8. Out of Scope for MVP

- Production VPS deployment (planned post-MVP)
- NativeAssetDOT / NativeAssetUSDC support (proxy precompile tokens)
- Hydration/Bifrost XCM live routes (status: `mainnet_only`, displayed as "coming soon")
- Hyperbridge ISMP integration (status: `coming_soon`)
- Additional token pairs beyond tDOT, tUSDC, tETH
- User positions / portfolio tracking
