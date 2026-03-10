# Doc Web App Rebuild Plan — `docs/` + `modules/app/`

> **Repo:** `obidot/obidot` (pnpm + Turborepo monorepo)
> **Part A:** `docs/` — Fumadocs documentation site (Next.js 16, Fumadocs 16.6, 14 MDX pages)
> **Part B:** `modules/app/` — Next.js 15 dashboard (`@obidot/app`)
> **Goal:** Fix port mismatch, wire real vault transactions, connect WebSocket, replace demo PnL data, add Zustand stores, implement admin panel, polish docs content

---

## Part A — Documentation Site (`docs/`)

### Current State Summary

| Area | Status |
|---|---|
| Fumadocs framework (16.6.0) | Working — dev on port 4010 |
| 14 MDX documentation pages | **Fully written** — architecture, vault, strategies, oracle, XCM, cross-chain, Bifrost, agent, dashboard, security, deployment |
| Full-text search (Orama) | Working — `src/app/api/search/route.ts` |
| LLM-friendly routes | Working — `/llms.txt`, `/llms-full.txt`, per-page `.mdx` |
| OG image generation | Working — `src/app/og/docs/[...slug]/route.tsx` |
| AI integration buttons | Working — copy markdown, open in GitHub/Scira/ChatGPT/Claude/Cursor (`src/components/ai/page-actions.tsx`) |
| Home page | Working — hero, feature grid, architecture overview, CTA |
| Biome linting | **1 error** — `page-actions.tsx:43` missing explicit `type` prop on `<button>` |

### Phase A.1 — Fix Lint Error

**Priority:** Critical
**File:** `docs/src/components/ai/page-actions.tsx:43`

The button element needs an explicit `type` attribute:

```
File: docs/src/components/ai/page-actions.tsx
Line 43: <button
Add:     <button type="button"
```

### Phase A.2 — Update Contract Addresses in Docs

**Priority:** High
**File:** `docs/content/docs/index.mdx`

Verify all contract addresses match `obi.router/docs/addresses.md`. Currently lists Phase 1 addresses; add Phase 2 addresses:

```markdown
### Phase 2 Contracts

| Contract | Address |
|---|---|
| XCMExecutor | `0xE8FDc9093395eA02017d5D66899F3E04CFF1CF64` |
| HyperExecutor | `0xaEC0009B15449102a39204259d07c2517cf8fC0f` |
| NativeAsset (USDC) | (from obi.router/docs/addresses.md) |
| NativeAsset (DOT) | (from obi.router/docs/addresses.md) |
```

### Phase A.3 — Add obi-kit Documentation Page

**Priority:** High
**Files:** new `docs/content/docs/obi-kit.mdx`, update `docs/content/docs/meta.json`

Create a new page documenting the SDK:

```markdown
---
title: obi-kit SDK
description: Open-source TypeScript SDK for building AI agents on Polkadot
---

## Installation
## Quick Start
## Packages
  - @obidot-kit/core — Types, ABIs, EVM/Polkadot contexts
  - @obidot-kit/llm — 13 LangChain tools
  - @obidot-kit/sdk — ObiKit facade
  - @obidot-kit/cli — Project scaffolding + agent runner
## Tool Reference
  - vault_deposit / vault_withdraw
  - bifrost_yield / bifrost_strategy
  - cross_chain_state / cross_chain_rebalance
  - oracle_check / vault_performance
  - withdrawal_queue / batch_strategies
  - vault_policy / oracle_update / vault_admin
## Configuration
## Examples
```

Add to `meta.json` ordering (after `agent`):

```json
["...", "agent", "obi-kit", "dashboard", "security", "deployment"]
```

### Phase A.4 — Add VaultFactory / Clone Pattern Page

**Priority:** Medium
**Files:** new `docs/content/docs/vault-factory.mdx`, update `meta.json`

Document the EIP-1167 minimal proxy pattern implemented in `VaultFactory.sol`:

```markdown
---
title: Vault Factory
description: EIP-1167 clone pattern for multi-strategy vault deployment
---

## Clone Pattern Overview
## VaultFactory Contract
## deployVault() Flow
## Post-Deploy Configuration
## Gas Savings vs Full Deploy
```

### Phase A.5 — Add NativeAsset Page

**Priority:** Medium
**Files:** new `docs/content/docs/native-asset.mdx`, update `meta.json`

Document `NativeAsset.sol` — the ERC-20 proxy for AssetHub native assets (USDC, DOT):

```markdown
---
title: Native Assets
description: ERC-20 proxy for Polkadot AssetHub native assets
---

## AssetHub Precompile (0x0800)
## NativeAsset Contract
## Supported Assets (USDC #1337, DOT #0)
## Transfer Flow
```

### Phase A.6 — Update Deployment Page

**Priority:** Medium
**File:** `docs/content/docs/deployment.mdx`

The deployment page (661 lines) covers Phase 1 deployment scripts. Add Phase 2 deployment:

- `DeployNew.s.sol` — deploys `XCMExecutor`, `HyperExecutor`, `NativeAsset` x2
- Role grants for executors
- Post-deploy verification commands for Phase 2 contracts

### Phase A.7 — Home Page Improvements

**Priority:** Low
**File:** `docs/src/app/(home)/page.tsx`

- Add link to obi-kit npm packages
- Add link to GitHub repos (obi.router, obi-kit)
- Update feature count (10 tools → 13 tools after obi-kit Phase 7)
- Add "Live on Paseo Testnet" badge

---

## Part B — Dashboard (`modules/app/`)

### Current State Summary

| Area | Status |
|---|---|
| 6 pages (dashboard, strategies, yields, crosschain, agent, insights) | Working UI |
| API proxy (`next.config.ts` → `:3011`) | Working |
| Vault actions (deposit/withdraw) | **UI stub** — `setTimeout` flash, no contract interaction |
| PnL chart | **Demo data** — random candlesticks, labeled "Demo Data" |
| WebSocket hook | **Defined but unused** — `use-websocket.ts` (51 lines) |
| Zustand stores | **Empty** — zustand installed, `src/stores/` does not exist |
| Sidebar component | **Exists but not used** in layout |
| Wallet integration | wagmi v2 + RainbowKit — EVM only, no Polkadot.js |
| DOT price | **Hardcoded as `7`** in `portfolio-optimizer.tsx:103` |
| `@tanstack/react-query` | **Listed twice** in `package.json` |
| Chat widget | Working — calls agent `/api/chat` |
| Insights components (6) | Fully implemented computation engines |

---

### Phase B.1 — Fix Configuration Issues

**Priority:** Critical
**Files:** `modules/app/package.json`, `modules/app/src/lib/constants.ts`

#### B.1.1 Remove Duplicate Dependency

`package.json` lists `@tanstack/react-query` twice (lines 17 and 27). Remove the duplicate.

#### B.1.2 Fix WebSocket URL

`src/lib/constants.ts:24` — `WS_URL` defaults to `ws://localhost:3001/ws` but agent runs on port 3011. Fix to match:

```
File: src/lib/constants.ts
Line ~24: export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
Change to:                                                        "ws://localhost:3011/ws"
```

---

### Phase B.2 — Real Vault Transactions (Deposit/Withdraw)

**Priority:** High
**Files:** `modules/app/src/components/dashboard/vault-actions.tsx`, new `modules/app/src/hooks/use-vault-contract.ts`

#### B.2.1 Current Stub

`vault-actions.tsx` — `handleSubmit()` at approximately line 80:
```typescript
const handleSubmit = async () => {
  setIsLoading(true);
  // Simulated transaction delay
  setTimeout(() => {
    setIsLoading(false);
    setAmount("");
  }, 1500);
};
```

No wallet interaction, no contract call, no transaction hash.

#### B.2.2 Create `useVaultContract` Hook

New file: `modules/app/src/hooks/use-vault-contract.ts`

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { OBIDOT_VAULT_ABI } from "@obidot-kit/core"; // or inline ABI
import { VAULT_ADDRESS, TEST_DOT_ADDRESS } from "@/lib/constants";

export function useVaultDeposit() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const deposit = async (amount: bigint) => {
    // 1. Approve TestDOT spending (if needed)
    // 2. Call vault.deposit(amount, userAddress)
    writeContract({
      address: VAULT_ADDRESS,
      abi: OBIDOT_VAULT_ABI,
      functionName: "deposit",
      args: [amount, userAddress],
    });
  };

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return { deposit, hash, isPending, isConfirming, isSuccess, error };
}

export function useVaultWithdraw() {
  // Similar — calls vault.withdraw(shares, receiver, owner)
}
```

#### B.2.3 Update `vault-actions.tsx`

Replace `setTimeout` stub with `useVaultDeposit()` / `useVaultWithdraw()`:

```typescript
const { deposit, isPending, isConfirming, isSuccess, hash } = useVaultDeposit();

const handleSubmit = async () => {
  const amountWei = parseUnits(amount, 18);
  if (mode === "deposit") {
    await deposit(amountWei);
  } else {
    await withdraw(amountWei);
  }
};
```

Add:
- Transaction status indicators (pending → confirming → success/error)
- Link to block explorer for tx hash
- Toast notification on success/error
- Balance display (user's TestDOT balance + vault share balance)

#### B.2.4 Add ERC-20 Approval Flow

Before deposit, check allowance and prompt approval if needed:

```typescript
export function useTokenApproval(tokenAddress: Address, spenderAddress: Address) {
  // Read current allowance
  // If allowance < amount, request approval
  // Return { approve, allowance, isApproving }
}
```

---

### Phase B.3 — Real PnL Chart Data

**Priority:** High
**Files:** `modules/app/src/components/dashboard/pnl-chart.tsx`, `modules/app/src/lib/api.ts`

#### B.3.1 Current Demo Data

`pnl-chart.tsx` generates random candlestick data with the comment "Demo Data":

```typescript
const generateDemoData = (): CandlestickData[] => {
  // ... random walk generator
};
```

#### B.3.2 Add API Endpoint Call

The agent-rebuild-plan (Phase 6) adds `GET /api/vault/pnl-history` returning time-series P&L data. Wire the chart to this endpoint:

Add to `src/lib/api.ts`:
```typescript
export interface PnlDataPoint {
  timestamp: number;
  pnl: number;
  cumulativePnl: number;
}

export async function getPnlHistory(): Promise<PnlDataPoint[]> {
  return fetchJson<PnlDataPoint[]>("/api/vault/pnl-history");
}
```

Add hook `src/hooks/use-pnl.ts`:
```typescript
export function usePnlHistory() {
  return useQuery({
    queryKey: ["pnl-history"],
    queryFn: getPnlHistory,
    refetchInterval: 60_000, // Refresh every minute
  });
}
```

#### B.3.3 Update Chart Component

Convert `pnl-chart.tsx` to use real data:
- Use `usePnlHistory()` hook
- Convert `PnlDataPoint[]` to candlestick format (OHLC from daily aggregation) or switch to line chart (cumulative P&L is more natural as a line)
- Keep `generateDemoData()` as fallback when API returns no data
- Remove "Demo Data" label when showing real data
- Add loading skeleton while fetching

---

### Phase B.4 — Wire WebSocket to Components

**Priority:** High
**Files:** `modules/app/src/hooks/use-websocket.ts`, multiple components

#### B.4.1 Current State

`use-websocket.ts` is a fully functional WebSocket hook with auto-reconnect, but it's not imported by any component. The agent broadcasts events like `CYCLE_START`, `DECISION`, `EXECUTION`, etc.

#### B.4.2 Create WebSocket Provider

New file: `modules/app/src/components/providers/ws-provider.tsx`

```typescript
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import type { WsEvent } from "@/types";

interface WsContextValue {
  connected: boolean;
  lastEvent: WsEvent | null;
  events: WsEvent[];
}

const WsContext = createContext<WsContextValue>({ connected: false, lastEvent: null, events: [] });

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const { connected } = useWebSocket({
    onEvent: (event) => {
      setLastEvent(event);
      setEvents((prev) => [...prev.slice(-100), event]);
    },
  });

  return (
    <WsContext.Provider value={{ connected, lastEvent, events }}>
      {children}
    </WsContext.Provider>
  );
}

export const useWsContext = () => useContext(WsContext);
```

#### B.4.3 Add Provider to Layout

Update `src/app/layout.tsx` to wrap the app with `<WsProvider>`:

```typescript
<QueryProvider>
  <WsProvider>
    {children}
  </WsProvider>
</QueryProvider>
```

#### B.4.4 Wire to Components

| Component | Event Types | Behavior |
|---|---|---|
| `agent-status.tsx` | `CYCLE_START`, `CYCLE_END` | Show real-time cycle count, last cycle time |
| `decision-feed.tsx` | `DECISION` | Push new decisions to feed without polling |
| `vault-overview.tsx` | `VAULT_STATE` | Update TVL/shares in real-time |
| `health-indicators.tsx` | `ORACLE_UPDATE` | Show oracle freshness in real-time |
| `strategy-table.tsx` | `EXECUTION` | Append new strategy executions |
| `quick-stats.tsx` | `CYCLE_END` | Update cycle count |

Each component adds:
```typescript
const { lastEvent } = useWsContext();

useEffect(() => {
  if (lastEvent?.type === "DECISION") {
    // Invalidate or update local state
    queryClient.invalidateQueries({ queryKey: ["agent-log"] });
  }
}, [lastEvent]);
```

---

### Phase B.5 — Zustand Stores

**Priority:** Medium
**Files:** new `modules/app/src/stores/` directory

#### B.5.1 Current State

Zustand v5 is installed (`"zustand": "^5.0.5"`) but `src/stores/` directory doesn't exist. All state is in TanStack Query (server cache) or local component state.

#### B.5.2 Create Vault Store

New file: `modules/app/src/stores/vault-store.ts`

```typescript
import { create } from "zustand";

interface VaultStore {
  // User's position
  userShares: bigint;
  userDeposited: bigint;
  pendingWithdrawals: bigint;

  // Vault totals
  totalAssets: bigint;
  totalShares: bigint;
  sharePrice: bigint;

  // Actions
  setUserPosition: (shares: bigint, deposited: bigint) => void;
  setVaultState: (state: Partial<VaultStore>) => void;
  reset: () => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  // ... initial state and actions
}));
```

#### B.5.3 Create Settings Store

New file: `modules/app/src/stores/settings-store.ts`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsStore {
  theme: "light" | "dark" | "system";
  refreshInterval: number; // ms
  showTestnetWarning: boolean;
  setTheme: (theme: SettingsStore["theme"]) => void;
  setRefreshInterval: (ms: number) => void;
  dismissTestnetWarning: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "system",
      refreshInterval: 30_000,
      showTestnetWarning: true,
      // ... actions
    }),
    { name: "obidot-settings" },
  ),
);
```

#### B.5.4 Create Agent Store

New file: `modules/app/src/stores/agent-store.ts`

```typescript
interface AgentStore {
  isOnline: boolean;
  currentCycle: number;
  lastDecision: AgentDecision | null;
  setOnline: (online: boolean) => void;
  setCycle: (cycle: number) => void;
  setLastDecision: (decision: AgentDecision) => void;
}
```

---

### Phase B.6 — Fix DOT Price Hardcoding

**Priority:** Medium
**Files:** `modules/app/src/components/insights/portfolio-optimizer.tsx`

#### B.6.1 Current Issue

`portfolio-optimizer.tsx:103`:
```typescript
Number(BigInt(vault.totalAssets || "0")) / 1e18 * 7
```

The `* 7` is a hardcoded DOT price estimate.

#### B.6.2 Solution

Get real DOT price from the oracle via the agent API. Add to `src/lib/api.ts`:

```typescript
export async function getOraclePrice(asset?: string): Promise<{ price: number; updatedAt: number }> {
  return fetchJson<{ price: number; updatedAt: number }>(`/api/oracle/price${asset ? `?asset=${asset}` : ""}`);
}
```

Create hook `src/hooks/use-oracle-price.ts`:
```typescript
export function useOraclePrice() {
  return useQuery({
    queryKey: ["oracle-price"],
    queryFn: () => getOraclePrice(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
```

Update `portfolio-optimizer.tsx` to use the hook instead of `* 7`.

Fallback: if the oracle price API is unavailable, use a default of `7` with a visual indicator showing "estimated price".

---

### Phase B.7 — Sidebar Integration

**Priority:** Medium
**Files:** `modules/app/src/components/layout/sidebar.tsx`, `modules/app/src/app/layout.tsx`

#### B.7.1 Current State

`sidebar.tsx` (76 lines) is a complete sidebar component with nav items, but it's not used in the layout. The layout only uses `<Navbar>`.

#### B.7.2 Implementation

Update `src/app/layout.tsx` to include the sidebar in a responsive layout:

```typescript
<body>
  <QueryProvider>
    <WsProvider>
      <div className="flex min-h-screen">
        {/* Sidebar — hidden on mobile, visible on lg+ */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Sidebar />
        </aside>
        {/* Main content */}
        <main className="flex-1">
          <Navbar />
          {children}
        </main>
      </div>
    </WsProvider>
  </QueryProvider>
</body>
```

Add mobile hamburger toggle to `<Navbar>` that shows/hides sidebar as a slide-over overlay.

---

### Phase B.8 — Wallet Connection UI

**Priority:** Medium
**Files:** `modules/app/src/components/layout/navbar.tsx`, `modules/app/src/lib/wagmi.ts`

#### B.8.1 Current State

wagmi config (`wagmi.ts`, 10 lines) is configured for Polkadot Hub Testnet. RainbowKit is installed. But there's no visible wallet connect button in the UI — the navbar has a placeholder or no connect CTA.

#### B.8.2 Add RainbowKit Provider

Update `src/app/layout.tsx` to add `<RainbowKitProvider>`:

```typescript
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

<WagmiProvider config={wagmiConfig}>
  <QueryProvider>
    <RainbowKitProvider>
      <WsProvider>
        {children}
      </WsProvider>
    </RainbowKitProvider>
  </QueryProvider>
</WagmiProvider>
```

#### B.8.3 Add Connect Button to Navbar

```typescript
import { ConnectButton } from "@rainbow-me/rainbowkit";

// In Navbar component
<ConnectButton
  chainStatus="icon"
  showBalance={true}
  accountStatus="address"
/>
```

#### B.8.4 Gate Vault Actions on Wallet Connection

In `vault-actions.tsx`, disable deposit/withdraw buttons when wallet is not connected:

```typescript
const { isConnected } = useAccount();

<Button disabled={!isConnected || isPending}>
  {!isConnected ? "Connect Wallet" : isPending ? "Confirming..." : mode === "deposit" ? "Deposit" : "Withdraw"}
</Button>
```

---

### Phase B.9 — Admin Panel Page

**Priority:** Low
**Files:** new `modules/app/src/app/admin/page.tsx`, new components

#### B.9.1 New Route: `/admin`

Create `src/app/admin/page.tsx` with:

- **Vault Admin Panel**: Pause/unpause vault, set deposit caps, manage roles
- **Oracle Admin**: Update oracle prices (KeeperOracle), view staleness
- **Policy Manager**: Set protocol whitelists, exposure caps, circuit breaker threshold
- **Strategy Queue**: View pending strategies, approve/reject

All admin actions require the connected wallet to hold the appropriate roles (`ADMIN_ROLE`, `KEEPER_ROLE`, `STRATEGIST_ROLE`).

#### B.9.2 Components

```
src/components/admin/
├── vault-admin.tsx      — Pause/unpause, deposit cap, role management
├── oracle-admin.tsx     — Price update form, staleness display
├── policy-manager.tsx   — Protocol whitelist, exposure caps
└── strategy-queue.tsx   — Pending strategy list with approve/reject
```

Each component:
- Reads current state via `useReadContract` (wagmi)
- Writes via `useWriteContract` with role checks
- Disables actions when wallet doesn't hold required role

---

### Phase B.10 — Mobile Responsiveness

**Priority:** Low
**Files:** Multiple component files

#### B.10.1 Audit

The following components need mobile breakpoint adjustments:
- `chain-topology.tsx` (280 lines) — SVG/canvas visualization needs responsive container
- `yield-comparison.tsx` (279 lines) — dual-select radar chart layout
- `risk-matrix.tsx` (208 lines) — scatter plot needs responsive sizing
- `satellite-table.tsx` (317 lines) — wide table needs horizontal scroll or column hiding

#### B.10.2 Implementation

For each component:
- Add `overflow-x-auto` wrappers for wide tables
- Use Tailwind responsive classes (`hidden sm:block`, `grid-cols-1 md:grid-cols-2`)
- Resize chart containers proportionally
- Stack side-by-side layouts vertically on mobile

---

### Phase B.11 — Docker & Deployment

**Priority:** Low
**Files:** new `modules/app/Dockerfile`, update `docker-compose.yml`

This is covered in the agent-rebuild-plan (Phase 8). The app Dockerfile creates a production Next.js build and serves on port 3010. The `docker-compose.yml` at monorepo root wires agent + app together.

---

## Cross-Module Dependencies

```
obi.router (contracts — complete)
     │
     ├── ABI artifacts → obi-kit Phase 1 (ABI sync)
     ├── Contract addresses → docs Phase A.2, app Phase B.1
     └── Deployed contracts → app Phase B.2 (vault txs)

obi-kit (SDK)
     │
     ├── @obidot-kit/core ABIs → app Phase B.2 (vault contract hook)
     ├── @obidot-kit/core types → app types alignment
     └── Tool set → agent Phase 2 (tool migration)

agent (modules/agent/)
     │
     ├── API endpoints → app Phase B.3 (PnL), B.6 (oracle price)
     ├── WebSocket → app Phase B.4 (real-time events)
     └── Port 3011 → app Phase B.1 (WS URL fix)
```

### Recommended Execution Order

1. **First**: obi-kit Phase 1 (ABI sync) — unblocks everything
2. **Second** (parallel):
   - Agent Phase 1 (port + address fix) — unblocks app WS + API
   - Docs Phase A.1-A.3 (lint fix, addresses, obi-kit page)
   - App Phase B.1 (config fixes)
3. **Third** (parallel):
   - obi-kit Phases 2-4 (real services)
   - Agent Phases 2-3 (tool migration, real APY)
   - App Phase B.2 (vault transactions)
   - App Phase B.4 (WebSocket)
4. **Fourth**:
   - Agent Phase 6 (persistence) → App Phase B.3 (real PnL, depends on agent PnL API)
   - App Phases B.5-B.8 (stores, DOT price, sidebar, wallet UI)
5. **Last**:
   - Docs Phases A.4-A.7 (new pages, polish)
   - App Phases B.9-B.11 (admin panel, mobile, Docker)
   - obi-kit Phase 9 (v0.2.0 release)

---

## Verification Checklist

### Docs (`docs/`)

- [ ] `pnpm --filter docs run build` — succeeds with 0 errors
- [ ] `pnpm --filter docs run lint` — 0 Biome errors (page-actions.tsx fixed)
- [ ] All 14+ MDX pages render correctly at `localhost:4010/docs/`
- [ ] Full-text search returns results for "vault", "XCM", "Bifrost"
- [ ] `/llms.txt` returns valid page listing
- [ ] OG images generate for all pages
- [ ] New obi-kit page renders with tool reference table
- [ ] Contract addresses match `obi.router/docs/addresses.md`

### App (`modules/app/`)

- [ ] `pnpm --filter @obidot/app run build` — succeeds
- [ ] `pnpm --filter @obidot/app run typecheck` — 0 errors
- [ ] App starts on port 3010
- [ ] Wallet connects via RainbowKit (Polkadot Hub Testnet)
- [ ] Deposit/withdraw sends real vault transactions (with approval flow)
- [ ] Transaction hash links to block explorer
- [ ] PnL chart shows real data from `/api/vault/pnl-history`
- [ ] WebSocket connects to `ws://localhost:3011/ws`
- [ ] Agent status updates in real-time via WebSocket
- [ ] Decision feed receives live decisions without polling
- [ ] Zustand settings store persists across page refreshes
- [ ] DOT price fetched from oracle API (fallback to estimate with label)
- [ ] Sidebar visible on desktop, hamburger menu on mobile
- [ ] Admin panel page renders (actions gated by wallet roles)
- [ ] All pages render on mobile without horizontal overflow

---

## File Manifest

### Part A — Docs

| File | Action | Phase |
|---|---|---|
| `docs/src/components/ai/page-actions.tsx` | MODIFY — add `type="button"` | A.1 |
| `docs/content/docs/index.mdx` | MODIFY — add Phase 2 addresses | A.2 |
| `docs/content/docs/obi-kit.mdx` | CREATE — SDK documentation | A.3 |
| `docs/content/docs/meta.json` | MODIFY — add new page ordering | A.3, A.4, A.5 |
| `docs/content/docs/vault-factory.mdx` | CREATE — VaultFactory docs | A.4 |
| `docs/content/docs/native-asset.mdx` | CREATE — NativeAsset docs | A.5 |
| `docs/content/docs/deployment.mdx` | MODIFY — add Phase 2 deployment | A.6 |
| `docs/src/app/(home)/page.tsx` | MODIFY — links, badges | A.7 |

### Part B — App

| File | Action | Phase |
|---|---|---|
| `modules/app/package.json` | MODIFY — remove duplicate dep | B.1 |
| `modules/app/src/lib/constants.ts` | MODIFY — fix WS_URL port | B.1 |
| `modules/app/src/hooks/use-vault-contract.ts` | CREATE — deposit/withdraw hooks | B.2 |
| `modules/app/src/components/dashboard/vault-actions.tsx` | REWRITE — real contract calls | B.2 |
| `modules/app/src/lib/api.ts` | MODIFY — add getPnlHistory(), getOraclePrice() | B.3, B.6 |
| `modules/app/src/hooks/use-pnl.ts` | CREATE — PnL history hook | B.3 |
| `modules/app/src/components/dashboard/pnl-chart.tsx` | MODIFY — real data + fallback | B.3 |
| `modules/app/src/components/providers/ws-provider.tsx` | CREATE — WebSocket context | B.4 |
| `modules/app/src/app/layout.tsx` | MODIFY — add WsProvider, RainbowKit, sidebar | B.4, B.7, B.8 |
| `modules/app/src/components/agent/agent-status.tsx` | MODIFY — wire WS events | B.4 |
| `modules/app/src/components/agent/decision-feed.tsx` | MODIFY — wire WS events | B.4 |
| `modules/app/src/components/dashboard/vault-overview.tsx` | MODIFY — wire WS events | B.4 |
| `modules/app/src/components/dashboard/health-indicators.tsx` | MODIFY — wire WS events | B.4 |
| `modules/app/src/components/strategies/strategy-table.tsx` | MODIFY — wire WS events | B.4 |
| `modules/app/src/stores/vault-store.ts` | CREATE | B.5 |
| `modules/app/src/stores/settings-store.ts` | CREATE | B.5 |
| `modules/app/src/stores/agent-store.ts` | CREATE | B.5 |
| `modules/app/src/hooks/use-oracle-price.ts` | CREATE | B.6 |
| `modules/app/src/components/insights/portfolio-optimizer.tsx` | MODIFY — use real DOT price | B.6 |
| `modules/app/src/components/layout/sidebar.tsx` | MODIFY — responsive | B.7 |
| `modules/app/src/components/layout/navbar.tsx` | MODIFY — add ConnectButton, hamburger | B.7, B.8 |
| `modules/app/src/lib/wagmi.ts` | MODIFY — ensure correct config | B.8 |
| `modules/app/src/app/admin/page.tsx` | CREATE | B.9 |
| `modules/app/src/components/admin/vault-admin.tsx` | CREATE | B.9 |
| `modules/app/src/components/admin/oracle-admin.tsx` | CREATE | B.9 |
| `modules/app/src/components/admin/policy-manager.tsx` | CREATE | B.9 |
| `modules/app/src/components/admin/strategy-queue.tsx` | CREATE | B.9 |
| `modules/app/src/components/crosschain/chain-topology.tsx` | MODIFY — responsive | B.10 |
| `modules/app/src/components/crosschain/satellite-table.tsx` | MODIFY — responsive | B.10 |
| `modules/app/src/components/insights/yield-comparison.tsx` | MODIFY — responsive | B.10 |
| `modules/app/src/components/insights/risk-matrix.tsx` | MODIFY — responsive | B.10 |
| `modules/app/Dockerfile` | CREATE | B.11 |
