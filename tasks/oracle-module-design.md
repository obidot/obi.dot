# Oracle Module Design — Comprehensive Plan

> **Status: ⚡ Partially Implemented**
> - **Implemented:** `KeeperOracle.sol` (keeper-pushable AggV3), `OracleRegistry.sol` (multi-asset registry with staleness checks), `SlippageGuard.sol` (2% max slippage library) — all deployed on Paseo testnet.
> - **Planned (next phase):** Multi-source aggregation, TWAP, batched updates, RedStone/Chainlink CCIP integration — tracked in [`tasks/agent-rebuild-plan.md`](./agent-rebuild-plan.md) Phase 5.

> **Target:** Polkadot Hub EVM (pallet-revive / PolkaVM)
> **Constraint:** No Pyth, no Chainlink, no native oracle deployed on-chain today.
> **Migration path:** Hot-swap via `vault.setOracle()` when native oracle arrives.

---

## Table of Contents

1. [Current State & Gaps](#1-current-state--gaps)
2. [Architecture Overview](#2-architecture-overview)
3. [On-Chain Contracts](#3-on-chain-contracts)
4. [Off-Chain Keeper Service](#4-off-chain-keeper-service)
5. [Agent Integration](#5-agent-integration)
6. [Security Model](#6-security-model)
7. [Testing Strategy](#7-testing-strategy)
8. [Migration Roadmap](#8-migration-roadmap)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Current State & Gaps

### What We Have

| Component | Status | Details |
|-----------|--------|---------|
| `IAggregatorV3` interface | ✅ | Chainlink-compatible, used by vault |
| `KeeperOracle.sol` | ✅ | Single-feed, single-keeper, no historical rounds |
| `ObidotVault._enforceOracleSlippage()` | ✅ | Validates staleness (1h), positivity, slippage bounds |
| `vault.setOracle()` | ✅ | Admin hot-swap, zero downtime |

### Critical Gaps

| Gap | Severity | Impact |
|-----|----------|--------|
| **Agent has no oracle integration** | 🔴 Critical | Agent can't read prices, push updates, or pre-validate strategies |
| **Single price feed** | 🟡 Medium | Multi-asset strategies (DOT→vDOT, DOT→BNC) have no output-side oracle validation |
| **Single keeper = single point of failure** | 🟡 Medium | If keeper goes down, oracle stales within 1h, all strategies revert |
| **No multi-source aggregation** | 🟡 Medium | Single source can be manipulated or go offline |
| **No historical round data** | 🟢 Low | `getRoundData()` always returns latest; fine for vault but poor for analytics |
| **No `reportStrategyOutcome` validation** | 🟡 Medium | Returned amounts accepted at face value without oracle verification |
| **Non-configurable staleness** | 🟢 Low | `ORACLE_STALENESS_THRESHOLD` is hardcoded constant (3600s) |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OFF-CHAIN LAYER                              │
│                                                                     │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────────┐  │
│  │ Pyth Hermes  │    │  CoinGecko    │    │  Binance/SubQuery    │  │
│  │  (pull API)  │    │  (REST API)   │    │  (WebSocket/REST)    │  │
│  └──────┬───────┘    └──────┬────────┘    └──────────┬───────────┘  │
│         │                   │                        │              │
│         └───────────┬───────┴────────────────────────┘              │
│                     ▼                                               │
│           ┌─────────────────────┐                                   │
│           │  PriceAggregator    │  ← Takes median of N sources      │
│           │  (TypeScript)       │  ← Validates deviation bounds     │
│           │                     │  ← Caches last known good price   │
│           └─────────┬───────────┘                                   │
│                     │                                               │
│           ┌─────────▼───────────┐                                   │
│           │  OracleService      │  ← Reads on-chain price           │
│           │  (Agent Module)     │  ← Pushes updates when stale      │
│           │                     │  ← Pre-flight check before strat  │
│           └─────────┬───────────┘                                   │
│                     │                                               │
└─────────────────────┼───────────────────────────────────────────────┘
                      │ updatePrice() / updatePrices()
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ON-CHAIN LAYER                                │
│                                                                     │
│  ┌────────────────────────────────────────────────┐                 │
│  │            OracleRegistry.sol                   │                │
│  │                                                 │                │
│  │  asset → OracleFeed {                           │                │
│  │    oracle: KeeperOracle address                 │                │
│  │    heartbeat: uint256                           │                │
│  │    deviationThreshold: uint16 (bps)             │                │
│  │    active: bool                                 │                │
│  │  }                                              │                │
│  │                                                 │                │
│  │  getPrice(asset) → (price, decimals, updatedAt) │                │
│  │  validatePrice(asset, amount, minReturn, slip)  │                │
│  └───────────┬────────────────────────────────────┘                 │
│              │ reads from                                           │
│  ┌───────────▼────────────────────────────────────┐                 │
│  │          KeeperOracle.sol (enhanced)            │                │
│  │                                                 │                │
│  │  • Multi-keeper support (M-of-N)                │                │
│  │  • Historical round storage (ring buffer)       │                │
│  │  • Deviation-triggered updates                  │                │
│  │  • Heartbeat enforcement on-chain               │                │
│  │  • EIP-2362 compatibility layer                 │                │
│  └─────────────────────────────────────────────────┘                │
│                                                                     │
│  ┌─────────────────────────────────────────────────┐                │
│  │            ObidotVault.sol (updated)             │                │
│  │                                                 │                │
│  │  • setOracleRegistry(address)                   │                │
│  │  • _enforceOracleSlippage() reads registry      │                │
│  │  • _validateOutcome() post-strategy validation  │                │
│  └─────────────────────────────────────────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. On-Chain Contracts

### 3.1 Enhanced `KeeperOracle.sol`

**File:** `contracts/src/KeeperOracle.sol`

The existing KeeperOracle is upgraded with the following additions:

#### 3.1.1 Multi-Keeper Support

```solidity
// Current: single KEEPER_ROLE
// New: configurable quorum
uint8 public requiredSignatures; // 1 = current behavior, 2+ = quorum

struct PricePendingUpdate {
    int256 price;
    uint256 submittedAt;
    address[] signers;
}
mapping(uint80 => PricePendingUpdate) public pendingUpdates;
```

**Rationale:** In production, relying on a single keeper key is fragile. With quorum support:
- **Phase 1 (testnet):** `requiredSignatures = 1` — identical to current behavior
- **Phase 2 (mainnet):** `requiredSignatures = 2` — agent + independent bot must agree
- **Phase 3 (mature):** `requiredSignatures = 3` — agent + bot + governance multisig

For our immediate build, we keep `requiredSignatures = 1` (the AI agent as sole keeper) but architect the storage and interface to support quorum later. This is the strongest practical approach: **ship fast, upgrade gracefully**.

#### 3.1.2 Historical Round Storage (Ring Buffer)

```solidity
uint16 public constant MAX_HISTORY = 64; // ~64 updates ≈ 2.6 days at 1h heartbeat

struct RoundData {
    int256 answer;
    uint256 updatedAt;
    address updater;
}
mapping(uint80 => RoundData) internal _rounds;
```

**Rationale:** Enables `getRoundData()` to return actual historical data for:
- TWAP calculations
- Analytics dashboards
- Deviation analysis
- Audit trails

Ring buffer keeps storage bounded (64 slots = predictable gas costs).

#### 3.1.3 Deviation-Triggered Updates

```solidity
/// @notice Minimum price change (bps) to accept an update ahead of heartbeat.
uint16 public deviationThresholdBps; // e.g. 100 = 1%

/// @notice Update price only if deviation exceeds threshold OR heartbeat expired.
function updatePrice(int256 answer) external onlyRole(KEEPER_ROLE) {
    if (answer <= 0) revert InvalidPrice(answer);

    bool heartbeatExpired = block.timestamp - latestTimestamp >= heartbeat;
    bool deviationExceeded = _deviationExceeds(latestAnswer, answer, deviationThresholdBps);

    if (!heartbeatExpired && !deviationExceeded) revert UpdateNotNeeded();

    _pushRound(answer);
}
```

**Rationale:** Saves gas by skipping no-op updates when price hasn't moved. The keeper can attempt frequent updates, but the contract only stores meaningful changes.

#### 3.1.4 On-Chain Heartbeat Enforcement

Currently heartbeat is advisory — only the vault's `ORACLE_STALENESS_THRESHOLD` matters. The enhanced oracle can optionally revert on reads if stale:

```solidity
/// @notice Returns latest price; reverts if stale beyond heartbeat.
function latestRoundDataStrict() external view returns (...) {
    if (block.timestamp - latestTimestamp > heartbeat) revert OracleStale();
    return (currentRoundId, latestAnswer, latestTimestamp, latestTimestamp, currentRoundId);
}
```

The standard `latestRoundData()` remains non-reverting for backward compatibility — staleness is the consumer's responsibility.

### 3.2 New: `OracleRegistry.sol`

**File:** `contracts/src/OracleRegistry.sol`

A registry that maps asset addresses to their respective oracle feeds.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

contract OracleRegistry is AccessControl {

    struct OracleFeed {
        IAggregatorV3 oracle;       // Address of the price feed (KeeperOracle or Pyth)
        uint256 heartbeat;          // Expected update interval
        uint16 deviationBps;        // Deviation threshold for alerting
        bool active;                // Can be disabled without deletion
    }

    /// @notice Asset address => OracleFeed
    mapping(address => OracleFeed) public feeds;

    /// @notice List of all registered asset addresses (for enumeration)
    address[] public registeredAssets;

    // ── Core Functions ──

    /// @notice Register or update an oracle feed for an asset.
    function setFeed(
        address asset,
        address oracle,
        uint256 heartbeat,
        uint16 deviationBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE);

    /// @notice Disable a feed without removing it.
    function disableFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE);

    /// @notice Get the latest price for an asset. Reverts if no active feed.
    function getPrice(address asset)
        external view
        returns (int256 price, uint8 decimals, uint256 updatedAt);

    /// @notice Validate that a strategy's minReturn meets oracle bounds.
    /// @dev    Mirrors _enforceOracleSlippage but works for any registered asset.
    function validateSlippage(
        address asset,
        uint256 amount,
        uint256 minReturn,
        uint16 maxSlippageBps
    ) external view returns (bool valid, uint256 oracleMinimum);

    /// @notice Check staleness of a feed.
    function isFeedStale(address asset) external view returns (bool);

    /// @notice Get count of registered assets.
    function feedCount() external view returns (uint256);
}
```

**Why a Registry?**
- The vault currently has a single `priceOracle` for one asset. Cross-chain strategies involve multiple tokens (DOT, vDOT, BNC).
- `reportStrategyOutcome` could validate returned amounts against the output token's oracle.
- The agent can query all feeds in one multicall before submitting strategies.
- When Pyth deploys, individual feeds can be swapped without touching the vault.

**Vault Integration (two options):**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Vault stores `OracleRegistry` reference, `_enforceOracleSlippage` reads from registry | Clean, flexible | Breaking change to vault constructor |
| B | Keep vault's single `priceOracle`, agent uses registry off-chain for multi-asset validation | No vault changes | Output tokens not validated on-chain |
| **C (recommended)** | Add optional `oracleRegistry` to vault with fallback to `priceOracle` | Backward-compatible, progressive enhancement | Slightly more complex |

**Recommended approach (C):** Add `oracleRegistry` as an optional field in the vault. If set, `_enforceOracleSlippage` tries the registry first (using `intent.asset`), falling back to the single `priceOracle`. This is backward-compatible and lets us progressively add feeds.

### 3.3 Vault Modifications

Minimal changes to `ObidotVault.sol`:

```solidity
// New state variable
OracleRegistry public oracleRegistry; // optional, address(0) = disabled

// New admin function
function setOracleRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
    oracleRegistry = OracleRegistry(_registry);
    emit OracleRegistryUpdated(_registry);
}

// Updated _enforceOracleSlippage
function _enforceOracleSlippage(StrategyIntent calldata intent) internal view {
    int256 answer;
    uint8 oracleDecimals;
    uint256 updatedAt;

    if (address(oracleRegistry) != address(0)) {
        // Try registry for asset-specific feed
        (answer, oracleDecimals, updatedAt) = oracleRegistry.getPrice(intent.asset);
    } else {
        // Fallback to single oracle (backward-compatible)
        (, answer, , updatedAt, ) = priceOracle.latestRoundData();
        oracleDecimals = priceOracle.decimals();
    }

    // ... same validation logic ...
}
```

### 3.4 New: `IOracleConsumer.sol` Interface

**File:** `contracts/src/interfaces/IOracleConsumer.sol`

Standard interface for contracts that consume oracle data, enabling composability:

```solidity
interface IOracleConsumer {
    /// @notice Returns the oracle registry used by this contract.
    function oracleRegistry() external view returns (address);

    /// @notice Returns the single price oracle (legacy).
    function priceOracle() external view returns (address);

    /// @notice Check if the oracle data for a given asset is fresh.
    function isOracleFresh(address asset) external view returns (bool);
}
```

---

## 4. Off-Chain Keeper Service

### 4.1 `PriceAggregator` — Multi-Source Price Engine

**File:** `modules/agent/src/services/price-aggregator.service.ts`

```
┌────────────────────────────────────────────────┐
│            PriceAggregator                     │
│                                                │
│  Sources:                                      │
│    1. Pyth Hermes (price-service.pyth.network) │
│    2. CoinGecko (api.coingecko.com)            │
│    3. Binance (api.binance.com)                │
│    4. SubQuery (future: on-chain TWAP)         │
│                                                │
│  Algorithm:                                    │
│    1. Fetch from all sources in parallel       │
│    2. Discard sources with >5s latency         │
│    3. Discard outliers (>2% from median)       │
│    4. Take median of remaining sources         │
│    5. Validate against last known good price   │
│       (reject >10% jumps without confirmation) │
│    6. Cache result with timestamp              │
│                                                │
│  Output:                                       │
│    { price, confidence, sources, timestamp }   │
│                                                │
│  Pairs:                                        │
│    DOT/USD, vDOT/DOT, BNC/USD, KSM/USD        │
└────────────────────────────────────────────────┘
```

**Key Design Decisions:**

1. **Median over mean**: Resistant to a single compromised source
2. **Outlier rejection**: If one source deviates >2% from the others, drop it
3. **Circuit breaker**: >10% price jump from last known good → require 2+ sources to agree
4. **Graceful degradation**: Works with 1 source if others fail (logs warning)
5. **Confidence score**: 0-100 based on how many sources agree. Strategy decisions can gate on confidence

**Supported price pairs and source coverage:**

| Pair | Pyth | CoinGecko | Binance | Notes |
|------|------|-----------|---------|-------|
| DOT/USD | ✅ | ✅ | ✅ | Primary feed |
| vDOT/DOT | ❌ | ✅ (limited) | ❌ | Bifrost-specific, may need Bifrost RPC |
| BNC/USD | ✅ | ✅ | ✅ | |
| KSM/USD | ✅ | ✅ | ✅ | |

### 4.2 `OracleService` — On-Chain Oracle Manager

**File:** `modules/agent/src/services/oracle.service.ts`

The OracleService is the agent's primary interface with on-chain oracles. It handles:

```typescript
class OracleService {
    // ── Read Operations ──

    /** Read current on-chain price from KeeperOracle */
    async getOnChainPrice(asset: Address): Promise<PriceData>;

    /** Check if the on-chain oracle is stale */
    async isOracleStale(asset: Address): Promise<boolean>;

    /** Read all registered feeds from OracleRegistry */
    async getAllFeeds(): Promise<FeedStatus[]>;

    // ── Write Operations ──

    /** Push a price update to KeeperOracle (requires KEEPER_ROLE) */
    async updatePrice(asset: Address, price: bigint): Promise<TxHash>;

    /** Batch-update multiple feeds in one transaction */
    async updatePrices(updates: PriceUpdate[]): Promise<TxHash>;

    // ── Pre-Flight Checks ──

    /** Ensure oracle is fresh before submitting a strategy.
     *  If stale → fetch from PriceAggregator → push update → wait for confirmation.
     *  Returns the validated price for use in minReturn calculation. */
    async ensureFreshPrice(asset: Address): Promise<PriceData>;

    /** Compute a safe minReturn based on oracle price and slippage */
    computeMinReturn(amount: bigint, price: bigint, slippageBps: number): bigint;

    // ── Monitoring ──

    /** Start heartbeat monitor that pushes updates on schedule */
    startHeartbeatMonitor(intervalMs: number): void;

    /** Stop the heartbeat monitor */
    stopHeartbeatMonitor(): void;
}
```

**Pre-Flight Flow (before every `executeStrategy`):**

```
Agent wants to execute a strategy
  │
  ▼
OracleService.ensureFreshPrice(intent.asset)
  │
  ├─ Is on-chain price stale? (updatedAt > 1h ago)
  │   ├─ No → return current price
  │   └─ Yes ─┐
  │            ▼
  │   PriceAggregator.getPrice(asset)
  │            │
  │            ▼
  │   OracleService.updatePrice(asset, aggregatedPrice)
  │            │
  │            ▼
  │   Wait for tx confirmation
  │            │
  │            ▼
  │   Return new price
  │
  ▼
SignerService.buildStrategy(intent with computed minReturn)
  │
  ▼
Submit executeStrategy transaction
```

### 4.3 Heartbeat Monitor

Runs as a background loop in the agent, independent of strategy execution:

```
Every HEARTBEAT_INTERVAL (e.g. 30 min):
  1. Check all registered feeds for staleness
  2. For any feed approaching staleness (>80% of heartbeat):
     a. Fetch fresh price from PriceAggregator
     b. Check deviation from on-chain price
     c. If deviation > DEVIATION_THRESHOLD or approaching staleness:
        → Push update to KeeperOracle
  3. Log health status of all feeds
```

This ensures the oracle stays fresh even when no strategies are being executed, preventing the vault from auto-pausing due to stale prices.

---

## 5. Agent Integration

### 5.1 New Dependencies

```
modules/agent/src/
├── services/
│   ├── oracle.service.ts        # NEW — On-chain oracle read/write
│   ├── price-aggregator.service.ts  # NEW — Multi-source price fetching
│   ├── signer.service.ts        # MODIFIED — Uses oracle for minReturn
│   └── ...
├── abis/
│   ├── KeeperOracle.json        # NEW — KeeperOracle ABI
│   └── OracleRegistry.json      # NEW — OracleRegistry ABI
├── config/
│   └── oracle.config.ts         # NEW — Price source configs, thresholds
└── types/
    └── oracle.types.ts          # NEW — PriceData, FeedStatus, etc.
```

### 5.2 Environment Variables

```env
# Oracle Configuration
KEEPER_ORACLE_ADDRESS=0x...         # KeeperOracle contract address
ORACLE_REGISTRY_ADDRESS=0x...      # OracleRegistry contract address (optional)
ORACLE_HEARTBEAT_MS=1800000        # 30 min heartbeat check interval
ORACLE_DEVIATION_BPS=100           # 1% deviation threshold

# Price Sources
PYTH_HERMES_URL=https://hermes.pyth.network
COINGECKO_API_KEY=...              # Optional, for higher rate limits
BINANCE_API_URL=https://api.binance.com

# Price Feed IDs (Pyth)
PYTH_DOT_USD_FEED_ID=0xef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52
PYTH_BNC_USD_FEED_ID=0x...
PYTH_KSM_USD_FEED_ID=0x...
```

### 5.3 `SignerService` Modifications

Current gap: `SignerService.buildStrategy()` sets `minReturn` without consulting any oracle. After integration:

```typescript
// Before (current):
intent.minReturn = userSpecifiedMinReturn; // Blind guess or hardcoded

// After (with oracle):
const { price } = await this.oracleService.ensureFreshPrice(intent.asset);
intent.minReturn = this.oracleService.computeMinReturn(
    intent.amount,
    price,
    intent.maxSlippageBps
);
// Now minReturn is oracle-informed and will pass on-chain validation
```

### 5.4 Autonomous Loop Integration

The agent's autonomous loop gains oracle awareness:

```
Autonomous Loop Cycle:
  1. Check oracle health (all feeds fresh?)
     └─ If any feed stale → push update immediately
  2. Evaluate yield opportunities (existing)
  3. For each opportunity:
     a. ensureFreshPrice(asset)
     b. Compute oracle-informed minReturn
     c. Build and sign strategy intent
     d. Submit executeStrategy
  4. Monitor pending strategies
  5. Sleep / wait for next cycle
```

---

## 6. Security Model

### 6.1 Trust Hierarchy

```
Layer 0 (Highest Trust):    Vault Admin (DEFAULT_ADMIN_ROLE)
                             ├── Can setOracle(), setOracleRegistry()
                             ├── Can pause vault in emergency
                             └── Can revoke keeper roles

Layer 1 (Operational Trust): Keeper (KEEPER_ROLE on KeeperOracle)
                             ├── Can push price updates
                             ├── Cannot exceed deviation circuit breaker
                             └── Cannot bypass quorum (when enabled)

Layer 2 (Automated Trust):   AI Agent
                             ├── Holds KEEPER_ROLE + STRATEGIST_ROLE
                             ├── Pushes prices from aggregated sources
                             └── Submits strategies with oracle-informed params

Layer 3 (Permissionless):    Anyone can relay signed intents
                             └── On-chain oracle validation catches bad prices
```

### 6.2 Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|-----------|
| **Keeper pushes manipulated price** | Multi-source aggregation (median). On-chain deviation cap: reject updates >10% from last known price within a single round. Future: multi-keeper quorum. |
| **All sources compromised** | Circuit breaker: if aggregated price deviates >10% from last good, require 2+ sources to agree. Agent logs alert and pauses strategy submission (not oracle). Admin dashboard notification. |
| **Keeper key compromised** | Admin can revoke KEEPER_ROLE immediately. Key rotation: deploy new KeeperOracle, vault.setOracle(newOracle). Consider hardware wallet for keeper key. |
| **Oracle goes stale (keeper down)** | Vault enforces 1h staleness. Heartbeat monitor detects pre-staleness at 80% threshold. Agent health endpoint reports oracle status. Fallback: manual admin update. |
| **Sandwich attack using price update** | KeeperOracle update and strategy execution are separate transactions. Miner/validator could sandwich. Mitigation: bundle oracle-update + strategy-execute in a single transaction (requires contract-level batching or account abstraction). |
| **Flash loan price manipulation** | Not applicable — KeeperOracle prices are pushed, not derived from on-chain liquidity. No flash loan can affect pushed prices. |

### 6.3 On-Chain Deviation Cap (New)

Add to `KeeperOracle`:

```solidity
uint16 public maxDeviationBps; // e.g. 1000 = 10%

function updatePrice(int256 answer) external onlyRole(KEEPER_ROLE) {
    // ... positivity check ...

    // New: deviation cap
    if (latestAnswer > 0) {
        uint256 deviation = _calculateDeviationBps(latestAnswer, answer);
        if (deviation > maxDeviationBps) revert DeviationTooLarge(deviation, maxDeviationBps);
    }

    _pushRound(answer);
}
```

This prevents a compromised keeper from pushing wildly incorrect prices in a single update. Legitimate large moves (e.g. market crash) require admin to temporarily raise the deviation cap or push multiple incremental updates.

---

## 7. Testing Strategy

### 7.1 Unit Tests

| Test Category | Tests |
|--------------|-------|
| **KeeperOracle enhanced** | Multi-keeper quorum, ring buffer read/write, deviation cap, `latestRoundDataStrict()` staleness revert, historical `getRoundData()` |
| **OracleRegistry** | `setFeed`, `disableFeed`, `getPrice` reverts on disabled/missing feed, `validateSlippage`, `isFeedStale`, multi-feed enumeration |
| **Vault + Registry integration** | `_enforceOracleSlippage` with registry, fallback to single oracle when registry not set, registry asset mismatch |
| **Deviation cap** | Update within bounds passes, update exceeding cap reverts, cap adjustment by admin |

### 7.2 Fuzz Tests

```
testFuzz_deviation_cap_boundary(int256 oldPrice, int256 newPrice, uint16 maxDev)
testFuzz_ring_buffer_consistency(uint256 numUpdates)
testFuzz_multi_feed_slippage(address asset, uint256 amount, uint16 slippage)
```

### 7.3 Integration Tests (TypeScript)

```
PriceAggregator:
  - Multi-source median calculation
  - Outlier rejection (1 source deviates)
  - Graceful degradation (2 of 3 sources fail)
  - Circuit breaker (>10% jump)
  - Cache hit/miss behavior

OracleService:
  - Read on-chain price
  - Push update and verify round ID increment
  - Pre-flight: detect stale → fetch → push → return
  - Heartbeat monitor triggers update on schedule

End-to-end:
  - Agent detects stale oracle → updates price → submits strategy → strategy passes
  - Agent detects stale oracle → source unavailable → strategy skipped (not reverted)
```

---

## 8. Migration Roadmap

### Phase 1: Foundation (Current Sprint)

> **Goal:** Agent can read and push oracle prices. Single keeper, single feed.

- [x] `KeeperOracle.sol` exists
- [ ] Add `PriceAggregator` service to agent (Pyth Hermes + CoinGecko + Binance)
- [ ] Add `OracleService` to agent (read/write KeeperOracle)
- [ ] Add KeeperOracle ABI to agent
- [ ] Integrate oracle pre-flight into `SignerService`
- [ ] Add heartbeat monitor to autonomous loop
- [ ] Add env vars for oracle config
- [ ] Tests for all TypeScript services

### Phase 2: Multi-Feed (Next Sprint)

> **Goal:** Support multiple asset price feeds for cross-chain strategies.

- [ ] Deploy `OracleRegistry.sol`
- [ ] Enhance `KeeperOracle.sol` with historical rounds + deviation cap
- [ ] Add optional `oracleRegistry` to `ObidotVault.sol`
- [ ] Agent `OracleService` reads/writes via registry
- [ ] Add vDOT/DOT feed (source: Bifrost RPC or SubQuery)
- [ ] Add BNC/USD feed
- [ ] Validate `reportStrategyOutcome` against output oracle
- [ ] Full Forge test suite for registry

### Phase 3: Hardening (Mainnet Prep)

> **Goal:** Production-grade security and reliability.

- [ ] Multi-keeper quorum (2-of-3)
- [ ] On-chain deviation circuit breaker
- [ ] Admin dashboard for oracle health monitoring
- [ ] Alert system (Telegram/Discord webhook) for stale feeds
- [ ] Formal audit scope includes oracle module
- [ ] Document keeper key management procedures

### Phase 4: Native Oracle Migration

> **Goal:** Migrate to Pyth or native oracle when available on Polkadot Hub.

- [ ] Pyth deploys PythAggregatorV3 on Polkadot Hub
- [ ] Admin calls `oracleRegistry.setFeed(dot, pythDotFeed, ...)`
  - OR: `vault.setOracle(pythDotFeed)` for legacy single-feed
- [ ] Keep KeeperOracle as backup (configurable fallback)
- [ ] Deprecate keeper price-pushing for feeds with native oracles
- [ ] Zero downtime, zero redeployment

---

## 9. Implementation Plan

### 9.1 File Manifest

| # | File | Action | Effort |
|---|------|--------|--------|
| 1 | `contracts/src/KeeperOracle.sol` | Enhance (deviation cap, ring buffer, strict read) | Medium |
| 2 | `contracts/src/OracleRegistry.sol` | Create | Medium |
| 3 | `contracts/src/interfaces/IOracleConsumer.sol` | Create | Small |
| 4 | `contracts/src/ObidotVault.sol` | Add optional `oracleRegistry` + fallback in slippage check | Small |
| 5 | `contracts/test/KeeperOracle.t.sol` | Create (dedicated test file) | Medium |
| 6 | `contracts/test/OracleRegistry.t.sol` | Create | Medium |
| 7 | `contracts/test/ObidotVault.t.sol` | Add registry integration tests | Small |
| 8 | `modules/agent/src/services/price-aggregator.service.ts` | Create | Large |
| 9 | `modules/agent/src/services/oracle.service.ts` | Create | Large |
| 10 | `modules/agent/src/abis/KeeperOracle.json` | Create | Small |
| 11 | `modules/agent/src/abis/OracleRegistry.json` | Create | Small |
| 12 | `modules/agent/src/config/oracle.config.ts` | Create | Small |
| 13 | `modules/agent/src/types/oracle.types.ts` | Create | Small |
| 14 | `modules/agent/src/services/signer.service.ts` | Modify (add oracle pre-flight) | Small |
| 15 | `modules/agent/src/env.ts` | Add oracle env vars | Small |
| 16 | `docs/content/docs/oracle.mdx` | Create (documentation) | Medium |
| 17 | `contracts/script/DeployTestnet.s.sol` | Update (deploy registry) | Small |

### 9.2 Dependency Graph

```
Phase 1 (no vault changes needed):
  KeeperOracle ABI → OracleService → PriceAggregator
                   → SignerService integration
                   → Heartbeat monitor

Phase 2 (vault + registry):
  OracleRegistry.sol → Vault modification
                     → OracleService reads registry
                     → Deploy script updates

Phase 3 (hardening):
  Multi-keeper → Deviation cap → Monitoring → Audit
```

### 9.3 Estimated Effort

| Phase | Duration | Blocking |
|-------|----------|----------|
| Phase 1 | 3-5 days | No — agent can ship independently |
| Phase 2 | 3-4 days | Phase 1 complete |
| Phase 3 | 5-7 days | Phase 2 complete |
| Phase 4 | 1 day | External dependency (Pyth deployment) |

---

## Appendix A: Price Source API Details

### Pyth Hermes API

```
GET https://hermes.pyth.network/v2/updates/price/latest
  ?ids[]=0xef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52

Response: {
  "parsed": [{
    "price": { "price": "700000000", "expo": -8, "conf": "500000" },
    "ema_price": { ... }
  }]
}
```

### CoinGecko API

```
GET https://api.coingecko.com/api/v3/simple/price
  ?ids=polkadot,bifrost-native-coin,kusama
  &vs_currencies=usd
  &precision=8

Response: { "polkadot": { "usd": 7.0 }, ... }
```

### Binance API

```
GET https://api.binance.com/api/v3/ticker/price
  ?symbol=DOTUSDT

Response: { "symbol": "DOTUSDT", "price": "7.00000000" }
```

---

## Appendix B: KeeperOracle Enhanced ABI (Key Additions)

```solidity
// New errors
error UpdateNotNeeded();
error DeviationTooLarge(uint256 deviation, uint256 maxDeviation);
error OracleStale();

// New events
event DeviationCapUpdated(uint16 newCap);

// New functions
function updatePrice(int256 answer) external;              // Enhanced with deviation check
function latestRoundDataStrict() external view returns (...); // Reverts if stale
function setDeviationCap(uint16 bps) external;              // Admin-only
function getRoundData(uint80 roundId) external view returns (...); // Now returns real historical data
```

---

## Appendix C: Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keeper model | Agent as sole keeper (Phase 1), quorum later | Ship fast, strongest practical approach. Quorum adds complexity before there are multiple operators. |
| Price aggregation | Off-chain median | On-chain aggregation costs gas per source. Off-chain median is free and can use more sources. |
| Registry vs. Multi-oracle on vault | Registry contract + optional vault reference | Clean separation of concerns. Vault logic stays simple. |
| Historical storage | Ring buffer (64 rounds) | Bounded gas costs. 64 × 1h = ~2.6 days history is sufficient for TWAP and debugging. |
| Staleness threshold | Keep vault constant (1h) + configurable oracle heartbeat | Vault constant is battle-tested. Oracle heartbeat is informational for keepers. |
| Migration to Pyth | Hot-swap via `setOracle()` / `setFeed()` | Already implemented, zero downtime, no redeployment. |
