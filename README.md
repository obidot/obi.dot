<p align="center">
  <img src="logo.png" alt="Obidot" width="200" />
</p>

<h1 align="center">Obidot — First DEX Aggregator on Polkadot Hub</h1>

<p align="center">
  Non-custodial cross-chain DEX aggregator on Polkadot Hub (PolkaVM).<br/>
  Aggregate liquidity across Polkadot parachains and EVM chains via XCM and Hyperbridge.
</p>

---

## How It Works

Users deposit DOT/USDC into an ERC-4626 vault on Polkadot Hub. The vault routes trades cross-chain — to Polkadot parachains via XCM and to EVM chains via Hyperbridge ISMP. An autonomous AI agent (sub-feature) signs EIP-712 intents for complex multi-hop strategies.

```
┌───────────────────────────────────────────────────────┐
│                Polkadot Hub (PolkaVM)                  │
│                                                       │
│  ObidotVault (ERC-4626)                               │
│       │                                               │
│  ┌────┴────────────┬───────────────┐                  │
│  ▼                 ▼               ▼                  │
│  SwapRouter     XCMExecutor   HyperExecutor           │
│  (9 adapters)   │ XCM precomp  │ ISMP host            │
│                 ▼              ▼                      │
│           Parachains       EVM Chains                 │
│           Hydration        Ethereum                   │
│           Bifrost          Arbitrum                   │
│           Moonbeam…        Base…                      │
└───────────────────────────────────────────────────────┘
         ▲                       ▲
   AI Agent (EIP-712)       Users (deposit/swap)
```

## Repositories

| Repo                                               | Description                                                   |
| -------------------------------------------------- | ------------------------------------------------------------- |
| [obi.router](https://github.com/obidot/obi.router) | Solidity smart contracts (vault, router, executors, adapters) |
| [obi-kit](https://github.com/obidot/obi-kit)       | TypeScript AI agent SDK — LangChain tools + EVM context       |
| [obi.index](https://github.com/obidot/obi.index)   | Event indexer, GraphQL API, autonomous agent backend          |
| **obidot** (this)                                  | Frontend trading terminal + off-chain AI agent                |

## This Repo

```
obidot/
├── modules/agent/    # Off-chain AI agent (LangChain + viem + EIP-712 signing)
├── modules/app/      # Next.js 15 frontend — trading terminal
└── docs/             # Fumadocs documentation site
```

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm

git clone https://github.com/obidot/obidot.git
cd obidot
pnpm install

# Frontend
pnpm --filter app dev         # http://localhost:3000

# AI Agent
pnpm --filter agent dev

# Docs site
pnpm --filter docs dev        # http://localhost:3001
```

## Key Features

| Feature               | Description                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **DEX Aggregation**   | Routes across 9 pool adapters — Hydration, AssetHub, Bifrost, Moonbeam, Interlay, and more |
| **ERC-4626 Vault**    | Tokenized yield vault with deposit caps, circuit breakers, and batch operations            |
| **XCM Cross-Chain**   | Native Polkadot XCM to parachains via the 0xA0000 precompile                               |
| **Hyperbridge**       | ISMP-based bridging to Ethereum, Arbitrum, Base                                            |
| **AI Agent**          | GPT-4o autonomous loop — signs EIP-712 intents, never holds user funds                     |
| **Policy Engine**     | Parachain/protocol whitelist, exposure caps, daily-loss circuit breaker                    |
| **Oracle Protection** | Keeper oracle with staleness checks + 2% max slippage enforcement                          |

## Network

|                      |                                                      |
| -------------------- | ---------------------------------------------------- |
| Polkadot Hub TestNet | `420420417` — `https://eth-rpc-testnet.polkadot.io/` |
| Polkadot Hub Mainnet | `420420419` — `https://eth-rpc.polkadot.io/`         |

## License

MIT
