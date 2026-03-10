# obi-kit Integration Plan

> **Status: ✅ Complete (v0.1.0)**
> All 4 tasks below are addressed. For the next phase of SDK work (real contract connections, new tools, v0.2.0), see:
> - [`tasks/agent-rebuild-plan.md`](./agent-rebuild-plan.md) — agent module rebuild (Phase 7: SDK integration)
> - [`obi-kit/tasks/obi-kit-rebuild-plan.md`](../../obi-kit/tasks/obi-kit-rebuild-plan.md) — full obi-kit v0.2.0 plan

## Overview

Connect the [obi-kit](https://github.com/obidot/obi-kit) open-source SDK to the live Obidot contracts, enabling developers to build custom AI agents that interact with the vault.

## Current State

### obi-kit Architecture
- **@obidot-kit/core** — Types, errors, ABIs, EVM/Polkadot context
- **@obidot-kit/llm** — LangChain tools (VaultDeposit, VaultWithdraw, BifrostYield, etc.)
- **@obidot-kit/sdk** — ObiKit facade class
- **@obidot-kit/cli** — CLI stub

### Gap Analysis
1. ABIs in `core/src/abi/` are stubs — need real contract ABIs
2. LLM tools use offline/mock mode — no real contract interactions
3. `ObiKit.connect()` doesn't create real viem clients for Polkadot Hub
4. Examples don't have working configurations

## Integration Tasks

### Task 1: Update Core ABIs
- Export real ABIs from `forge build` artifacts
- Copy vault ABI, OracleRegistry ABI, BifrostAdapter ABI to `packages/core/src/abi/`
- Update TypeScript types to match new contract features (withdrawal queue, batch execution, performance scoring)

### Task 2: Connect LLM Tools
- `VaultDepositTool` → Call `vault.deposit(assets, receiver)` via viem
- `VaultWithdrawTool` → Support both instant `withdraw()` and queued `requestWithdrawal()`
- `BifrostStrategyTool` → Call `vault.executeStrategy()` with real EIP-712 signing
- `CrossChainRebalanceTool` → Call `vault.executeStrategies()` for batch execution
- New: `VaultPerformanceTool` → Read `getProtocolPerformance()` and `performanceSummary()`

### Task 3: Real Client Connection
- `ObiKit.connect()` → Create viem public/wallet clients for Polkadot Hub
- Chain config: `{ id: 420420417, rpcUrl: "https://services.polkadothub-rpc.com/testnet" }`
- Support both browser wallet and private key signing

### Task 4: Update Examples
- `examples/vault-agent/` → Working vault deposit + withdraw + performance monitoring
- `examples/cross-chain-agent/` → Working Bifrost strategy execution with real XCM

## New Tools to Add

| Tool | Description | Contract Function |
|---|---|---|
| `WithdrawalQueueTool` | Request, fulfill, cancel withdrawals | `requestWithdrawal`, `fulfillWithdrawal`, `cancelWithdrawal` |
| `BatchStrategyTool` | Execute multiple strategies | `executeStrategies` |
| `PerformanceTool` | Read protocol performance data | `getProtocolPerformance`, `performanceSummary` |
| `OracleCheckTool` | Verify oracle health before trading | `isOracleFresh`, `getPriceStrict` |

## Dependencies

This integration depends on:
- Phase 1-4 contract changes (COMPLETED)
- Deployed contracts on Paseo testnet (Phase 8 — PENDING)
- Real Bifrost testnet parachain ID and token addresses
