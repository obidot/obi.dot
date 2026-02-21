# Obidot — Agent Guidelines

## Project Overview

Obidot is an Autonomous Cross-Chain Finance Layer for Polkadot. It is an ERC-4626 yield-bearing vault deployed to the Polkadot Hub EVM (REVM) that allows an off-chain AI agent to autonomously route funds to other Polkadot parachains using native XCM precompiles.

## Build & Test Status

- [x] `forge build` compiles cleanly (warnings only from unused Gateway.sol imports)
- [x] All 91 unit/fuzz tests pass
- [x] All 4 invariant tests pass (256 runs, 16384 calls each)
- [x] Fuzz campaigns: 1002 runs per fuzz test
- [x] PolkaVM deployment profile (`FOUNDRY_PROFILE=polkadot forge build`) separated from test profile

## Completed Features

### Core Vault (`src/ObidotVault.sol`)
- [x] ERC-4626 fully compliant vault inheriting `ERC4626`, `AccessControl`, `Pausable`, `ReentrancyGuard`
- [x] Roles: `DEFAULT_ADMIN_ROLE`, `STRATEGIST_ROLE`, `KEEPER_ROLE`
- [x] Virtual share offset (`_decimalsOffset = 3`) for inflation attack mitigation
- [x] Conservative rounding (favoring the vault) via OpenZeppelin v5 defaults
- [x] Deposit caps enforced via `maxDeposit()` / `maxMint()` overrides
- [x] Dual-balance accounting: `totalAssets() = idle + totalRemoteAssets`
- [x] Emergency mode: pause + allow proportional withdrawals ignoring remote assets
- [x] `ReentrancyGuard` on all entry/exit points (`deposit`, `mint`, `withdraw`, `redeem`, `executeStrategy`)

### EIP-712 Signature Verification & Replay Protection
- [x] `DOMAIN_SEPARATOR` computed at deploy time with name, version, chainId, verifyingContract
- [x] `StrategyIntent` struct with `STRATEGY_INTENT_TYPEHASH`
- [x] Per-strategist nonce tracking (`mapping(address => uint256) nonces`)
- [x] Deadline enforcement (revert if `block.timestamp > intent.deadline`)
- [x] ECDSA recovery with s-value malleability check (EIP-2)
- [x] Permissionless relaying: anyone can submit a valid signed intent

### Strategy Execution (`executeStrategy`)
- [x] Full validation pipeline: deadline → basic checks → signature → nonce → policy → oracle → XCM weight → dispatch
- [x] `StrategyIntent` struct: `asset`, `amount`, `minReturn`, `maxSlippageBps`, `deadline`, `nonce`, `xcmCall`, `targetParachain`, `targetProtocol`
- [x] `StrategyStatus` enum: `Pending`, `Sent`, `Executed`, `Failed`
- [x] `StrategyRecord` storage for tracking execution history
- [x] `reportStrategyOutcome` for keepers to report remote results with P&L tracking

### On-Chain Policy Engine
- [x] Parachain whitelist (`allowedParachains` mapping)
- [x] Protocol whitelist (`allowedTargets` mapping)
- [x] Per-protocol exposure caps (`maxProtocolExposure` mapping, 0 = unlimited)
- [x] Daily loss circuit breaker: auto-pauses vault + enables emergency mode when `dailyLossAccumulator > maxDailyLoss`
- [x] 24-hour rolling window with automatic reset

### Oracle Integration
- [x] Pyth Network via `IAggregatorV3` (Chainlink-compatible) interface
- [x] Oracle staleness check: revert if data older than 1 hour
- [x] Positive price validation: revert if `answer <= 0`
- [x] Slippage bound enforcement: `minReturn >= amount * price * (1 - maxSlippage) / 10^decimals`

### XCM Cross-Chain Dispatch
- [x] `IXcm` interface for precompile at `0x00000000000000000000000000000000000A0000`
- [x] `send(dest, message)` and `weighMessage(message)` function support
- [x] Pre-flight weight estimation with 10% safety margin buffer
- [x] Revert on overweight (`XcmOverweight` error)
- [x] Configurable weight limits (`maxXcmRefTime`, `maxXcmProofSize`)

### MultiLocation Library (`src/libraries/MultiLocation.sol`)
- [x] SCALE compact encoding for `u32` and `u128`
- [x] V3 and V4 versioned location support
- [x] High-level builders: `relayChain`, `siblingParachain`, `siblingParachainAccountId32`, `siblingParachainAccountKey20`, `siblingParachainPalletAsset`, `localHere`, `childParachain`
- [x] `extractParachainId` decoder for validation
- [x] Full compact roundtrip tested

### Deployment Scripts (`script/Deploy.s.sol`)
- [x] `Deploy` — minimal deployment with env-var configuration and post-deploy verification
- [x] `DeployWithSetup` — deploy + grant strategist + whitelist initial parachains

### Test Suite (`test/ObidotVault.t.sol`)
- [x] Mock contracts: `MockERC20`, `MockOracle`, `MockXcmPrecompile`
- [x] `MockXcmPrecompile` uses `uint256` storage for weight fields to avoid Solidity packing issues with `vm.store`/`vm.etch`
- [x] `_executeDefaultStrategy` helper burns tokens from vault to simulate real XCM precompile transfers
- [x] ERC-4626 core tests (deposit, redeem, caps, paused state, remote accounting, emergency)
- [x] Fuzz tests: deposit/withdraw roundtrip, multi-user, deposit cap, share inflation invariant
- [x] Strategy execution tests: success, permissionless relay, sequential, outcome reporting, circuit breaker
- [x] Security tests: expired deadline, nonce mismatch, replay, unauthorized strategist, invalid/malleable signature, asset mismatch, zero amount, slippage too high, insufficient balance, paused, access control, domain separator
- [x] Policy engine tests: parachain not allowed, protocol not allowed, exposure cap exceeded, exposure reset, daily loss reset, whitelist toggle
- [x] Oracle tests: slippage pass/fail, stale data, negative/zero price, oracle update, fuzz boundary
- [x] XCM tests: weight within limits, overweight refTime/proofSize, weight limit update, fuzz safety margin
- [x] Admin tests: pause/unpause, emergency lifecycle, adjust remote assets, validation errors, views
- [x] MultiLocation tests: all encoding variants, extract, compact roundtrip, revert on bad version (via `MultiLocationWrapper` for external call)
- [x] Constructor validation tests
- [x] Invariant tests: no zombie shares, idle balance consistency, conversion rounding, deposits >= withdrawals
- [x] Edge case tests: multiple strategists, role revocation, exposure cap unlimited, large strategy batches, withdraw reduces idle not remote

## Project Conventions

### Solidity
- Solidity `0.8.28`, Foundry framework
- OpenZeppelin Contracts v5.5.0 for base contracts
- Pyth SDK Solidity v2.2.0 for oracle interface
- Custom errors preferred over `require` strings (gas efficient)
- NatDoc on all public/external functions and state variables
- Section separators with `// ─────` comment bars for readability

### File Organization
- `contracts/src/` — production contracts
- `contracts/src/interfaces/` — external interface definitions
- `contracts/src/libraries/` — reusable library code
- `contracts/script/` — Forge deployment scripts
- `contracts/test/` — Forge test files
- `docs/` — documentation web app

### Testing
- Test contract naming: `ContractName_Category_Test`
- Test function naming: `test_descriptiveName` / `testFuzz_descriptiveName` / `testRevert_descriptiveName`
- Base test harness pattern: `ObidotVaultTestBase` with shared setup and helpers
- Mock contracts defined in the test file, prefixed with `Mock`
- Invariant handler contracts defined in the test file

### Dependencies (Foundry remappings)
- `@openzeppelin/contracts/` → `lib/openzeppelin-contracts/contracts/`
- `@pythnetwork/pyth-sdk-solidity/` → `lib/pyth-sdk-solidity/`
- `forge-std/` → `lib/forge-std/src/`

### Foundry Profiles
- **default** — Standard `solc` compilation for local testing (`forge build`, `forge test`)
- **ci** — Extended fuzz runs (5000) and invariant depth (128) for CI
- **polkadot** — Revive LLVM compiler (`resolc_compile = true`) for PolkaVM deployment (`FOUNDRY_PROFILE=polkadot forge build`)

### Target Networks
- **Primary:** Polkadot Hub Testnet (Paseo) — Chain ID `420420417`
- **RPC:** `https://services.polkadothub-rpc.com/testnet`
- **XCM Precompile:** `0x00000000000000000000000000000000000a0000`

### Known Patterns & Gotchas
- XCM precompile address must use lowercase checksum: `0x00000000000000000000000000000000000a0000`
- `vm.prank` is consumed by the next external call (including view calls like `vault.STRATEGIST_ROLE()`); cache role hashes before pranking
- `vm.expectRevert` only catches reverts from external calls; library function reverts need a wrapper contract
- Mock oracle timestamps must account for `vm.warp`; refresh oracle price after time warps to avoid staleness errors
- EIP-712 digest computation in tests must be done inline (not via `computeIntentDigest` calldata hack)

### Token Efficiency Rules
- Never re-read files you just wrote or edited. You know the contents.
- Never re-run commands to "verify" unless the outcome was uncertain.
- Don't echo back large blocks of code or file contents unless asked.
- Batch related edits into single operations. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." Just do it.
- If a task needs 1 tool call, don't use 3. Plan before acting.
- Do not summarize what you just did unless the result is ambiguous or you need additional input.