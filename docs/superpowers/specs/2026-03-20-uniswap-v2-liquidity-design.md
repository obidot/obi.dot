# UniswapV2 Liquidity Provision — Design Spec

## Overview

Add full add/remove liquidity support for the 5 UniswapV2 pairs on Polkadot Hub TestNet. Users click "+ Earn" on a UV2 row in the `/yields` page and get a `LiquidityPanel` drawer where they can deposit both tokens (receiving LP tokens) and withdraw later by redeeming LP tokens proportionally.

**Root cause of current gap:** `MinimalV2Pair` — the contract behind the existing `UV2_PAIRS` — has no LP token support. Liquidity is added by direct transfer + `sync()`, with no way to track shares or withdraw.

**Solution:** Port the production-quality `UniswapV2Pair` (with ERC-20 LP tokens, `mint()`, `burn()`) from `examples/uniswap-v2-polkadot/` into `src/periphery/`, adapted to `pragma solidity 0.8.28` and OpenZeppelin. Deploy a `LiquidityRouter` for safe add/remove with slippage protection. Deploy 5 new LP-enabled pairs. Build a `LiquidityPanel` component wired into the `/yields` page.

---

## Architecture

### Repos touched

| Repo | Changes |
|---|---|
| `obi.router` | New contracts + deploy script |
| `obidot` (modules/app) | ABIs, constants, hooks, components, page wiring |

---

## Part 1 — Solidity (obi.router)

### File map

| File | Purpose |
|---|---|
| `src/periphery/LiquidityPair.sol` | Full UV2 pair: ERC-20 LP tokens + `mint()` + `burn()` + `swap()` + `sync()` |
| `src/periphery/LiquidityRouter.sol` | Safe `addLiquidity()` / `removeLiquidity()` with slippage + deadline |
| `src/periphery/interfaces/ILiquidityPair.sol` | Interface used by router |
| `src/periphery/interfaces/ILiquidityRouter.sol` | Interface for frontend ABI generation |
| `script/DeployLiquidityPairs.s.sol` | Deploy router + 5 pairs + seed + register |
| `test/LiquidityPair.t.sol` | Unit tests for mint/burn/swap |
| `test/LiquidityRouter.t.sol` | Integration tests for addLiquidity/removeLiquidity |

---

### `LiquidityPair.sol`

Ported from `examples/uniswap-v2-polkadot/contracts/UniswapV2Pair.sol` (at `obi.router/examples/uniswap-v2-polkadot/contracts/UniswapV2Pair.sol`). Changes from the example:

- `pragma solidity 0.8.28` (matches project standard)
- Inherits OpenZeppelin `ERC20` for LP tokens instead of the custom `UniswapV2ERC20` — LP token name = `"Obidot LP"`, symbol = `"OBI-LP"`, decimals = 18
- Uses OpenZeppelin `SafeERC20` for all token transfers (no raw `.call()`)
- Removes `SafeMath` (overflow is built-in in 0.8.x)
- **Uses constructor pattern** — `constructor(address _token0, address _token1)` sets tokens as immutables. No `factory` field, no `initialize()`. The existing factory at `0xbF4f...` deploys old bytecode and cannot be changed; pairs are deployed directly.
- `_mintFee` is replaced with a no-op that always returns `feeOn = false` (hardcoded — does not call any factory). No protocol fee on testnet.
- Keeps reentrancy `lock` modifier
- Keeps `MINIMUM_LIQUIDITY = 1000` burned to `address(0)` on first mint

**Key functions:**

```solidity
// Called by LiquidityRouter after transferring both tokens to this pair
function mint(address to) external lock returns (uint liquidity);

// Caller must transfer LP tokens to this pair first, then call burn
function burn(address to) external lock returns (uint amount0, uint amount1);

// Standard V2 swap — called by UniswapV2PoolAdapter (existing)
function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock;

// Force reserves to match balances
function sync() external lock;
```

**Compatibility:** `UniswapV2PoolAdapter` only needs `token0()`, `token1()`, `getReserves()`, and `swap()` — all present. New pairs can be registered with the existing adapter.

---

### `LiquidityRouter.sol`

Simplified `UniswapV2Router02` — no WETH/ETH support (not needed on Polkadot Hub). Handles:
1. Computing optimal token amounts against current reserves
2. Pulling tokens from the user via `transferFrom`
3. Transferring tokens to the pair
4. Calling `pair.mint(to)` or `pair.burn(to)`
5. Enforcing slippage minimums and deadline

```solidity
function addLiquidity(
    address pair,
    uint amountADesired,
    uint amountBDesired,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
) external returns (uint amountA, uint amountB, uint liquidity);

function removeLiquidity(
    address pair,
    uint liquidity,
    uint amountAMin,
    uint amountBMin,
    address to,
    uint deadline
) external returns (uint amountA, uint amountB);

// View: given desired amounts and current reserves, return optimal amounts
function quote(
    uint amountA,
    uint reserveA,
    uint reserveB
) external pure returns (uint amountB);
```

`addLiquidity` logic:
- If reserves are 0: use full desired amounts
- Else: try `quote(amountADesired, reserveA, reserveB)` → if result ≤ `amountBDesired`, use `(amountADesired, quotedB)` else try reverse and use `(quotedA, amountBDesired)`
- Enforce both results ≥ their respective minimums
- `safeTransferFrom(token0/1, msg.sender, pair, amount)`
- Call `pair.mint(to)` → get `liquidity`

`removeLiquidity` logic:
- `IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity)` — LP token (the pair itself is an ERC-20) transferred to the pair contract using `SafeERC20`
- Call `ILiquidityPair(pair).burn(to)` → get `(amount0, amount1)`
- Enforce `amount0 >= amountAMin`, `amount1 >= amountBMin`

---

### `DeployLiquidityPairs.s.sol`

1. Deploy `LiquidityRouter` (no constructor args)
2. Deploy 5 `LiquidityPair` instances directly via `new LiquidityPair(token0, token1)` — **not** via factory (the existing factory at `0xbF4f...` deploys old bytecode and cannot be changed):
   - tDOT / TKB
   - tDOT / tUSDC
   - tDOT / tETH
   - tUSDC / tETH
   - TKB / TKA
3. Seed each pair by minting test tokens → transfer to pair → call `pair.mint(deployer)`
   - Seed amount: same scale as existing MinimalV2Pair seeding
4. Call `UniswapV2PoolAdapter.setPairRegistered(newPairAddr, true)` for each pair
   - **Prerequisite:** deployer must hold `DEFAULT_ADMIN_ROLE` on the adapter contract at `0xF06Af9a8fcdf56d69E356A58d4dC5217395918c3`
5. Log all deployed addresses for copy-paste into `constants.ts`

---

### Tests

**`LiquidityPair.t.sol`:**
- `test_mint_first_isGeometricMean` — first LP mint = sqrt(a*b) - 1000
- `test_mint_subsequent_isProportional` — second mint proportional to reserves
- `test_burn_returnsProportional` — LP burn returns correct token amounts
- `test_swap_respectsK` — k invariant holds after swap
- `test_minimumLiquidity_lockedForever` — MINIMUM_LIQUIDITY burned to address(0)

**`LiquidityRouter.t.sol`:**
- `test_addLiquidity_firstDeposit` — sets price, returns expected LP
- `test_addLiquidity_subsequentRespectRatio` — optimal amounts computed correctly
- `test_addLiquidity_rejectsSlippage` — reverts if amountAMin not met
- `test_removeLiquidity_returnsProportional` — correct amounts returned
- `test_removeLiquidity_rejectsSlippage` — reverts if amountMin not met
- `test_deadline_reverts` — expired deadline reverts

---

## Part 2 — Frontend (modules/app)

### File map

| File | Change |
|---|---|
| `src/lib/constants.ts` | Add `LIQUIDITY_ROUTER`, `LP_PAIRS` array |
| `src/lib/abi.ts` | Add `LIQUIDITY_ROUTER_ABI`, `LP_PAIR_ABI` |
| `src/types/index.ts` | Add `LiquidityPairMeta` type |
| `src/hooks/use-liquidity.ts` | `useLpBalance`, `usePoolShare`, `useAddLiquidity`, `useRemoveLiquidity` |
| `src/components/liquidity/liquidity-panel.tsx` | Add/Remove tabbed UI |
| `src/components/yields/yield-grid.tsx` | Pass `onEarn` → open panel for UV2 rows |
| `src/app/yields/page.tsx` | Manage `selectedLpPair` state, render drawer |

---

### Constants & ABIs

```typescript
// constants.ts additions
export const CONTRACTS = {
  ...existing,
  LIQUIDITY_ROUTER: "0x...",  // filled after deploy
} as const;

export const LP_PAIRS: LiquidityPairMeta[] = [
  { label: "tDOT/TKB",   address: "0x...", token0: TOKENS.tDOT,  token1: TOKENS.TKB,   token0Symbol: "tDOT",  token1Symbol: "TKB"   },
  { label: "tDOT/tUSDC", address: "0x...", token0: TOKENS.tDOT,  token1: TOKENS.tUSDC, token0Symbol: "tDOT",  token1Symbol: "tUSDC" },
  { label: "tDOT/tETH",  address: "0x...", token0: TOKENS.tDOT,  token1: TOKENS.tETH,  token0Symbol: "tDOT",  token1Symbol: "tETH"  },
  { label: "tUSDC/tETH", address: "0x...", token0: TOKENS.tUSDC, token1: TOKENS.tETH,  token0Symbol: "tUSDC", token1Symbol: "tETH"  },
  { label: "TKB/TKA",    address: "0x...", token0: TOKENS.TKB,   token1: TOKENS.TKA,   token0Symbol: "TKB",   token1Symbol: "TKA"   },
];

// GAS_LIMITS additions
export const GAS_LIMITS = {
  ...existing,
  ADD_LIQUIDITY:    BigInt(400_000),
  REMOVE_LIQUIDITY: BigInt(300_000),
  LP_APPROVE:       BigInt(50_000),
} as const;
```

**ABIs added to `abi.ts`:**
- `LIQUIDITY_ROUTER_ABI` — `addLiquidity`, `removeLiquidity`, `quote`
- `LP_PAIR_ABI` — `balanceOf`, `totalSupply`, `allowance`, `approve`, `transfer`, `getReserves`, `token0`, `token1`, `mint`, `burn`

---

### `LiquidityPairMeta` type

```typescript
export interface LiquidityPairMeta {
  label: string;          // e.g. "tDOT/tUSDC"
  address: `0x${string}`; // LP pair contract
  token0: `0x${string}`;  // lower-address token
  token1: `0x${string}`;  // higher-address token
  token0Symbol: string;
  token1Symbol: string;
}
```

---

### `use-liquidity.ts`

Four hooks, following the `VaultActions` wagmi pattern (`useWriteContract` + `useWaitForTransactionReceipt` + explicit step state machine):

**`useLpBalance(pairAddress)`**
- `useReadContract({ abi: LP_PAIR_ABI, functionName: "balanceOf", args: [address] })`
- Returns `{ balance: bigint, formatted: string }`

**`usePoolShare(pairAddress)`**
- Reads `balanceOf`, `totalSupply`, `getReserves` in parallel via `useReadContracts`
- Returns `{ sharePercent: number, amount0: bigint, amount1: bigint }`

**`useAddLiquidity(pair: LiquidityPairMeta)`**
- Step state machine: `"idle" | "approving-token0" | "confirming-approve-0" | "approving-token1" | "confirming-approve-1" | "adding" | "confirming-add" | "done" | "error"`
- `execute(amount0: string, amount1: string, slippageBps: number)`:
  1. Check allowances — skip approval steps if already sufficient
  2. `approve(LIQUIDITY_ROUTER, amount0)` on token0 if needed
  3. `approve(LIQUIDITY_ROUTER, amount1)` on token1 if needed
  4. `router.addLiquidity(pair, amount0, amount1, min0, min1, address, deadline)`
- Returns `{ step, execute, txHash, error }`

**`useRemoveLiquidity(pair: LiquidityPairMeta)`**
- Step state machine: `"idle" | "approving-lp" | "confirming-approve-lp" | "removing" | "confirming-remove" | "done" | "error"`
- `execute(lpAmount: bigint, slippageBps: number)`:
  1. `approve(LIQUIDITY_ROUTER, lpAmount)` on LP pair if needed
  2. `router.removeLiquidity(pair, lpAmount, min0, min1, address, deadline)`
- Returns `{ step, execute, txHash, error }`

---

### `LiquidityPanel` component

`src/components/liquidity/liquidity-panel.tsx`

Props:
```typescript
interface LiquidityPanelProps {
  pair: LiquidityPairMeta | null;
  open: boolean;
  onClose: () => void;
}
```

Rendered as a right-side overlay panel (not a full modal — inline positioned at the right of the grid, slides in over the existing sidebar). Uses CSS `translate-x` transition.

**Add tab:**
- Token0 input with balance display, token symbol label
- Token1 input: auto-computed from current price ratio (reads `getReserves` + `quote`) as user types token0 amount; editable independently (updates token0 inversely)
- Slippage selector: reuses `SLIPPAGE_OPTIONS` (0.5%, 1%, 2%)
- "LP tokens you'll receive" estimate: `min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1)`
- Step button: `Approve tDOT → Approve TKB → Add Liquidity` — label and action update per step
- TX status: spinner on confirming, green checkmark + blockscout link on done

**Remove tab:**
- "Your position" card: LP balance, pool share %, underlying token0/token1 amounts
- LP amount input (manual) + percentage quick-buttons (25%, 50%, 75%, 100%)
- Expected output: recomputed from `lpAmount * reserve0 / totalSupply`, `lpAmount * reserve1 / totalSupply`
- Slippage selector
- Step button: `Approve LP → Remove Liquidity`
- TX status same as add tab

**Empty state:** If not connected — "Connect wallet to manage liquidity". If connected but no LP balance (on Remove tab) — "No position in this pool".

---

### Wiring into `/yields` page

**`yield-grid.tsx`:**
- Update the `onEarn` prop type in `YieldGridProps` from `(name: string, apy: number) => void` to `(name: string, apy: number, pairMeta?: LiquidityPairMeta) => void`
- The call site `onEarn?.(y.name, y.apyPercent)` must also be updated: when `item.isUniswap === true`, pass the matching `LiquidityPairMeta` from `LP_PAIRS` as the third argument; for non-UV2 rows, pass `undefined` (existing behavior unchanged)
- The page decides what to do based on whether `pairMeta` is defined

**`yields/page.tsx`:**
- Update `handleEarn` signature from `(name: string, apy: number)` to `(name: string, apy: number, pairMeta?: LiquidityPairMeta)`
- Add `selectedLpPair: LiquidityPairMeta | null` state
- `handleEarn` logic: if `pairMeta` → `setSelectedLpPair(pairMeta)`; else → existing `setEarnHint` + scroll flow
- Render `<LiquidityPanel pair={selectedLpPair} open={!!selectedLpPair} onClose={() => setSelectedLpPair(null)} />` when `selectedLpPair` is set — as an overlay fixed to the right edge of the viewport (position: fixed, right-0, top-0, h-full), so it slides over the existing sidebar without displacing it

---

## Non-Goals

- No WETH wrapping (Polkadot Hub EVM has no native ETH equivalent for wrapping)
- No fee-on protocol for LP (feeTo disabled on testnet)
- No price oracle / TWAP (TWAP accumulators are in the pair contract but not consumed in UI)
- No concentrated liquidity / V3 (out of scope)
- No cross-chain liquidity provision (parachain protocols like Hydration/Bifrost handle their own liquidity — only UV2 pairs on Hub EVM are in scope)
- No LP staking / farming rewards on top of LP tokens
