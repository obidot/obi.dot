# obi.dot

**Autonomous Cross-Chain Finance Layer for Polkadot**

Obidot is an ERC-4626 yield-bearing vault deployed to the Polkadot Hub EVM (REVM) that allows an off-chain AI agent to autonomously route funds to other Polkadot parachains using native XCM precompiles. On-chain risk policies, EIP-712 signature verification, and oracle-based slippage protection ensure the AI agent cannot act maliciously.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Polkadot Hub EVM (REVM)                   │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  ObidotVault │───▶│ XCM Precompile│───▶│  Parachains   │  │
│  │  (ERC-4626)  │    │  (0xA0000)   │    │ Astar,Moonbeam│  │
│  └──────┬───────┘    └──────────────┘    │ Acala,HydraDX │  │
│         │                                └───────────────┘  │
│         │  ┌────────────────┐                               │
│         ├──│ Policy Engine  │  Whitelist · Caps · Circuit   │
│         │  └────────────────┘  Breaker                      │
│         │  ┌────────────────┐                               │
│         └──│ Pyth Oracle    │  Slippage validation          │
│            └────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │  EIP-712 signed intents      │  Deposit / Withdraw
         │                              │
    ┌────┴─────┐                  ┌─────┴─────┐
    │ AI Agent │                  │   Users   │
    │(Strategist)                 │(Depositors)│
    └──────────┘                  └───────────┘
```

## Repository Structure

```
obidot/
├── contracts/                    # Foundry smart contract workspace
│   ├── src/
│   │   ├── ObidotVault.sol       # Core ERC-4626 vault with XCM dispatch
│   │   ├── interfaces/
│   │   │   ├── IXcm.sol          # Polkadot Hub XCM precompile interface
│   │   │   ├── IAggregatorV3.sol # Chainlink/Pyth oracle interface
│   │   │   └── IGateway.sol      # Hyperbridge gateway interface
│   │   └── libraries/
│   │       └── MultiLocation.sol # SCALE-encoding for XCM locations
│   ├── script/
│   │   └── Deploy.s.sol          # Deployment scripts for Polkadot Hub
│   ├── test/
│   │   └── ObidotVault.t.sol     # Fuzz, invariant, security & integration tests
│   └── foundry.toml
├── docs/                         # Documentation web app
└── modules/                      # Shared modules
```

## Quick Start

### Prerequisites

- [Foundry (nightly)](https://book.getfoundry.sh/getting-started/installation) — required for Polkadot network testing
- Solidity 0.8.28

### Install

```bash
# Install nightly Foundry for Polkadot support
foundryup --nightly

# Clone and install dependencies
git clone https://github.com/obidot/obidot.git
cd obidot/contracts
forge install
```

### Build

```bash
cd contracts
forge build
```

### Test

```bash
# Run all tests with verbose output
forge test -vvv

# Run fuzz tests with extended runs
FOUNDRY_PROFILE=ci forge test -vvv

# Run specific test contract
forge test --match-contract ObidotVault_Security_Test -vvv

# Run invariant tests
forge test --match-contract ObidotVault_Invariant_Test -vvv
```

### Deploy

```bash
# Set environment variables
export PRIVATE_KEY=<deployer-private-key>
export UNDERLYING_ASSET=<erc20-address>
export PYTH_ORACLE=<pyth-aggregator-v3-address>
export ADMIN_ADDRESS=<admin-multisig-or-eoa>

# Deploy to Polkadot Hub Testnet (Paseo)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url polkadot_hub_testnet \
  --broadcast \
  -vvvv

# Deploy with initial setup (parachains + strategist)
export STRATEGIST_ADDRESS=<ai-agent-address>
forge script script/Deploy.s.sol:DeployWithSetup \
  --rpc-url polkadot_hub_testnet \
  --broadcast \
  -vvvv
```

## Network Configuration

| Network | RPC URL | Chain ID |
|---------|---------|----------|
| Polkadot Hub Testnet (Paseo) | `https://services.polkadothub-rpc.com/testnet` | `420420417` |
| Westend Asset Hub | `https://westend-asset-hub-eth-rpc.polkadot.io` | `420420421` |
| Kusama Asset Hub | `https://kusama-asset-hub-eth-rpc.polkadot.io` | `420420418` |

## Key Features

### ERC-4626 Vault
- Fully compliant yield-bearing vault with conservative rounding (favors vault)
- Virtual share offset (`_decimalsOffset = 3`) mitigates inflation attacks
- Deposit caps, pausability, and reentrancy protection
- Dual-balance accounting: local idle assets + remote deployed assets

### AI Strategist Integration
- Off-chain AI agent signs `StrategyIntent` structs via EIP-712
- Permissionless relaying: anyone can submit a signed intent
- Per-strategist nonce tracking prevents replay attacks
- Deadline enforcement prevents stale intent execution

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

| Layer | Protection |
|-------|-----------|
| Signature | EIP-712 typed data, `ecrecover` with s-value malleability check |
| Replay | Per-signer nonce + deadline + chain-bound domain separator |
| Risk | Parachain/protocol whitelist, exposure caps, daily loss circuit breaker |
| Oracle | Staleness checks, positive price validation, slippage bounds |
| ERC-4626 | Virtual shares (anti-inflation), conservative rounding, ReentrancyGuard |
| Access | Role-based: `DEFAULT_ADMIN_ROLE`, `STRATEGIST_ROLE`, `KEEPER_ROLE` |
| Emergency | Pause + emergency mode allows proportional withdrawal of idle assets |

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
