# Obidot — Agent Guidelines

Obidot is an Autonomous Cross-Chain Finance Layer for Polkadot. An ERC-4626 vault
on Polkadot Hub EVM lets an off-chain AI agent route funds across parachains via XCM.

## Repository Structure

```
obidot/
├── contracts/          # Solidity (Foundry) — vault, adapters, libraries
│   ├── src/            # Production contracts
│   ├── test/           # Forge tests
│   └── script/         # Deployment & demo scripts
├── modules/agent/      # TypeScript — off-chain AI agent (LangChain + viem)
└── docs/               # Documentation site
```

Monorepo: pnpm workspaces + Turborepo. See sub-package AGENTS.md files for details.

## Quick Commands

```sh
# Root-level (delegates via turbo)
pnpm build                        # Build all packages
pnpm test                         # Run all tests
pnpm test:forge                   # Forge tests only (contracts)

# Contracts (run from contracts/ or use --filter)
forge build                       # Compile contracts
forge test                        # Run all 400 tests
forge test --match-test <name> -vvv   # Single test, verbose
forge test --match-contract <Name>    # All tests in a contract
forge fmt                         # Format Solidity
FOUNDRY_PROFILE=polkadot forge build  # PVM build (resolc)
FOUNDRY_PROFILE=ci forge test         # CI profile (5000 fuzz runs)

# Agent module
pnpm --filter @obidot/agent run typecheck
pnpm --filter @obidot/agent run lint
pnpm --filter @obidot/agent run dev       # Dev mode (tsx watch)
```

## Solidity Code Style

- **Pragma:** `pragma solidity ^0.8.28;` — all files
- **License:** `// SPDX-License-Identifier: MIT`
- **Imports:** Named imports only (`import {Foo} from "..."`), OpenZeppelin first, then local interfaces, then libraries
- **Errors:** Custom errors, not `require` strings — `error ZeroAddress();`
- **NatDoc:** `@title`, `@notice`, `@dev` on contracts; `@notice`/`@dev`/`@param` on functions and state vars
- **Sections:** `// ─────` bars to separate Constants, Enums, State, Events, Errors, Constructor, External, Internal
- **Constants:** `UPPER_SNAKE_CASE`, internal constants use `internal constant`
- **Roles:** `bytes32 public constant ROLE_NAME = keccak256("ROLE_NAME");`
- **Modifiers order:** `visibility` → `override` → `modifier` (e.g. `external override whenNotPaused nonReentrant`)
- **Formatting:** `forge fmt` — enforced, no manual overrides

## Solidity Testing Conventions

- Test contract: `ContractName_Category_Test` (e.g. `ObidotVault_Deposit_Test`)
- Test function: `test_descriptiveName`, `testFuzz_name`, `testRevert_name`
- Base harness: `ObidotVaultTestBase` with shared `setUp()`, helpers, constants
- Mocks: defined in test file, prefixed `Mock` (e.g. `MockERC20`, `MockOracle`)
- Mock oracle API: `setPrice(int256)`, `setStale()`, `setPriceRaw(int256, uint256)`, `setShouldRevert(bool)`
- Tests start at `vm.warp(10_000)` to avoid oracle staleness underflows
- Invariant handlers: defined in test file as `Handler` contracts

## TypeScript Code Style (modules/agent)

- **Target:** ES2022, Node16 module resolution, strict mode
- **Imports:** `import type { Foo }` for type-only; value imports separate; `.js` extensions on local imports
- **Sections:** `// ── Section ──────────` bars mirroring Solidity style
- **Classes:** constructor → public methods → private methods
- **Errors:** try/catch with typed errors; logger-based error reporting (pino)
- **Naming:** `camelCase` for vars/functions, `PascalCase` for classes/types/enums, `UPPER_SNAKE` for constants
- **No `any`:** use `unknown` and narrow; `as` casts only when unavoidable

## Key Gotchas

- `vm.prank` is consumed by the NEXT external call (even views); cache role hashes before pranking
- `vm.expectRevert` only catches external call reverts; library reverts need a wrapper contract
- After `vm.warp`, refresh oracle price to avoid staleness errors
- EIP-712 digest in tests: compute inline, not via `computeIntentDigest` (calldata issue)
- XCM precompile lowercase: `0x00000000000000000000000000000000000a0000`
- Vault constructor `_maxRefTime`/`_maxProofSize` are `uint64`, not `uint256`
- `IXcm.send()` returns `void`, not `bool`
- Vault API: `setParachainAllowed()`, `setProtocolAllowed()`, `setProtocolExposureCap()` (not legacy names)

## PVM Constraints (Polkadot Hub)

| Constraint               | Limit           | Project Status |
|--------------------------|-----------------|----------------|
| Heap buffer              | 64 KB           | OK             |
| Call stack depth          | 5               | Max 3 (batch → strategy → XCM) |
| Event topics             | 4 max           | All ≤ 3 indexed |
| Storage/event data       | 416 bytes       | All structs < 200 B |
| selfdestruct             | Not supported   | Not used       |
| EXTCODECOPY              | Not supported   | Not used       |
| Reentrancy guards        | Required (no gas limits cross-contract) | All entry points |

## Foundry Profiles

| Profile    | Fuzz Runs | Invariant Runs/Depth | Usage |
|------------|-----------|----------------------|-------|
| default    | 1000      | 256 / 64             | `forge test` |
| ci         | 5000      | 512 / 128            | `FOUNDRY_PROFILE=ci forge test` |
| polkadot   | N/A       | N/A                  | `FOUNDRY_PROFILE=polkadot forge build` (resolc) |

## Target Network

- **Chain:** Polkadot Hub Testnet (Paseo), chain ID `420420417`
- **RPC:** `https://services.polkadothub-rpc.com/testnet`
- **XCM Precompile:** `0x00000000000000000000000000000000000a0000`

## Dependencies

- OpenZeppelin Contracts v5.5.0 — `@openzeppelin/contracts/`
- Pyth SDK Solidity v2.2.0 — `@pythnetwork/pyth-sdk-solidity/`
- Forge Std — `forge-std/`
- LangChain (agent) — `@langchain/core`, `@langchain/openai`
- viem (agent) — on-chain interaction
- obi-kit SDK — `@obidot-kit/core`, `@obidot-kit/llm`, `@obidot-kit/sdk`

## Token Efficiency

- Never re-read files you just wrote. You know the contents.
- Never re-run commands to verify unless outcome was uncertain.
- Batch related edits. Don't make 5 edits when 1 handles it.
- Skip confirmations like "I'll continue..." — just do it.
- If a task needs 1 tool call, don't use 3.
