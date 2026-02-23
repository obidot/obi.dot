# Cross-Chain Extension Tasks

## Phase 1: Core Infrastructure ✅
- [x] Create ISMP interfaces (`IIsmpHost.sol`, `IIsmpModule.sol`)
- [x] Create Bifrost protocol interfaces (SLP, DEX, Farming, SALP)
- [x] Build `CrossChainCodec.sol` library
- [x] Build `BifrostCodec.sol` library

## Phase 2: Adapters & Router ✅
- [x] Build `HyperbridgeAdapter.sol` base contract
- [x] Build `CrossChainRouter.sol` message router
- [x] Build `BifrostAdapter.sol` strategy adapter

## Phase 3: Satellite Vault ✅
- [x] Build `ObidotVaultEVM.sol` (ERC-4626 on EVM chains)
- [x] Cross-chain deposit/withdraw sync
- [x] Emergency propagation

## Phase 4: Hub Vault Extension ✅
- [x] Extend `ObidotVault.sol` with Hyperbridge dispatch
- [x] Add cross-chain accounting to hub
- [x] Add Bifrost strategy types to hub

## Phase 5: Testing ✅ (257 tests, 0 failures)
- [x] Unit tests for all new contracts
- [x] Integration tests for cross-chain flows (CrossChain.t.sol)
- [x] Fuzz tests for codec roundtrips (CrossChainCodec.t.sol, BifrostCodec.t.sol)

## Phase 6: Deploy Scripts ✅
- [x] Multi-chain deployment script (DeployCrossChain, DeploySatelliteVault)
- [x] Post-deploy cross-chain setup (RegisterSatellitePeers)

## Phase 7: Agent Updates ✅ (typecheck passes)
- [x] Bifrost yield service (yield.service.ts — 7 Bifrost products)
- [x] Cross-chain sync service (crosschain.service.ts — multi-chain aggregator)
- [x] Updated system prompt & tools (systemPrompt.ts, tools.ts — 6 tools)
- [x] New env vars for EVM chains (env.ts, constants.ts)
- [x] Updated agent loop for Bifrost/cross-chain decisions (loop.ts)
- [x] Updated types with BifrostStrategyType, CrossChainVaultState (types/index.ts)
- [x] SignerService Bifrost adapter integration (signer.service.ts)
