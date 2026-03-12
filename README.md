# obi.dot

**The First Cross-Chain DEX Aggregator on Polkadot Hub**

Obidot is a non-custodial protocol that aggregates liquidity across the Polkadot ecosystem and connected EVM chains. Users deposit DOT/USDC into an ERC-4626 vault on Polkadot Hub (PolkaVM), trades are routed cross-chain via XCM and Hyperbridge, and an autonomous AI agent (sub-feature) signs EIP-712 intents for complex multi-hop strategies.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Polkadot Hub (PolkaVM)                      │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  ObidotVault │───▶│  SwapRouter  │───▶│ Pool Adapters │  │
│  │  (ERC-4626)  │    │(DEX Aggreg.) │    │ Hydration     │  │
│  │              │    └──────────────┘    │ AssetHub      │  │
│  │              │    ┌──────────────┐    │ Bifrost DEX   │  │
│  │              │───▶│XCM Precompile│───▶│               │  │
│  │              │    │  (0xA0000)   │    └───────────────┘  │
│  │              │    └──────────────┘                        │
│  │              │    ┌──────────────┐    ┌───────────────┐  │
│  │              │───▶│ Hyperbridge  │───▶│  EVM Chains   │  │
│  │              │    │   (ISMP)     │    │ ETH/Arb/Base  │  │
│  └──────┬───────┘    └──────────────┘    └───────────────┘  │
│         │                                                   │
│         ├── Policy Engine (Whitelist · Caps · Circuit Break) │
│         ├── Oracle Registry (KeeperOracle, staleness checks) │
│         └── SlippageGuard (2% max slippage validation)       │
└─────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │  EIP-712 signed intents      │  Deposit / Withdraw / Swap
         │                              │
    ┌────┴─────┐                  ┌─────┴─────┐
    │ AI Agent │                  │   Users   │
    │(sub-feat)│                  │(depositors│
    └──────────┘                  │ + traders)│
                                  └───────────┘
```

## Repository Structure

```
obidot/
├── modules/agent/                # TypeScript — off-chain AI agent (LangChain + viem)
├── modules/app/                  # Next.js 15 — frontend trading terminal
└── docs/                         # Documentation web app
```

> Smart contracts live in [obidot/obi.router](https://github.com/obidot/obi.router).
> SDK lives in [obidot/obi-kit](https://github.com/obidot/obi-kit).

## Quick Start

### Prerequisites

- Node.js 20+, pnpm

### Install

```bash
git clone https://github.com/obidot/obidot.git
cd obidot
pnpm install
```

> For smart contract development, see [obidot/obi.router](https://github.com/obidot/obi.router).

## Network Configuration

| Network              | RPC URL                                  | Chain ID    |
| -------------------- | ---------------------------------------- | ----------- |
| Polkadot Hub TestNet | `https://eth-rpc-testnet.polkadot.io/`   | `420420417` |
| Polkadot Hub Mainnet | `https://eth-rpc.polkadot.io/`           | `420420419` |
| Blockscout (TestNet) | `https://blockscout-testnet.polkadot.io` | —           |

## Key Features

### ERC-4626 Vault

- Fully compliant yield-bearing vault with conservative rounding (favors vault)
- Virtual share offset (`_decimalsOffset = 3`) mitigates inflation attacks
- Deposit caps, pausability, and reentrancy protection
- Dual-balance accounting: local idle assets + remote deployed assets

### AI Strategist Integration

- Off-chain AI agent signs `StrategyIntent` structs via EIP-712
- Universal intent system: `UniversalIntent` for cross-chain and local swaps
- Permissionless relaying: anyone can submit a signed intent
- Per-strategist nonce tracking prevents replay attacks
- Deadline enforcement prevents stale intent execution

### DEX Aggregator (SwapRouter)

- On-hub liquidity aggregation via pluggable pool adapters
- Three adapter types: Hydration Omnipool, AssetHub Pair, Bifrost DEX
- Single-hop, multi-hop, and split swap routing
- Read-only SwapQuoter for best price discovery across all adapters
- Transient storage (EIP-1153) for multi-hop balance tracking
- Vault-integrated local swaps via `executeLocalSwap()`

### On-Chain Policy Engine

- **Parachain Whitelist** — only pre-approved destination chains
- **Protocol Whitelist** — only pre-approved target contracts
- **Exposure Caps** — maximum capital per protocol
- **Circuit Breaker** — auto-pauses vault when daily loss threshold is exceeded

### Oracle-Validated Execution

- Pyth Network (AggregatorV3) price feeds for slippage validation
- Oracle staleness checks (1-hour threshold)
- `minReturn >= amount × price × (1 - maxSlippage)` enforcement

### XCM Cross-Chain Dispatch

- Native XCM precompile integration at `0xA0000`
- Pre-flight weight estimation with 10% safety margin
- `MultiLocation` library for SCALE-encoding XCM destinations

## Security Model

| Layer     | Protection                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Signature | EIP-712 typed data, `ecrecover` with s-value malleability check                   |
| Replay    | Per-signer nonce + deadline + chain-bound domain separator                        |
| Risk      | Parachain/protocol whitelist, exposure caps, daily loss circuit breaker           |
| Oracle    | Staleness checks, positive price validation, slippage bounds                      |
| ERC-4626  | Virtual shares (anti-inflation), conservative rounding, ReentrancyGuard           |
| Access    | Role-based: `DEFAULT_ADMIN_ROLE`, `STRATEGIST_ROLE`, `SOLVER_ROLE`, `KEEPER_ROLE` |
| Emergency | Pause + emergency mode allows proportional withdrawal of idle assets              |

## PolkaVM Deployment

To compile for the Polkadot Hub EVM (PolkaVM/Revive LLVM), use the dedicated `polkadot` profile:

```bash
# Build with the Revive LLVM compiler for PolkaVM
FOUNDRY_PROFILE=polkadot forge build
```

The default profile uses standard `solc` for local testing. The `polkadot` profile enables `resolc_compile = true` which targets the PolkaVM runtime.

## Token Efficiency

- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Just do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.

## License

MIT
