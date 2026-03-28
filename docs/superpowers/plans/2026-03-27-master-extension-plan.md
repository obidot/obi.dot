# Obidot Master Extension Plan — 2026

> **Status:** Draft — awaiting clarification answers before phasing is locked
> **Scope:** All repos — obi.router, obidot (app + agent), obi.index, obi-kit
> **Goal:** Extend Obidot into a fully demonstrable, grant-ready, mainnet-scalable trading layer on Polkadot Hub
> **Grant Target:** DeFi Infrastructure & Tooling Bounty (Velocity Labs, ~1M DOT top-up) + Polkadot OpenGov treasury proposal
> **Spec:** `docs/superpowers/specs/2026-03-27-master-extension-design.md`

---

## Context

Polkadot officially featured Obidot as *"a full trading layer for Polkadot with execution, intelligence, and automation. The Obidot Agent Kit lets users deploy custom bots and agents directly on the protocol."*

Polkadot Hub mainnet launched EVM smart contracts January 27, 2026. Only 19 contracts were deployed in week 1 — Obidot is a genuine first-mover. No other EVM smart contract DEX aggregator exists on Polkadot Hub. The DeFi Infrastructure & Tooling Bounty (Velocity Labs) explicitly mandates funding first-wave Hub dApps.

**Current gap:** XCM/Hyperbridge routes are broken on testnet; only Uniswap V2 multi-hop is live. The demo is not showcase-ready for grant reviewers. obi-kit is not published to npm. The agent chat is read-only.

---

## Strategic Priorities

1. **Testnet showcase quality** — Make what works (UV2 multi-hop, split routes) look professional and verifiable
2. **Expand on-testnet functionality** — Add more adapters that actually execute (AssetHub pallet, more UV2 pairs)
3. **XCM route integrity** — Display cross-chain routes with honest status labels, not silent failures
4. **Ship obi-kit v1.0** — Publish npm packages; this is a key grant deliverable (Agent Kit narrative)
5. **Mainnet architecture** — All refactoring decisions must support mainnet launch without re-architecture
6. **Grant deliverables** — Three concrete milestones with on-chain verifiable outcomes

---

## File Map (All Repos)

| Repo | Current State | Extension Direction |
|------|--------------|-------------------|
| `obi.router` | 81 contracts, 9 adapters, only UV2 + relay teleport work on testnet | More working adapters, Uniswap V3, Chainflip, AssetHub AMM pallet |
| `obidot/modules/app` | Good UI, no real quote data on testnet, XCM routes silently broken | Real data, honest route status, interactive agent, analytics |
| `obidot/modules/agent` | Fastify API, read-only chat, autonomous loop | Interactive chat, streaming responses, real strategy showcase |
| `obi.index` | GraphQL indexer, 20 Prisma models, LP event handling | Analytics API, charts data, cross-chain event tracking |
| `obi-kit` | 4 packages, 225 tests, linked locally only | Publish to npm, full docs, bot templates, CLI scaffold |
| `brand-kit` | Design assets | Update for new features (Agent Kit branding) |

---

## Phase 1 — Testnet Showcase (Weeks 1–3)

**Goal:** Anyone opening the app on testnet immediately sees a working, impressive DEX aggregator.

### 1.1 Expand UV2 Liquidity & Pairs (obi.router + obi.index)

**Problem:** Only 5 UV2 pairs deployed, shallow liquidity. Multi-hop paths are limited.

**Tasks:**
- [ ] Deploy 3 more UV2 pairs on testnet:
  - tDOT / tETH (deeper liquidity, $100k+ equivalent)
  - TKA / tUSDC
  - TKB / tETH
- [ ] Seed all pairs with sufficient liquidity for realistic price impact (run `SeedLiquidity.s.sol` with larger amounts)
- [ ] Register new pairs with `UniswapV2PoolAdapter`
- [ ] Update `LP_PAIRS` constants in `modules/app/src/lib/constants.ts` and `obi.index/src/config/contracts.ts`
- [ ] Update `obi-kit/packages/core/src/addresses.ts` with new pair addresses
- [ ] Verify multi-hop routes: tDOT→TKA→tUSDC (3-token chain)

**Acceptance:** `/api/routes?tokenIn=tDOT&tokenOut=tUSDC` returns at least 3 distinct routes (direct, 2-hop, split).

---

### 1.2 Fix SwapQuoter → Real Route API (obidot/modules/agent)

**Problem:** `/api/routes` builds routes from hardcoded pair list without reading on-chain state correctly; `SwapQuoterService.getBestQuote()` doesn't fan out to all adapters.

**Tasks:**
- [ ] Fix `SwapRouterService.findRoutes()` to enumerate all registered adapters dynamically (call `getPoolAdapter(i)` for i=0..8)
- [ ] Fix multi-hop path building: generate all 2-hop and 3-hop paths from LP pair graph
- [ ] Fix split route generation: offer two-way split for any route with ≥2 viable legs
- [ ] Add proper error handling when `SwapQuoter.getBestQuote()` reverts on testnet (some adapters will revert)
- [ ] Return `status: "no_liquidity"` for pairs with zero reserves instead of crashing
- [ ] Update `RouteHop.poolLabel` to show human-readable names (e.g. "tDOT/tUSDC UV2")

**Acceptance:** Frontend shows at least one live route with real `amountOut > 0` for all 8 token pair combinations.

---

### 1.3 Route Status Transparency (obidot/modules/app)

**Problem:** XCM routes (Hydration, Bifrost, etc.) silently fail or show as `mainnet_only` with no explanation. Users and grant reviewers don't understand what's real.

**Tasks:**
- [ ] Update `SwapRouteResult.status` handling in `swap-form.tsx` to show distinct UI states:
  - `live` — green badge, executable
  - `mainnet_only` — grey badge, "Available on mainnet", show estimated output
  - `coming_soon` — grey badge with roadmap label
  - `no_liquidity` — orange warning
- [ ] Add a `RouteStatusBadge` component in `components/ui/`
- [ ] In `route-diagram.tsx`, show each hop's status (not just the overall route)
- [ ] Add a "Testnet Mode" banner explaining which routes are simulated
- [ ] For `mainnet_only` routes, show a mainnet estimated quote using hardcoded rate fallback (DOT/USDC oracle price from `KeeperOracle`)

**Acceptance:** Users can see all 9 adapter routes with honest status labels; no silent failures.

---

### 1.4 Price Impact & Depth Display (obidot/modules/app)

**Problem:** No visual indication of price impact or liquidity depth before execution.

**Tasks:**
- [ ] Add `PriceImpactWarning` component — amber >1%, red >3%, blocking >5%
- [ ] Add `LiquidityDepthBar` component showing relative reserve size
- [ ] Show "Minimum received" in the swap confirmation UI
- [ ] Add exchange rate display (token A per token B) that updates on quote refresh
- [ ] Hook all of the above into `swap-form.tsx` using data from `SwapRouteResult`

---

### 1.5 Real-Time Quote Polling (obidot/modules/app)

**Problem:** Quotes are fetched once and go stale.

**Tasks:**
- [ ] Reduce `useSwapQuote` stale time from 10s to 3s for testnet
- [ ] Add auto-refresh every 5s when form is filled (pause when modal is open)
- [ ] Show "Quote expired" + re-fetch button when quote is >30s old
- [ ] Add quote loading skeleton to avoid layout shift

---

## Phase 2 — New Working Adapters (Weeks 3–6)

**Goal:** Demonstrate aggregation across more than just UV2 — show the router's multi-adapter design actually works.

### 2.1 AssetHub Native AMM Adapter (obi.router)

**What it is:** Polkadot Asset Hub has a native `AssetConversion` pallet (Substrate-side AMM). The XCM precompile at `0xA0000` can dispatch calls to it. The existing `AssetHubPairAdapter` dispatches XCM but may not be correctly encoding the `asset_conversion::swap_exact_tokens_for_tokens` extrinsic.

**Tasks:**
- [ ] Audit `AssetHubPairAdapter.sol` against current Asset Hub runtime ABI for `AssetConversion` pallet (pallet index 53, extrinsic indices)
- [ ] Fix SCALE encoding of `MultiLocation` for tDOT and native DOT assets
- [ ] Write a testnet E2E script: `E2EAssetHubXcm.s.sol` that executes and verifies output
- [ ] If XCM is broken on testnet, add a `MockAssetHubPairAdapter` that simulates the response for UI display purposes (clearly labelled)
- [ ] Update `obi-kit/packages/core/src/abis/` with corrected adapter ABI

**Acceptance:** `AssetHubPairAdapter.getAmountOut()` returns non-zero for DOT→USDC on testnet OR a clearly-labelled simulation route is shown.

---

### 2.2 Uniswap V3 Adapter (obi.router)

**What it is:** If Uniswap V3 is deployed on Hub testnet (or we deploy it), a `UniswapV3PoolAdapter` can route through concentrated liquidity. This dramatically improves price efficiency for large trades and is a strong grant demo.

**Tasks:**
- [ ] Research whether Uniswap V3 core is deployable on Hub (likely yes, REVM is fully EVM-compatible; PolkaVM needs `resolc`)
- [ ] Deploy Uniswap V3 core: `UniswapV3Factory`, `NonfungiblePositionManager`, `SwapRouter02` (use Papermoon's work as reference)
- [ ] Create `UniswapV3PoolAdapter.sol` implementing `IPoolAdapter`:
  - `getAmountOut()` calls V3 `Quoter.quoteExactInputSingle()`
  - `swap()` calls V3 `SwapRouter.exactInputSingle()` with encoded path
- [ ] Add `PoolType.UniswapV3` (value 9) to enums across all repos
- [ ] Register V3 adapter in `SwapRouter` slot index 8
- [ ] Deploy a tDOT/tUSDC 0.05% V3 pool and add concentrated liquidity

**Acceptance:** A V3 route appears in the UI with better price for large amounts vs V2.

---

### 2.3 Hydration Omnipool — Testnet Simulation (obi.router + obidot/modules/app)

**What it is:** Hydration Omnipool XCM is `mainnet_only` because testnet XCM to para 2034 is unreliable. We can add an honest simulation mode.

**Tasks:**
- [ ] Add `HydrationOmnipoolAdapter.getAmountOutEstimated()` that uses oracle prices for simulation (not live XCM)
- [ ] Add a simulation mode flag to the adapter: `bool public simulationMode`
- [ ] In simulation mode, `getAmountOut()` uses `OracleRegistry.getPrice()` with a configurable spread factor (0.3% fee)
- [ ] In the UI, show Hydration Omnipool route with "Simulated — Mainnet Execution" label
- [ ] Add a `XcmRouteStatusPanel` in the UI showing which parachains are reachable on current network

**Note:** This is NOT fake data — it's oracle-backed simulation clearly labelled. Grant reviewers see the architecture working, not a hardcoded number.

---

### 2.4 Chainflip Adapter (obi.router) — Research & Stub

**What it is:** Chainflip integrated with Asset Hub in July 2025 for one-click BTC/ETH↔DOT swaps. An adapter can route through Chainflip's State Chain for cross-ecosystem swaps.

**Tasks:**
- [ ] Research Chainflip's Solidity integration API (likely an intent-based contract on their side)
- [ ] Create `ChainflipAdapter.sol` stub implementing `IPoolAdapter` with `status = coming_soon`
- [ ] Add route type `"bridge"` to `SwapRouteResult` in the app
- [ ] Show a "Bridge to ETH mainnet via Chainflip" route in the UI (labelled as coming soon)
- [ ] Add `PoolType.Chainflip` (value 10) enum

**Acceptance:** UI shows a Chainflip route for DOT→ETH with correct `coming_soon` status and explanation.

---

## Phase 3 — obi-kit v1.0 Ship (Weeks 4–7)

**Goal:** Publish all 4 packages to npm. This is the "Agent Kit" deliverable Polkadot mentioned.

### 3.1 Package Hardening (obi-kit)

**Tasks:**
- [ ] Audit all 19 LangChain tools for correctness with Phase 17+ addresses
- [ ] Add missing tool: `SwapMultiHopTool` that builds and executes a full multi-hop route
- [ ] Add missing tool: `LiquidityAddTool` and `LiquidityRemoveTool` (using LiquidityRouter)
- [ ] Add missing tool: `CrossChainRouteTool` that returns XCM route estimates
- [ ] Add missing tool: `ArbitrageDetectTool` that scans pools for spread opportunities
- [ ] Fix TypeScript strict mode violations (`pnpm typecheck` must return 0 errors)
- [ ] Ensure 80%+ test coverage (currently 225 tests — add ~50 more for new tools)

### 3.2 npm Publishing (obi-kit)

**Tasks:**
- [ ] Set up npm org `@obidot-kit` (or publish under `@obidot/`)
- [ ] Configure `.npmignore` for each package
- [ ] Set up GitHub Actions workflow: test → lint → typecheck → publish (on tag push)
- [ ] Publish: `@obidot-kit/core@1.0.0`, `@obidot-kit/llm@1.0.0`, `@obidot-kit/sdk@1.0.0`, `@obidot-kit/cli@1.0.0`
- [ ] Update `obi-kit/README.md` with npm install instructions and quickstart

### 3.3 Bot Templates (obi-kit)

**Tasks:**
- [ ] Create `examples/dca-bot/` — Dollar-cost averaging bot that buys tDOT weekly
- [ ] Create `examples/arbitrage-bot/` — Monitors UV2 pools for spread > 50bps, executes
- [ ] Create `examples/yield-optimizer/` — Moves idle vault capital to highest-yield Bifrost strategy
- [ ] Update CLI: `obi-kit init --template dca-bot` scaffolds a ready-to-run project
- [ ] Add `obi-kit/docs/` with full API reference (generated from JSDoc)

### 3.4 Agent Kit Landing (obidot/docs)

**Tasks:**
- [ ] Add `/docs/agent-kit` documentation section:
  - "What is the Obidot Agent Kit"
  - Quickstart (install → configure → run)
  - Tool reference (all 19+ tools)
  - Bot templates walkthrough
  - Architecture diagram
- [ ] Add live demo section with embedded chat widget from `/agent` page

---

## Phase 4 — App + Agent Improvements (Weeks 5–8)

**Goal:** The app is a compelling showcase for grant reviewers AND real users.

### 4.1 Interactive Agent Chat (obidot/modules/agent + app)

**Problem:** `/api/chat` is read-only (no transaction execution from browser). The agent loop is autonomous but not user-interactive.

**Tasks:**
- [ ] Add `POST /api/chat/execute` endpoint that accepts a user intent string, routes through LLM, and returns a proposed `StrategyIntent` for user approval (NOT auto-execute)
- [ ] Add streaming response (`text/event-stream`) for real-time LLM token output
- [ ] In the app `/agent` page:
  - Add a proper chat input (not just display)
  - Show streamed LLM response as it generates
  - When agent proposes a trade: show confirmation dialog with route + amounts
  - User approves → frontend calls `useWriteContract` to execute (user signs, not agent)
- [ ] Add conversation history (localStorage, last 20 messages)
- [ ] Add example prompts: "What's the best route for 100 DOT to USDC?", "Show me yield opportunities", "Rebalance my portfolio"

### 4.2 Analytics Dashboard (obidot/modules/app + obi.index)

**Problem:** `/insights` and `/market-overview` pages have limited real data.

**Tasks in obi.index:**
- [ ] Add GraphQL query: `poolAnalytics(pair: String!, window: String!)` returning volume, fees, price history per pool
- [ ] Add GraphQL query: `topRoutes(limit: Int!)` returning most-used routes with aggregate volume
- [ ] Add GraphQL query: `priceHistory(tokenIn: String!, tokenOut: String!, from: Int!, to: Int!)` returning OHLCV data

**Tasks in obidot/modules/app:**
- [ ] Add candlestick/line chart component (use lightweight-charts or recharts)
- [ ] Connect price charts to `priceHistory` GraphQL query
- [ ] Add "24h Volume" and "Total Fees" stat cards using indexed data
- [ ] Add "Top Routes" table on market overview page
- [ ] Add "Your History" section on the swap page showing past swaps (from `getSwapExecutionsByRecipient`)

### 4.3 Limit Orders (obidot/modules/app)

**Problem:** `LimitOrderPanel` exists in the UI but currently stores orders in localStorage — no on-chain execution.

**Options:**
- **Option A (simple):** Keep localStorage orders but wire agent to monitor and execute when price condition is met (agent loop checks limit orders)
- **Option B (on-chain):** Deploy a `LimitOrderBook.sol` contract that holds orders, lets anyone fill them for a keeper fee

**Recommendation:** Option A first (3 days of work), Option B as a grant milestone (2 weeks of work).

**Tasks (Option A):**
- [ ] Expose `GET /api/limit-orders/:address` endpoint that returns pending orders from localStorage (agent reads them via a signed message)
- [ ] Add limit order checking to the agent loop: if market price crosses limit price, propose execution
- [ ] Show order status in UI: Pending / Filled (agent executed) / Expired

### 4.4 Cross-Chain Status Tracker (obidot/modules/app + obi.index)

**Problem:** When XCM or Hyperbridge transactions are dispatched, users have no way to track them in the UI.

**Tasks:**
- [ ] Add `CrossChainDispatch` tracking in obi.index (already has the model) → expose via GraphQL subscription
- [ ] Add a `CrossChainStatusPanel` component in the app:
  - Shows pending cross-chain intents
  - Polls `CrossChainDispatch` status (pending → relayed → executed → failed)
  - Links to Hyperbridge explorer for ISMP messages
- [ ] Add Hyperbridge message tracking via their public API

### 4.5 Wallet & Balance Improvements (obidot/modules/app)

**Tasks:**
- [ ] Show balances for ALL configured tokens (not just selected pair)
- [ ] Add native DOT balance (from precompile `NativeAsset`)
- [ ] Add "Max" button that fills input with full wallet balance minus gas estimate
- [ ] Show USD value estimates next to token amounts (via KeeperOracle price)
- [ ] Add transaction history panel (from `getSwapExecutionsByRecipient`)

---

## Phase 5 — obi.index Hardening (Weeks 6–8)

**Goal:** The indexer is reliable, fast, and provides rich data for both the app and grant reviewers.

### 5.1 Blockscout Poller Reliability

**Problem:** 60s polling interval can miss events; cursor tracking may drift.

**Tasks:**
- [ ] Reduce poll interval to 15s (Blockscout can handle it)
- [ ] Add retry logic with exponential backoff when Blockscout API returns 429 or 5xx
- [ ] Add health check endpoint `GET /health` with last-indexed-block, DB connection status, poller lag
- [ ] Add Prometheus metrics: `events_indexed_total`, `poll_duration_ms`, `reorg_detected_total`
- [ ] Handle chain reorgs: if a previously indexed event's `txHash` is no longer in Blockscout, mark it as `reorged` and re-sync from that block

### 5.2 Cross-Chain Event Tracking

**Problem:** `CrossChainDispatch` model exists but XCM/ISMP events are not fully decoded.

**Tasks:**
- [ ] Add Hyperbridge ISMP event handlers: `GetRequestHandled`, `PostResponseHandled`, `StateMachineUpdated`
- [ ] Link ISMP events to `CrossChainDispatch` records (update status: pending→relayed→executed)
- [ ] Index XCMExecutor logs and decode `XCM_PROGRAM_SENT` events
- [ ] Add `crossChainPipeline` GraphQL query showing full lifecycle of a cross-chain intent

### 5.3 Analytics Aggregation

**Tasks:**
- [ ] Add `SwapVolume24h` computed view in PostgreSQL (materialized, refreshed every 5min)
- [ ] Add `FeeRevenue24h` computed view
- [ ] Add `UniqueTraders7d` computed view
- [ ] Expose all three via GraphQL: `protocolStats { volume24h feeRevenue24h uniqueTraders7d tvl }`
- [ ] Add `priceHistory` table: on each SwapExecution, record effective price and store time-series

---

## Phase 6 — Mainnet Preparation (Weeks 8–12)

**Goal:** Obidot is ready for Polkadot Hub mainnet launch with minimal changes.

### 6.1 Contract Audit Preparation (obi.router)

**Tasks:**
- [ ] Increase test coverage to 90%+ (currently good but add edge cases for split routes)
- [ ] Add formal invariant tests: total input = sum of all outputs (no token leakage)
- [ ] Document all security assumptions in each contract's NatSpec
- [ ] Create a security checklist PR template (reentrancy, access control, oracle manipulation)
- [ ] Engage an audit partner (Spearbit, Trail of Bits, or Pashov for Rust/PolkaVM experience)
- [ ] Fix any PolkaVM-specific issues found during audit

### 6.2 Mainnet Contract Deployment Plan (obi.router)

**Tasks:**
- [ ] Create `script/deploy/DeployMainnet.s.sol` — production deployment with real addresses:
  - Real DOT precompile: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (or Asset Hub DOT precompile)
  - Real USDT/USDC from Asset Hub
  - Real Pyth oracle feed for DOT/USD
- [ ] Add multisig admin support (Safe or custom threshold sig)
- [ ] Set production `DEPOSIT_CAP` and `MAX_DAILY_LOSS` conservatively
- [ ] Test mainnet deployment on a forked Polkadot Hub (using `anvil --fork-url`)

### 6.3 Mainnet Chain Config (All repos)

**Tasks:**
- [ ] Add mainnet chain (ID: `420420419`) to `modules/app/src/lib/chains.ts`
- [ ] Add mainnet contract addresses to constants (separate from testnet)
- [ ] Add environment-based chain selection: `NEXT_PUBLIC_CHAIN_MODE=mainnet|testnet`
- [ ] Update obi-kit `addresses.ts` with mainnet addresses
- [ ] Update obi.index config for mainnet `CHAIN_ID=420420419`

### 6.4 XCM Live Routes (obi.router)

**Tasks:**
- [ ] When mainnet XCM is verified working:
  - Remove `simulation_mode` flag from HydrationOmnipoolAdapter
  - Remove `mainnet_only` stubs from route API
  - Re-run E2E XCM scripts on mainnet
- [ ] Update adapter parachain IDs for mainnet (some differ from testnet)

---

## Architecture Decisions

### Keep (do not replace)

| Component | Reason |
|-----------|--------|
| SwapRouter 9-slot adapter architecture | Extensible, battle-tested, PolkaVM-compatible |
| EIP-712 UniversalIntent signing | Enables agent-based execution without custody |
| Blockscout REST API for indexing | `eth_getLogs` is broken on PolkaVM, Blockscout is reliable |
| Prisma + PostgreSQL | ACID, type-safe, 20 proven models |
| LangChain tool pattern in obi-kit | Works with any LLM, composable |
| Next.js 15 App Router + wagmi + RainbowKit | Modern, SSR-capable, good UX |
| Biome for lint/format | Fast, consistent across all repos |
| Transient balance mapping (not EIP-1153) | PolkaVM doesn't support tstore/tload |

### Replace / Improve

| Component | Issue | Solution |
|-----------|-------|----------|
| Route API path finding | Hardcoded path list, doesn't enumerate adapters dynamically | Dynamic adapter enumeration from SwapRouter |
| `/api/chat` read-only | Users can't interact | Add streaming chat + user-approved execution |
| Limit orders (localStorage) | No on-chain guarantee | Agent-monitored execution (Phase 4), LimitOrderBook contract (later) |
| Quote staleness | 10s stale, no auto-refresh | 3s stale + 5s auto-refresh + expiry indicator |
| Cross-chain status | No lifecycle tracking | CrossChainStatusPanel + ISMP event indexing |
| obi-kit local-link only | Not usable by ecosystem | Publish to npm as @obidot-kit/* |

### Add New

| Component | Purpose |
|-----------|--------|
| UniswapV3PoolAdapter | Concentrated liquidity, better price for large trades |
| ChainflipAdapter (stub) | Cross-ecosystem BTC/ETH routing (roadmap) |
| AssetHub AMM adapter (fixed) | Native pallet routing via XCM |
| LimitOrderBook.sol | On-chain limit orders with keeper incentive |
| PriceImpactWarning | User protection, grant reviewer confidence |
| CrossChainStatusPanel | ISMP/XCM transaction lifecycle |
| Analytics charts | Demonstrate protocol usage |
| Bot templates in obi-kit | Make the "Agent Kit" claim real |

---

## Grant Milestone Plan

### Milestone 1 — Testnet Showcase (4 weeks)
**Deliverables:**
- Working multi-hop routes (3+ token chain) with real on-chain execution
- Split route execution (2 adapters in parallel)
- 8+ UV2 liquidity pairs with $50k+ aggregate seeded liquidity
- Price impact display, real-time quote refresh
- Honest route status labels (live / mainnet_only / simulated)
- obi.index indexing all UV2 swaps with GraphQL API live

**On-chain verifiable:** Any reviewer can call `SwapRouter.swapMultiHop()` and see it succeed on Blockscout.

**Ask:** $50,000 USD equivalent (for development + testnet infrastructure)

### Milestone 2 — Agent Kit v1.0 + New Adapters (6 weeks)
**Deliverables:**
- `@obidot-kit/{core,llm,sdk,cli}` published to npm
- 3 bot templates (DCA, arbitrage, yield optimizer)
- Documentation site updated with Agent Kit section
- AssetHub AMM adapter working (or simulation mode)
- UniswapV3PoolAdapter deployed and registered
- Interactive agent chat in the app (user approves, doesn't auto-execute)
- Limit order monitoring by agent loop

**On-chain verifiable:** npm install + run the DCA bot template → it executes a real swap on testnet.

**Ask:** $75,000 USD equivalent

### Milestone 3 — Mainnet Launch + Analytics (8 weeks)
**Deliverables:**
- Full mainnet deployment (Polkadot Hub chain 420420419)
- XCM routes to Hydration live (when XCM is stable on mainnet)
- Analytics dashboard with real TVL, volume, fee revenue
- Cross-chain status tracking
- Contract audit completed (report public)
- obi-kit v1.1 with mainnet addresses

**On-chain verifiable:** Real trades on Polkadot Hub mainnet with aggregate volume > $100k.

**Ask:** $125,000 USD equivalent

**Total Ask:** ~$250,000 USD (in DOT/USDC via DeFi Bounty or OpenGov)

---

## Grant Application Strategy

### Primary Path: DeFi Infrastructure & Tooling Bounty (Velocity Labs)
- **Why:** Fastest path, explicit mandate to fund first-wave Hub dApps
- **How:** Submit a child bounty proposal at https://polkadot.subsquare.io/treasury/bounties/36
- **Contact:** Reach out to Velocity Labs curators on Telegram/Discord first (warm intro > cold application)
- **Format:** Milestone-based, link to live testnet, GitHub repos, Blockscout verified contracts

### Secondary Path: Polkadot OpenGov Treasury
- **Why:** Larger budget possible, more visibility
- **How:** Post on Polkassembly, gather community feedback for 28 days, then referendum
- **Timing:** Submit after Milestone 1 is complete (demonstrated delivery builds trust)

### Supporting Evidence to Include
- Polkadot's official tweet featuring Obidot
- Live Blockscout transactions (first XCM swap on Hub testnet, phase 9 March 2026)
- GitHub repos with full open-source code
- Phase deployment history (9+ phases, 81 contracts)
- obi-kit npm package stats (after publishing)

---

## Timeline (Weeks)

```
Week  1-2:  Phase 1.1 + 1.2 — Liquidity expansion + route API fix
Week  2-3:  Phase 1.3 + 1.4 + 1.5 — UI transparency + price impact + quotes
Week  3-4:  Phase 2.1 + 2.2 — AssetHub adapter + Uniswap V3 research/deploy
Week  4-5:  Phase 2.3 + 2.4 — Hydration simulation + Chainflip stub
Week  5-6:  Phase 3.1 + 3.2 — obi-kit hardening + npm publish
Week  5-7:  Phase 3.3 + 3.4 — Bot templates + Agent Kit docs
Week  6-7:  Phase 4.1 + 4.2 — Interactive agent chat
Week  7-8:  Phase 4.3 + 4.4 + 4.5 — Limit orders + cross-chain tracker + wallet UX
Week  7-8:  Phase 5.1 + 5.2 + 5.3 — obi.index hardening + analytics
Week  8-12: Phase 6.1 + 6.2 + 6.3 + 6.4 — Mainnet prep + audit
```

---

## Open Questions (See Clarification Requests)

See `docs/superpowers/specs/2026-03-27-master-extension-design.md` for architecture detail.

Blocking questions that affect phasing:
1. **Timeline to grant submission** — affects how much to scope into Milestone 1
2. **Solo or team** — affects parallel execution of phases
3. **V3 deploy authority** — do we have deployer key + enough testnet DOT to deploy V3?
4. **Mainnet target date** — drives urgency of Phase 6
5. **Agent Kit open-source vs paid** — affects obi-kit licensing and positioning
