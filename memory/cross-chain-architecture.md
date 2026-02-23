# Cross-Chain Architecture — Hyperbridge + Bifrost Extension

## Status: COMPLETE ✅

## Architecture Decision: Multi-Vault with Hyperbridge Sync

### Overview
- **Hub Vault** (`ObidotVault.sol` on Polkadot Hub) — Extended with Hyperbridge adapter for EVM chain communication
- **Satellite Vaults** (`ObidotVaultEVM.sol`) — Independent ERC-4626 vaults on Ethereum/L2s that sync with hub
- **CrossChainRouter** — Routes ISMP messages between hub and satellites via Hyperbridge
- **BifrostAdapter** — Encodes XCM calls for Bifrost DeFi operations (SLP, DEX, Farming, SALP)
- **HyperbridgeAdapter** — Base contract for ISMP message dispatch/receipt

### Message Flow
```
User deposits on Ethereum → ObidotVaultEVM (Ethereum)
  → HyperbridgeAdapter → ISMP Post → Hyperbridge relayer network
  → CrossChainRouter (Polkadot Hub) → ObidotVault (Hub)
  → BifrostAdapter → XCM → Bifrost Parachain → DeFi Protocol

Yield returns: Bifrost → XCM → Hub Vault → Keeper reports outcome
  → CrossChainRouter → ISMP → Satellite Vault (sync totalAssets)
```

### Cross-Chain Message Types
1. `DEPOSIT_SYNC` — Notify hub of new deposits on satellite
2. `WITHDRAW_REQUEST` — Satellite requests withdrawal from hub
3. `ASSET_SYNC` — Hub broadcasts updated totalAssets to satellites
4. `STRATEGY_REPORT` — Hub reports strategy outcome to satellites
5. `EMERGENCY_SYNC` — Hub propagates pause/emergency to satellites

### Bifrost DeFi Integrations
1. **SLP (Staking Liquidity Protocol)** — Mint vDOT/vKSM, earn staking yield
2. **DEX Swaps** — Token swaps via Bifrost built-in DEX
3. **Farming** — LP provision and yield farming
4. **SALP** — Parachain crowdloan participation
5. **vToken Lifecycle** — Mint, hold, redeem vTokens

### Target Networks
- **Hub**: Polkadot Hub Testnet (Paseo) — Chain ID 420420417
- **Satellites**: Ethereum Sepolia, Arbitrum Sepolia, Optimism Sepolia, Base Sepolia
- **Bifrost**: Parachain ID 2030

### New Contract Files
```
contracts/src/
├── ObidotVault.sol              (EXTEND - add Hyperbridge hooks)
├── ObidotVaultEVM.sol           (NEW - satellite vault)
├── CrossChainRouter.sol         (NEW - ISMP message routing)
├── adapters/
│   ├── HyperbridgeAdapter.sol   (NEW - base ISMP adapter)
│   └── BifrostAdapter.sol       (NEW - Bifrost DeFi operations)
├── interfaces/
│   ├── IIsmpHost.sol            (NEW - ISMP host)
│   ├── IIsmpModule.sol          (NEW - ISMP module callbacks)
│   ├── IBifrostSLP.sol          (NEW - Staking Liquidity Protocol)
│   ├── IBifrostDEX.sol          (NEW - Bifrost DEX)
│   ├── IBifrostFarming.sol      (NEW - Yield farming)
│   └── IBifrostSALP.sol         (NEW - Slot Auction Liquidity)
├── libraries/
│   ├── MultiLocation.sol        (EXISTING)
│   ├── CrossChainCodec.sol      (NEW - ISMP message encoding)
│   └── BifrostCodec.sol         (NEW - Bifrost XCM encoding)
```

### Agent Updates (Implemented)
```
modules/agent/src/
├── config/
│   ├── constants.ts             (EXTENDED — EVM chains, Bifrost protocols, ABIs)
│   └── env.ts                   (EXTENDED — satellite RPC URLs, adapter addresses)
├── services/
│   ├── crosschain.service.ts    (NEW — multi-chain state aggregator)
│   ├── signer.service.ts        (EXTENDED — Bifrost adapter writeContract)
│   └── yield.service.ts         (EXTENDED — 7 Bifrost yield products)
├── agent/
│   ├── loop.ts                  (EXTENDED — Bifrost/cross-chain phases)
│   ├── systemPrompt.ts          (EXTENDED — Bifrost DeFi identity)
│   └── tools.ts                 (EXTENDED — 6 tools: fetch_yields, execute_strategy,
│                                  fetch_bifrost_yields, fetch_cross_chain_state,
│                                  execute_bifrost_strategy, fetch_vault_state)
├── types/
│   └── index.ts                 (EXTENDED — BifrostStrategyType, CrossChainVaultState,
│                                  4-way discriminated union decisions)
```

### Build Verification
- **Contracts**: `forge build` — compiles cleanly, 257 tests pass (0 failures)
- **Agent**: `pnpm --filter @obidot/agent run typecheck` — 0 errors
