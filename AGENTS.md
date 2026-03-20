# Obidot — Agent Guidelines

Obidot — the first cross-chain DEX aggregator on Polkadot Hub. An ERC-4626 vault
on Polkadot Hub (PolkaVM) with cross-chain liquidity aggregation across Polkadot
parachains (XCM) and EVM chains (Hyperbridge ISMP). An AI-driven autonomous agent
operates as a sub-feature for intent-based strategy execution.

## Repository Structure

```
obidot/
├── modules/agent/      # TypeScript — off-chain AI agent (LangChain + viem)
├── modules/app/        # Next.js 15 — frontend trading terminal
└── docs/               # Documentation site
```

Contracts live in [obi.router](https://github.com/obidot/obi.router).
SDK lives in [obi-kit](https://github.com/obidot/obi-kit).

Monorepo: pnpm workspaces + Turborepo. See sub-package AGENTS.md files for details.

## Quick Commands

```sh
# Root-level (delegates via turbo)
pnpm build                        # Build all packages
pnpm test                         # Run all tests

# Agent module
pnpm --filter @obidot/agent run typecheck
pnpm --filter @obidot/agent run lint
pnpm --filter @obidot/agent run dev       # Dev mode (tsx watch)

# App module
pnpm --filter @obidot/app run dev         # Dev mode (Next.js + Turbopack, port 3010)
pnpm --filter @obidot/app run build       # Production build

# Contracts (run from obi.router repo)
# See https://github.com/obidot/obi.router
forge build
forge test
```

## TypeScript Code Style (modules/agent)

- **Target:** ES2022, Node16 module resolution, strict mode
- **Imports:** `import type { Foo }` for type-only; value imports separate; `.js` extensions on local imports
- **Sections:** `// ── Section ──────────` bars mirroring Solidity style
- **Classes:** constructor → public methods → private methods
- **Errors:** try/catch with typed errors; logger-based error reporting (pino)
- **Naming:** `camelCase` for vars/functions, `PascalCase` for classes/types/enums, `UPPER_SNAKE` for constants
- **No `any`:** use `unknown` and narrow; `as` casts only when unavoidable

## Deployed Contracts (Polkadot Hub TestNet)

### SP-1 — UniswapV2 Liquidity Provision (2026-03-20)

| Contract | Address |
|---|---|
| LiquidityRouter | `0xe8A26F28207ba060c2fD98Ff5d7dF85347f0EB08` |
| LiquidityPair tDOT/TKB | `0xDc1b4a27d44613aa5072Ca6edC20151D94e7f93A` |
| LiquidityPair tDOT/tUSDC | `0x9576F7b40bC3a8Bb5d236Cd4bEBC29dC40AF0fa4` |
| LiquidityPair tDOT/tETH | `0x4a0183BA79Ab7072240B5Fd8B6A1055E8e60aC83` |
| LiquidityPair tUSDC/tETH | `0x3FBa4A4db176201d3A3a5B25e7561274ceCb6ef5` |
| LiquidityPair TKB/TKA | `0xd6F5C4b7b3911Db7D062D0457f8b3D4045C86d50` |

All verified on Blockscout at `https://blockscout-testnet.polkadot.io`.

**Notes:**
- Pairs use constructor pattern (`new LiquidityPair(token0, token1)`) — NOT factory
- OZ ERC20 v5: burn `MINIMUM_LIQUIDITY` to `0x000...dEaD`, NOT `address(0)`
- No protocol fee (`_mintFee` always returns `feeOn = false`)
- No seeding on deploy — pairs get initial price from first `addLiquidity` call

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

| Constraint         | Limit                                   | Project Status                 |
| ------------------ | --------------------------------------- | ------------------------------ |
| Heap buffer        | 64 KB                                   | OK                             |
| Call stack depth   | 5                                       | Max 3 (batch → strategy → XCM) |
| Event topics       | 4 max                                   | All ≤ 3 indexed                |
| Storage/event data | 416 bytes                               | All structs < 200 B            |
| selfdestruct       | Not supported                           | Not used                       |
| EXTCODECOPY        | Not supported                           | Not used                       |
| Reentrancy guards  | Required (no gas limits cross-contract) | All entry points               |

## Frontend Features (modules/app)

| Feature | Route | Key Files |
|---|---|---|
| Swap | `/swap` | `src/app/swap/page.tsx`, `src/components/swap/` |
| Yields + LP | `/yields` | `src/app/yields/page.tsx`, `src/components/liquidity/liquidity-panel.tsx` |
| Insights | `/insights` | `src/app/insights/page.tsx` |

### UniswapV2 Liquidity Panel
- Opened by clicking `+ Earn` on a UV2 row in `/yields`
- Fixed right overlay: `fixed right-0 top-0 z-50 h-full w-[360px]`
- Add tab: sequential approve(token0) → approve(token1) → addLiquidity
- Remove tab: approve(LP) → removeLiquidity
- Hooks: `useAddLiquidity`, `useRemoveLiquidity` in `src/hooks/use-liquidity.ts`
- LP_PAIRS constant: `src/lib/constants.ts` — must match UV2_PAIRS in `modules/agent`

## Foundry Profiles

| Profile  | Fuzz Runs | Invariant Runs/Depth | Usage                                           |
| -------- | --------- | -------------------- | ----------------------------------------------- |
| default  | 1000      | 256 / 64             | `forge test`                                    |
| ci       | 5000      | 512 / 128            | `FOUNDRY_PROFILE=ci forge test`                 |
| polkadot | N/A       | N/A                  | `FOUNDRY_PROFILE=polkadot forge build` (resolc) |

## Target Network

- **Chain:** Polkadot Hub TestNet, chain ID `420420417`
- **RPC:** `https://eth-rpc-testnet.polkadot.io/`
- **Blockscout:** `https://blockscout-testnet.polkadot.io`
- **XCM Precompile:** `0x00000000000000000000000000000000000a0000`
- **Network naming:** Always use "Polkadot Hub TestNet" — NOT "Paseo testnet"

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
