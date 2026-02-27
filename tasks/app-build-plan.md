# Obidot App Build Plan — Frontend + Shared Backend

> Build a production-grade Next.js app (`modules/app`) with a dark DeFi aesthetic,
> TradingView charts, wallet integration, AI chat widget, and real-time WebSocket updates.
> The app shares a backend API with the Telegram bot and autonomous agent loop.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                        │
│  modules/app/                                                  │
│                                                                │
│  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Dashboard │ │ Strategies │ │ Yield      │ │ Cross-Chain  │  │
│  │ (vault)   │ │ (history)  │ │ Explorer   │ │ Overview     │  │
│  └──────────┘ └────────────┘ └────────────┘ └──────────────┘  │
│  ┌──────────────┐ ┌──────────────────────────────────────────┐ │
│  │ Agent Log    │ │ AI Chat Widget (floating, all pages)     │ │
│  └──────────────┘ └──────────────────────────────────────────┘ │
│                                                                │
│  Wallet: SubWallet + Polkadot.js + MetaMask (wagmi/RainbowKit) │
│  Charts: TradingView Lightweight Charts                        │
│  Style: Tailwind CSS + shadcn/ui, dark DeFi + terminal hybrid  │
│  Deploy: Vercel                                                │
└───────────────────────┬────────────────────────────────────────┘
                        │ HTTP API + WebSocket
                        │
┌───────────────────────▼────────────────────────────────────────┐
│              Shared API Server (modules/agent)                  │
│                                                                │
│  Express/Fastify HTTP endpoints:                               │
│  ├── GET  /api/vault/state       → on-chain vault reads        │
│  ├── GET  /api/vault/performance → PnL, fees, high-water mark  │
│  ├── GET  /api/yields            → DeFiLlama + Bifrost yields  │
│  ├── GET  /api/strategies        → strategy execution history  │
│  ├── GET  /api/crosschain/state  → satellite vault states      │
│  ├── GET  /api/oracle/status     → oracle prices, staleness    │
│  ├── GET  /api/agent/log         → agent decision log          │
│  ├── POST /api/chat              → AI chat (same as Telegram)  │
│  └── WS   /ws                    → real-time vault/agent events│
│                                                                │
│  + Telegram Bot (grammy, long-polling)                         │
│  + Autonomous Loop (perception → reasoning → execution)        │
└────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR/SSG, API routes, Vercel deploy |
| Language | TypeScript 5.7+ strict | Type safety |
| Styling | Tailwind CSS 4 + shadcn/ui | Dark DeFi theme, accessible components |
| Charts | TradingView Lightweight Charts | PnL, yield comparison, strategy perf |
| Wallet (EVM) | wagmi v2 + RainbowKit | MetaMask, SubWallet EVM |
| Wallet (Polkadot) | @polkadot/extension-dapp | Polkadot.js, SubWallet Substrate |
| State | Zustand + TanStack Query | Client state + server state caching |
| Real-time | WebSocket (native) | Live vault events, agent decisions |
| API Server | Fastify (in modules/agent) | Shared backend for web + Telegram |
| Icons | Lucide React | Consistent icon set |
| Deploy | Vercel | Edge CDN, preview deploys |

---

## Phase 1: API Server (modules/agent)

Add a Fastify HTTP + WebSocket server to `modules/agent` that runs alongside the
autonomous loop and Telegram bot. All three share the same service instances.

### 1.1 Endpoints

| Endpoint | Method | Source Service | Description |
|----------|--------|---------------|-------------|
| `/api/vault/state` | GET | SignerService | totalAssets, idle, remote, paused, emergency, nonce |
| `/api/vault/performance` | GET | SignerService | cumulativePnL, highWaterMark, feeAccrued |
| `/api/yields` | GET | YieldService | All protocol yields (DeFiLlama + Bifrost) |
| `/api/yields/bifrost` | GET | YieldService | Bifrost-specific yields (SLP, DEX, Farm, SALP) |
| `/api/strategies` | GET | New StrategyStore | Past strategy intents + outcomes |
| `/api/crosschain/state` | GET | CrossChainService | Hub + satellite vault states |
| `/api/oracle/status` | GET | OracleService | Current price, staleness, circuit breaker |
| `/api/agent/log` | GET | New AgentLogStore | Recent AI decisions + reasoning |
| `/api/chat` | POST | AgentRunner | Send message, get AI response (same as Telegram) |
| `/ws` | WS | EventBus | Real-time: vault events, strategy executions, agent decisions |

### 1.2 WebSocket Events

```typescript
type WsEvent =
  | { type: "vault:stateUpdate"; data: VaultState }
  | { type: "strategy:executed"; data: StrategyExecution }
  | { type: "strategy:outcome"; data: StrategyOutcome }
  | { type: "agent:decision"; data: AgentDecision }
  | { type: "oracle:priceUpdate"; data: PriceUpdate }
  | { type: "crosschain:sync"; data: CrossChainSync };
```

### 1.3 Files to Create/Modify

- `modules/agent/src/api/server.ts` — Fastify server setup, CORS, WebSocket
- `modules/agent/src/api/routes/vault.ts` — Vault endpoints
- `modules/agent/src/api/routes/yields.ts` — Yield endpoints
- `modules/agent/src/api/routes/strategies.ts` — Strategy history
- `modules/agent/src/api/routes/crosschain.ts` — Cross-chain state
- `modules/agent/src/api/routes/oracle.ts` — Oracle status
- `modules/agent/src/api/routes/agent.ts` — Agent log + chat
- `modules/agent/src/api/ws.ts` — WebSocket handler
- `modules/agent/src/services/event-bus.service.ts` — EventEmitter for WS broadcast
- `modules/agent/src/services/strategy-store.service.ts` — In-memory strategy history
- `modules/agent/src/main.ts` — Start API server alongside loop + Telegram

---

## Phase 2: Next.js App Scaffold (modules/app)

### 2.1 Directory Structure

```
modules/app/
├── public/
│   ├── images/              # Brand assets, illustrations
│   ├── fonts/               # Custom fonts (Inter, JetBrains Mono)
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout (dark theme, wallet providers, fonts)
│   │   ├── page.tsx         # Dashboard (main vault page)
│   │   ├── strategies/
│   │   │   └── page.tsx     # Strategy history + performance
│   │   ├── yields/
│   │   │   └── page.tsx     # Yield explorer
│   │   ├── crosschain/
│   │   │   └── page.tsx     # Cross-chain overview
│   │   ├── agent/
│   │   │   └── page.tsx     # Agent activity log
│   │   └── globals.css      # Tailwind base + DeFi theme vars
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx      # Navigation sidebar with glow accents
│   │   │   ├── header.tsx       # Top bar: wallet connect, network badge
│   │   │   └── mobile-nav.tsx   # Mobile bottom navigation
│   │   ├── dashboard/
│   │   │   ├── vault-overview.tsx   # Total assets, idle, remote cards
│   │   │   ├── pnl-chart.tsx        # TradingView Lightweight area chart
│   │   │   ├── vault-actions.tsx     # Deposit/withdraw form
│   │   │   ├── health-indicators.tsx # Paused, emergency, daily loss gauges
│   │   │   └── quick-stats.tsx       # APY, fees, shares owned
│   │   ├── strategies/
│   │   │   ├── strategy-table.tsx    # Sortable table with status badges
│   │   │   ├── strategy-detail.tsx   # Slide-over detail panel
│   │   │   └── strategy-chart.tsx    # Per-strategy PnL sparkline
│   │   ├── yields/
│   │   │   ├── yield-grid.tsx        # Card grid with protocol logos
│   │   │   ├── yield-comparison.tsx  # Bar chart comparing APYs
│   │   │   └── protocol-card.tsx     # Individual protocol yield card
│   │   ├── crosschain/
│   │   │   ├── chain-map.tsx         # Visual chain topology
│   │   │   ├── satellite-table.tsx   # Satellite vault balances
│   │   │   └── rebalance-flow.tsx    # Animated flow between chains
│   │   ├── agent/
│   │   │   ├── decision-feed.tsx     # Live scrolling agent decisions
│   │   │   ├── decision-card.tsx     # Individual decision with reasoning
│   │   │   └── agent-status.tsx      # Agent uptime, cycle count, status
│   │   ├── chat/
│   │   │   ├── chat-widget.tsx       # Floating bottom-right chat bubble
│   │   │   ├── chat-window.tsx       # Expandable chat window
│   │   │   └── message-bubble.tsx    # User/AI message styling
│   │   ├── wallet/
│   │   │   ├── connect-button.tsx    # Combined EVM + Polkadot connect
│   │   │   ├── wallet-modal.tsx      # Wallet selection modal
│   │   │   └── account-display.tsx   # Connected account badge
│   │   └── ui/                       # shadcn/ui components (auto-generated)
│   ├── hooks/
│   │   ├── use-vault-state.ts        # TanStack Query for vault state
│   │   ├── use-yields.ts             # TanStack Query for yields
│   │   ├── use-strategies.ts         # TanStack Query for strategy history
│   │   ├── use-crosschain.ts         # TanStack Query for cross-chain state
│   │   ├── use-agent-log.ts          # TanStack Query for agent decisions
│   │   ├── use-websocket.ts          # WebSocket connection + event dispatch
│   │   └── use-chat.ts               # Chat state + API calls
│   ├── lib/
│   │   ├── api.ts                    # Typed API client (fetch wrapper)
│   │   ├── ws.ts                     # WebSocket client with reconnect
│   │   ├── format.ts                 # Number/address/time formatters
│   │   ├── chains.ts                 # Chain definitions + RPC URLs
│   │   └── constants.ts              # Contract addresses, ABIs
│   ├── stores/
│   │   ├── vault-store.ts            # Zustand: real-time vault state
│   │   ├── chat-store.ts             # Zustand: chat messages
│   │   └── notification-store.ts     # Zustand: toast notifications
│   └── types/
│       └── index.ts                  # Shared frontend types
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── components.json                   # shadcn/ui config
```

### 2.2 Design System

**Color Palette (Dark DeFi + Terminal Hybrid):**

```
Background:      #0a0a0f (near-black with subtle blue)
Surface:         #12121a (card backgrounds)
Surface Hover:   #1a1a28
Border:          #1e1e2e (subtle borders)
Primary:         #00ff88 (neon green — success, deposits)
Secondary:       #7c3aed (purple — accent, selections)
Accent:          #06b6d4 (cyan — links, info)
Warning:         #f59e0b (amber)
Danger:          #ef4444 (red — losses, errors)
Text Primary:    #e2e8f0 (light gray)
Text Secondary:  #94a3b8 (muted)
Text Muted:      #64748b (disabled)
Glow Green:      0 0 20px rgba(0,255,136,0.3)
Glow Purple:     0 0 20px rgba(124,58,237,0.3)
```

**Typography:**
- Headings: Inter (700, 600)
- Body: Inter (400, 500)
- Code/numbers: JetBrains Mono (monospace, for addresses, amounts, APYs)

**Component Style:**
- Cards: `bg-surface rounded-xl border border-border backdrop-blur-sm`
- Glassmorphism on hero sections: `bg-white/5 backdrop-blur-xl`
- Glow accents on active elements and hover states
- Gradient borders on primary CTAs: `bg-gradient-to-r from-primary to-secondary`
- Data-dense tables with monospace numbers (terminal feel)
- Smooth transitions (200ms) on all interactive elements

---

## Phase 3: Dashboard Page (Main Vault View)

The landing page — the most important screen.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ [Sidebar]  │  [Header: Network Badge | Wallet Connect]  │
│            │─────────────────────────────────────────────│
│ Dashboard  │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│ Strategies │  │Total    │ │Idle     │ │Remote   │      │
│ Yields     │  │Assets   │ │Balance  │ │Assets   │      │
│ X-Chain    │  │$xxx,xxx │ │$xxx,xxx │ │$xxx,xxx │      │
│ Agent Log  │  └─────────┘ └─────────┘ └─────────┘      │
│            │                                             │
│            │  ┌──────────────────────────────────────┐   │
│            │  │  PnL Chart (TradingView)             │   │
│            │  │  [1D] [1W] [1M] [ALL]                │   │
│            │  │  ████████████████████                 │   │
│            │  └──────────────────────────────────────┘   │
│            │                                             │
│            │  ┌────────────────┐  ┌──────────────────┐   │
│            │  │ Deposit/       │  │ Health           │   │
│            │  │ Withdraw       │  │ Indicators       │   │
│            │  │ [Amount] [GO]  │  │ ● Paused: No     │   │
│            │  │                │  │ ● Emergency: No  │   │
│            │  └────────────────┘  │ ● Daily Loss: 0% │   │
│            │                      └──────────────────┘   │
│            │                                     [Chat💬]│
└─────────────────────────────────────────────────────────┘
```

---

## Phase 4: Strategies Page

| Element | Description |
|---------|-------------|
| Strategy Table | Sortable by date, amount, status, PnL. Status badges (Sent, Executed, Failed) |
| Strategy Detail | Slide-over panel with full intent data, EIP-712 signature, tx hash, outcome |
| Performance Chart | Per-strategy PnL over time (TradingView sparklines) |
| Filters | By status, protocol, date range, parachain |

---

## Phase 5: Yield Explorer

| Element | Description |
|---------|-------------|
| Protocol Cards | Grid of yield sources with logos, APY, TVL, risk rating |
| Comparison Chart | Horizontal bar chart comparing APYs across protocols |
| Bifrost Section | Dedicated area for SLP, DEX, Farming, SALP with category icons |
| Risk Indicators | Color-coded risk levels (Low/SLP, Medium/DEX, High/Farming) |
| Auto-refresh | Live APY updates via WebSocket |

---

## Phase 6: Cross-Chain Overview

| Element | Description |
|---------|-------------|
| Chain Topology | Visual diagram of Hub ↔ Satellite connections with animated flows |
| Satellite Table | Chain name, vault address, balance, last sync, status |
| Rebalance History | Recent cross-chain transfers with amounts and directions |
| Global Metrics | Total cross-chain TVL, distribution pie chart |

---

## Phase 7: Agent Activity Log

| Element | Description |
|---------|-------------|
| Decision Feed | Real-time scrolling feed of agent decisions |
| Decision Cards | Action type, reasoning, amount, target, timestamp |
| Status Badge | Agent status (Running, Sleeping, Error) with cycle count |
| Filter | By action type (REALLOCATE, BIFROST_STRATEGY, NO_ACTION) |

---

## Phase 8: AI Chat Widget

| Element | Description |
|---------|-------------|
| Floating Button | Bottom-right chat bubble with pulse animation |
| Chat Window | Expandable panel with message history |
| Message Bubbles | User (right, purple) and AI (left, dark surface) |
| Tool Indicators | Show when AI is calling tools (loading dots) |
| Shared Agent | Same LangChain runner as Telegram bot |

---

## Phase 9: Wallet Integration

### EVM Wallets (wagmi + RainbowKit)
- MetaMask, SubWallet (EVM mode), WalletConnect
- Auto-detect Polkadot Hub Testnet chain
- Add network prompt if chain not configured

### Polkadot Wallets (@polkadot/extension-dapp)
- Polkadot.js extension, SubWallet (Substrate mode), Talisman
- Detect and list all connected Substrate accounts
- Display SS58 address + balance

### Combined Connect Button
- Single button that opens a modal with two tabs: "EVM" and "Polkadot"
- Shows connected status for both sides
- Account badge in header shows active wallet(s)

---

## Build Order (Priority Sequence)

1. **Phase 1** — API server in modules/agent (foundation for everything)
2. **Phase 2** — Next.js scaffold, theme, layout, wallet providers
3. **Phase 3** — Dashboard (highest impact, first impression)
4. **Phase 8** — AI Chat Widget (unique differentiator)
5. **Phase 9** — Wallet integration (required for deposits/withdraws)
6. **Phase 5** — Yield Explorer (demonstrates data richness)
7. **Phase 4** — Strategies (shows agent decision history)
8. **Phase 6** — Cross-Chain Overview (shows multi-chain architecture)
9. **Phase 7** — Agent Activity Log (demonstrates autonomy)

---

## Dependencies to Install (modules/app)

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "wagmi": "^2.0.0",
    "@rainbow-me/rainbowkit": "^2.0.0",
    "viem": "^2.23.0",
    "@polkadot/extension-dapp": "^0.56.0",
    "lightweight-charts": "^4.2.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "typescript": "^5.7.0",
    "@types/react": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```
