# Obidot Contracts

Solidity smart contracts for the **Obidot Autonomous Cross-Chain Finance Layer**. The system consists of an ERC-4626 yield-bearing vault on the Polkadot Hub, cross-chain infrastructure via Hyperbridge ISMP, satellite vaults on EVM chains, and a Bifrost DeFi adapter — all compiled to PolkaVM via the Revive LLVM compiler (`resolc`).

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Foundry (Polkadot fork)](https://paritytech.github.io/foundry-book-polkadot/) — nightly toolchain

```bash
foundryup --nightly
```

## Setup

```bash
git clone https://github.com/obidot/obidot.git
cd obidot/contracts
forge install
cp .env.example .env   # add your PRIVATE_KEY for testnet deploys
```

## Project Structure

```
src/
├── ObidotVault.sol              # Hub vault — ERC-4626, policy engine, XCM dispatch
├── ObidotVaultEVM.sol           # Satellite vault — ERC-4626 on Ethereum/L2s
├── KeeperOracle.sol             # Keeper-updatable price feed (IAggregatorV3)
├── adapters/
│   ├── HyperbridgeAdapter.sol   # ISMP base — dispatch, receive, timeout
│   ├── CrossChainRouter.sol     # Hub message router (inherits HyperbridgeAdapter)
│   └── BifrostAdapter.sol       # Bifrost DeFi strategies (SLP, DEX, Farming, SALP)
├── interfaces/
│   ├── IAggregatorV3.sol        # Pyth / Chainlink oracle interface
│   ├── IBifrostSLP.sol          # Bifrost liquid staking
│   ├── IBifrostDEX.sol          # Bifrost DEX swaps
│   ├── IBifrostFarming.sol      # Bifrost yield farming
│   ├── IBifrostSALP.sol         # Bifrost slot auction liquidity
│   ├── IIsmpHost.sol            # Hyperbridge ISMP host
│   ├── IIsmpModule.sol          # Hyperbridge ISMP module callback
│   └── IXcm.sol                 # Polkadot Hub XCM precompile
├── libraries/
│   ├── MultiLocation.sol        # XCM MultiLocation SCALE encoding
│   ├── CrossChainCodec.sol      # ISMP message encode/decode (7 types)
│   └── BifrostCodec.sol         # Bifrost pallet call XCM V4 encoding
script/
├── DeployTestnet.s.sol           # Testnet quickstart (token + oracle + vault)
├── Deploy.s.sol                 # Hub vault deployment (Deploy, DeployWithSetup)
└── DeployCrossChain.s.sol       # Cross-chain deployment (3 scripts)
test/
├── ObidotVault.t.sol            # Hub vault tests (unit, fuzz, invariant)
├── CrossChain.t.sol             # Cross-chain router + satellite tests
├── CrossChainCodec.t.sol        # Codec encoding/decoding tests
└── BifrostCodec.t.sol           # Bifrost XCM encoding tests
```

## Build & Test

```bash
# Compile (standard EVM for testing)
forge build

# Run all tests
forge test

# Verbose output
forge test -vvvv

# Run specific test suites
forge test --match-contract ObidotVault
forge test --match-contract CrossChain
forge test --match-test testFuzz
forge test --match-test invariant

# CI-level fuzz depth (5000 runs)
FOUNDRY_PROFILE=ci forge test

# Build for PolkaVM deployment (Revive compiler)
FOUNDRY_PROFILE=polkadot forge build
```

## Networks

| Network | Chain ID | RPC | Profile |
|---------|----------|-----|---------|
| Local Anvil | — | `http://127.0.0.1:8545` | default |
| Polkadot Hub Testnet (Paseo) | `420420417` | `https://services.polkadothub-rpc.com/testnet` | polkadot |
| Westend Hub | `420420421` | `https://westend-asset-hub-eth-rpc.polkadot.io` | polkadot |
| Kusama Hub | `420420418` | `https://kusama-asset-hub-eth-rpc.polkadot.io` | polkadot |

## Oracle & Token Strategy

The vault requires an ERC-20 underlying asset and a price oracle (`IAggregatorV3`). On mature EVM chains these exist (Pyth, Chainlink, USDC, etc.), but **Polkadot Hub EVM is new** — no third-party oracle or standard ERC-20 tokens are deployed yet.

Obidot solves this with `KeeperOracle` (`src/KeeperOracle.sol`) — an on-chain oracle that implements the Chainlink `IAggregatorV3` interface and accepts price pushes from a trusted keeper. The AI agent or a bot fetches prices off-chain (from Pyth Hermes, CoinGecko, etc.) and pushes them on-chain:

```
Off-chain (Pyth Hermes / API)  →  Keeper TX  →  KeeperOracle.updatePrice()  →  Vault reads latestRoundData()
```

When Pyth eventually deploys on Polkadot Hub, the vault admin simply calls `vault.setOracle(pythAddress)` — no redeployment needed.

## Deployment Scripts

There are **three** deployment script files:

| Script File | Contains | Purpose |
|-------------|----------|--------|
| `DeployTestnet.s.sol` | `DeployTestnet` | **Quickstart**: deploys token + oracle + vault in one shot |
| `Deploy.s.sol` | `Deploy`, `DeployWithSetup` | Deploy the **hub vault** (when you already have a token + oracle) |
| `DeployCrossChain.s.sol` | `DeployCrossChain`, `DeploySatelliteVault`, `RegisterSatellitePeers` | Deploy **cross-chain infrastructure** (router, adapter, satellites) |

**For testnet**, start with `DeployTestnet.s.sol` — it deploys everything you need with zero external dependencies. **For production** (when real tokens and oracles exist), use `Deploy.s.sol` + `DeployCrossChain.s.sol`.

### Deployment Order

```
Testnet │ DeployTestnet.s.sol:DeployTestnet → TestDOT + KeeperOracle + ObidotVault
        │   (one command, zero external dependencies)
        │
  — OR for production —

Step 1  │ Deploy.s.sol:Deploy              → ObidotVault on Polkadot Hub
        │   (requires existing ERC-20 token + oracle)
        │
Step 2  │ DeployCrossChain.s.sol:DeployCrossChain
        │   → CrossChainRouter + BifrostAdapter on Polkadot Hub
        │
Step 3  │ DeployCrossChain.s.sol:DeploySatelliteVault  (once per EVM chain)
        │   → ObidotVaultEVM on Ethereum / Arbitrum / Optimism / Base
        │
Step 4  │ DeployCrossChain.s.sol:RegisterSatellitePeers
        │   → Registers all satellites in the hub router
```

### Testnet Quickstart (Recommended)

Deploys a test token (tDOT), KeeperOracle (DOT/USD), and ObidotVault in **one command**:

```bash
export PRIVATE_KEY=<deployer-private-key>

forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url polkadot_hub_testnet --broadcast -vvvv
```

This gives you:
- `TestDOT` — mintable ERC-20 (anyone can mint for testing)
- `KeeperOracle` — push prices via `cast send <oracle> 'updatePrice(int256)' <price>`
- `ObidotVault` — fully wired, ready to accept deposits

Optional overrides: `ADMIN_ADDRESS`, `INITIAL_PRICE` (default: $7.00 at 8 decimals), `DEPOSIT_CAP`, `MINT_AMOUNT`.

### Step 1 — Deploy Hub Vault (Production)

Use when you have real ERC-20 tokens and an oracle (Pyth, Chainlink, or KeeperOracle):

```bash
export PRIVATE_KEY=<deployer-private-key>
export UNDERLYING_ASSET=<erc20-address>
export PYTH_ORACLE=<oracle-address>           # Pyth, Chainlink, or KeeperOracle
export ADMIN_ADDRESS=<admin-multisig-or-eoa>

forge script script/Deploy.s.sol:Deploy \
  --rpc-url polkadot_hub_testnet --broadcast -vvvv

# Or with initial policy setup (also sets strategist + whitelists parachains)
export STRATEGIST_ADDRESS=<ai-agent-address>
forge script script/Deploy.s.sol:DeployWithSetup \
  --rpc-url polkadot_hub_testnet --broadcast -vvvv
```

### Step 2 — Deploy Cross-Chain Infrastructure

```bash
export ISMP_HOST=<hyperbridge-ismp-host-on-polkadot-hub>
export MASTER_VAULT=<vault-address-from-step-1>

forge script script/DeployCrossChain.s.sol:DeployCrossChain \
  --rpc-url polkadot_hub_testnet --broadcast -vvvv
```

This deploys `CrossChainRouter` and `BifrostAdapter`, then calls `vault.setCrossChainRouter()` and `vault.setBifrostAdapter()` on the hub vault.

### Step 3 — Deploy Satellite Vaults

Run once per target EVM chain:

```bash
export ISMP_HOST=<ismp-host-on-target-chain>
export HUB_ROUTER_MODULE=$(cast abi-encode "f(address)" <router-address-from-step-2>)
export CHAIN_IDENTIFIER="ETHEREUM"   # or ARBITRUM, OPTIMISM, BASE

forge script script/DeployCrossChain.s.sol:DeploySatelliteVault \
  --rpc-url <target-rpc> --broadcast --verify -vvvv
```

### Step 4 — Register Peers

Back on the hub, register all satellite addresses:

```bash
export ROUTER_ADDRESS=<router-address-from-step-2>
export ETH_SATELLITE_MODULE=<satellite-on-ethereum>
export ARB_SATELLITE_MODULE=<satellite-on-arbitrum>

forge script script/DeployCrossChain.s.sol:RegisterSatellitePeers \
  --rpc-url polkadot_hub_testnet --broadcast -vvvv
```

## Environment Variables

### Testnet Quickstart (`DeployTestnet.s.sol`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | — | Deployer private key |
| `ADMIN_ADDRESS` | No | deployer | Admin address |
| `INITIAL_PRICE` | No | `700000000` ($7.00) | DOT/USD price (8 decimals) |
| `DEPOSIT_CAP` | No | 1M tokens | Max total deposits |
| `MAX_DAILY_LOSS` | No | 50K tokens | Circuit breaker threshold |
| `MINT_AMOUNT` | No | 100K tokens | tDOT minted to deployer |

### Hub Vault (`Deploy.s.sol`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | Yes | — | Deployer private key |
| `UNDERLYING_ASSET` | Yes | — | ERC-20 token address |
| `PYTH_ORACLE` | Yes | — | Oracle address (Pyth, Chainlink, or KeeperOracle) |
| `ADMIN_ADDRESS` | Yes | — | Admin (receives `DEFAULT_ADMIN_ROLE` + `KEEPER_ROLE`) |
| `STRATEGIST_ADDRESS` | `DeployWithSetup` only | — | AI agent address |
| `DEPOSIT_CAP` | No | 1M tokens | Max total deposits |
| `MAX_DAILY_LOSS` | No | 50K tokens | Circuit breaker threshold |
| `MAX_XCM_REF_TIME` | No | 1T pico (1s) | XCM execution time limit |
| `MAX_XCM_PROOF_SIZE` | No | 1 MB | XCM proof size limit |

### Cross-Chain (`DeployCrossChain.s.sol`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ISMP_HOST` | Yes | — | Hyperbridge ISMP host contract |
| `MASTER_VAULT` | Yes | — | Hub `ObidotVault` address |
| `HUB_ROUTER_MODULE` | Satellite only | — | `abi.encode(routerAddress)` |
| `CHAIN_IDENTIFIER` | Satellite only | — | e.g. `"ETHEREUM"`, `"ARBITRUM"` |
| `HUB_CHAIN_ID` | No | `"POLKADOT-HUB"` | ISMP chain ID for the hub |
| `DEPOSIT_CAP` | No | 1M tokens | Satellite deposit cap |
| `MAX_SYNC_AGE` | No | 3600 (1h) | Max seconds before synced state is stale |

## Dependencies

| Package | Version | Remapping |
|---------|---------|-----------|
| OpenZeppelin Contracts | v5.5.0 | `@openzeppelin/contracts/` → `lib/openzeppelin-contracts/contracts/` |
| Pyth SDK Solidity | v2.2.0 | `@pythnetwork/pyth-sdk-solidity/` → `lib/pyth-sdk-solidity/` |
| Forge Std | latest | `forge-std/` → `lib/forge-std/src/` |

## Foundry Profiles

| Profile | Command | Purpose |
|---------|---------|---------|
| `default` | `forge build` / `forge test` | Local dev, 1K fuzz runs |
| `ci` | `FOUNDRY_PROFILE=ci forge test` | CI, 5K fuzz runs, depth 128 |
| `polkadot` | `FOUNDRY_PROFILE=polkadot forge build` | PolkaVM build via `resolc` (deploy artifacts only) |

## Documentation

Full documentation at [obidot.xyz/docs](https://obidot.xyz/docs) or run locally:

```bash
cd ../docs && pnpm dev   # http://localhost:4010
```

Key pages: [Architecture](../docs/content/docs/architecture.mdx) · [Vault](../docs/content/docs/vault.mdx) · [Cross-Chain](../docs/content/docs/cross-chain.mdx) · [Bifrost](../docs/content/docs/bifrost.mdx) · [Satellite Vault](../docs/content/docs/satellite-vault.mdx) · [Deployment](../docs/content/docs/deployment.mdx)
