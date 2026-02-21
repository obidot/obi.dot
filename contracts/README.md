# PVM Core

PolkaVM smart contracts built with **Foundry Polkadot** and **Hardhat Polkadot**.

Contracts compile to PolkaVM (PVM) via the `resolc` compiler and can be deployed to Polkadot Asset Hub testnets and mainnets.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Foundry (Polkadot fork)](https://paritytech.github.io/foundry-book-polkadot/)

## Setup

```shell
npm install
cp .env.example .env   # add your PRIVATE_KEY for testnet deploys
```

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Local Node | — | `http://127.0.0.1:8545` |
| Polkadot Hub Testnet | 420420422 | `https://services.polkadothub-rpc.com/testnet` |
| Westend Hub | 420420421 | `https://westend-asset-hub-eth-rpc.polkadot.io` |
| Kusama Hub | 420420418 | `https://kusama-asset-hub-eth-rpc.polkadot.io` |

## Usage

### Compile

```shell
# Hardhat (resolc → PolkaVM)
npm run compile

# Foundry
forge build
```

### Test

```shell
# Hardhat tests
npm run test

# Forge tests
forge test -vvv
```

### Deploy

```shell
# Hardhat Ignition — local node
npm run deploy:local

# Hardhat Ignition — Polkadot Hub Testnet
npm run deploy:testnet

# Hardhat Ignition — Westend Hub
npm run deploy:westend

# Forge script — local
forge script script/Counter.s.sol:CounterScript --rpc-url local --broadcast

# Forge script — testnet
forge script script/Counter.s.sol:CounterScript --rpc-url polkadot_hub_testnet --broadcast
```

### Format

```shell
npm run format
```

### Local Node

```shell
# Start a local PolkaVM node via Hardhat
npm run node
```

## Project Structure

```
src/            — Solidity source contracts
test/           — Forge tests (*.t.sol) & Hardhat tests (*.test.js)
script/         — Forge deployment scripts
ignition/       — Hardhat Ignition deployment modules
lib/            — Foundry dependencies (forge-std)
```

## Documentation

- [Foundry Polkadot Book](https://paritytech.github.io/foundry-book-polkadot/)
- [Hardhat Polkadot Plugin](https://github.com/nicholasgasior/hardhat-polkadot)
- [PolkaVM Contracts Guide](https://docs.polkadot.com/develop/smart-contracts/)
