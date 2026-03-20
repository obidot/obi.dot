# UniswapV2 Liquidity Provision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full add/remove liquidity support for 5 UniswapV2 pairs on Polkadot Hub TestNet via new `LiquidityPair` + `LiquidityRouter` contracts and a `LiquidityPanel` drawer in the frontend.

**Architecture:** Port the example `UniswapV2Pair` to `pragma 0.8.28` with OZ ERC-20 LP tokens and constructor pattern (no factory/initialize). Deploy a `LiquidityRouter` for safe slippage-protected add/remove. Wire a `LiquidityPanel` fixed-position overlay into the `/yields` page, triggered by the `+ Earn` button on UV2 rows.

**Tech Stack:** Solidity 0.8.28, Foundry, OpenZeppelin 5.x, Next.js 15, wagmi, TanStack Query, viem

**Spec:** `docs/superpowers/specs/2026-03-20-uniswap-v2-liquidity-design.md`

---

## File Map

### obi.router (contracts)

| File | Action |
|---|---|
| `src/periphery/interfaces/ILiquidityPair.sol` | Create |
| `src/periphery/interfaces/ILiquidityRouter.sol` | Create |
| `src/periphery/LiquidityPair.sol` | Create |
| `src/periphery/LiquidityRouter.sol` | Create |
| `script/DeployLiquidityPairs.s.sol` | Create |
| `test/LiquidityPair.t.sol` | Create |
| `test/LiquidityRouter.t.sol` | Create |

### modules/app (frontend)

| File | Action |
|---|---|
| `src/lib/constants.ts` | Modify — add `LIQUIDITY_ROUTER`, `LP_PAIRS`, GAS_LIMITS additions |
| `src/lib/abi.ts` | Modify — add `LIQUIDITY_ROUTER_ABI`, `LP_PAIR_ABI` |
| `src/types/index.ts` | Modify — add `LiquidityPairMeta` interface |
| `src/hooks/use-liquidity.ts` | Create — 4 hooks |
| `src/components/liquidity/liquidity-panel.tsx` | Create |
| `src/components/yields/yield-grid.tsx` | Modify — onEarn signature + UV2 pairMeta arg |
| `src/app/yields/page.tsx` | Modify — selectedLpPair state + LiquidityPanel render |

---

## Task 1: Interfaces

**Files:**
- Create: `obi.router/src/periphery/interfaces/ILiquidityPair.sol`
- Create: `obi.router/src/periphery/interfaces/ILiquidityRouter.sol`

- [ ] **Step 1: Create `ILiquidityPair.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ILiquidityPair {
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function sync() external;
    // ERC-20 subset (LP token IS the pair)
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
```

- [ ] **Step 2: Create `ILiquidityRouter.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ILiquidityRouter {
    function addLiquidity(
        address pair,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address pair,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) external pure returns (uint256 amountB);
}
```

- [ ] **Step 3: Compile to verify**

Working directory: `obi.router/`

```bash
forge build --silent
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/periphery/interfaces/
git commit -m "feat(contracts): add ILiquidityPair + ILiquidityRouter interfaces"
```

---

## Task 2: LiquidityPair Contract

**Files:**
- Create: `obi.router/src/periphery/LiquidityPair.sol`

- [ ] **Step 1: Create `LiquidityPair.sol`**

Port from `examples/uniswap-v2-polkadot/contracts/UniswapV2Pair.sol`. Key changes:
- Inherit OZ `ERC20("Obidot LP", "OBI-LP")` instead of `UniswapV2ERC20`
- Use `SafeERC20` for all token transfers
- Constructor pattern (no factory/initialize)
- `_mintFee` is a no-op returning `feeOn = false` (hardcoded)
- Remove `SafeMath` (built-in overflow checks in 0.8.x)
- Remove price accumulator TWAP (non-goal)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILiquidityPair} from "./interfaces/ILiquidityPair.sol";

/// @title LiquidityPair
/// @notice Full UniswapV2-compatible pair with ERC-20 LP tokens.
///         Ported to pragma 0.8.28 + OpenZeppelin. Constructor pattern
///         (no factory/initialize). Protocol fee disabled on testnet.
contract LiquidityPair is ERC20, ILiquidityPair {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    address public immutable token0;
    address public immutable token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32  private blockTimestampLast;

    uint256 public kLast; // reserve0 * reserve1 after last liquidity event

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "LP: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _token0, address _token1) ERC20("Obidot LP", "OBI-LP") {
        require(_token0 != address(0) && _token1 != address(0), "LP: ZERO_ADDRESS");
        require(_token0 != _token1, "LP: IDENTICAL_TOKENS");
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves()
        public
        view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) private {
        require(
            balance0 <= type(uint112).max && balance1 <= type(uint112).max,
            "LP: OVERFLOW"
        );
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        emit Sync(reserve0, reserve1);
    }

    /// @dev Protocol fee disabled on testnet — always returns feeOn = false.
    function _mintFee(uint112, uint112) private pure returns (bool feeOn) {
        feeOn = false;
    }

    /// @notice Called by LiquidityRouter after it transfers both tokens to this pair.
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock MINIMUM_LIQUIDITY
        } else {
            liquidity = Math.min(
                amount0 * _totalSupply / _reserve0,
                amount1 * _totalSupply / _reserve1
            );
        }
        require(liquidity > 0, "LP: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);
        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Caller must transfer LP tokens to this pair first, then call burn.
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply();
        amount0 = liquidity * balance0 / _totalSupply;
        amount1 = liquidity * balance1 / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "LP: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        IERC20(_token0).safeTransfer(to, amount0);
        IERC20(_token1).safeTransfer(to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));
        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Standard V2 swap — called by UniswapV2PoolAdapter (existing).
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external lock {
        require(amount0Out > 0 || amount1Out > 0, "LP: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "LP: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "LP: INVALID_TO");
            if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out);
            if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out);
            if (data.length > 0) {
                // Flash swap callback — safe because k-invariant is checked below
                (bool ok,) = to.call(
                    abi.encodeWithSignature(
                        "uniswapV2Call(address,uint256,uint256,bytes)",
                        msg.sender, amount0Out, amount1Out, data
                    )
                );
                require(ok, "LP: FLASH_CALLBACK_FAILED");
            }
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint256 amount0In = balance0 > _reserve0 - amount0Out
            ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out
            ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "LP: INSUFFICIENT_INPUT_AMOUNT");
        {
            // 0.3% fee: balance * 1000 - amountIn * 3
            uint256 b0Adj = balance0 * 1000 - amount0In * 3;
            uint256 b1Adj = balance1 * 1000 - amount1In * 3;
            require(
                b0Adj * b1Adj >= uint256(_reserve0) * uint256(_reserve1) * 1_000_000,
                "LP: K"
            );
        }
        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Force reserves to match current token balances.
    function sync() external lock {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }
}
```

- [ ] **Step 2: Compile**

```bash
forge build --silent
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/periphery/LiquidityPair.sol
git commit -m "feat(contracts): add LiquidityPair — UV2 pair with ERC-20 LP tokens"
```

---

## Task 3: LiquidityPair Tests

**Files:**
- Create: `obi.router/test/LiquidityPair.t.sol`

- [ ] **Step 1: Create test file**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LiquidityPair} from "../src/periphery/LiquidityPair.sol";

contract MintableToken is ERC20 {
    constructor(string memory name_, string memory sym_) ERC20(name_, sym_) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract LiquidityPair_Base is Test {
    address internal alice = makeAddr("alice");
    MintableToken internal tokenA;
    MintableToken internal tokenB;
    LiquidityPair internal pair;
    uint256 internal constant SEED = 1_000_000 ether;

    function setUp() public virtual {
        tokenA = new MintableToken("Token A", "TKA");
        tokenB = new MintableToken("Token B", "TKB");
        pair = new LiquidityPair(address(tokenA), address(tokenB));
    }

    function _seedAndMint(address recipient, uint256 a, uint256 b) internal returns (uint256 lp) {
        tokenA.mint(address(pair), a);
        tokenB.mint(address(pair), b);
        lp = pair.mint(recipient);
    }
}

contract LiquidityPair_Mint is LiquidityPair_Base {
    function test_mint_first_isGeometricMean() public {
        uint256 a = 1_000_000 ether;
        uint256 b = 4_000_000 ether;
        uint256 lp = _seedAndMint(alice, a, b);
        uint256 expected = Math.sqrt(a * b) - pair.MINIMUM_LIQUIDITY();
        assertEq(lp, expected, "first LP != sqrt(a*b) - MIN_LIQ");
        assertEq(pair.balanceOf(alice), expected);
    }

    function test_mint_subsequent_isProportional() public {
        _seedAndMint(alice, SEED, SEED);
        uint256 supply0 = pair.totalSupply();
        uint256 lp2 = _seedAndMint(alice, SEED / 2, SEED / 2);
        assertApproxEqRel(lp2, supply0 / 2, 1e15); // within 0.1%
    }

    function test_minimumLiquidity_lockedForever() public {
        _seedAndMint(alice, SEED, SEED);
        assertEq(pair.balanceOf(address(0)), pair.MINIMUM_LIQUIDITY());
    }
}

contract LiquidityPair_Burn is LiquidityPair_Base {
    function test_burn_returnsProportional() public {
        uint256 lp = _seedAndMint(alice, SEED, SEED);
        // Transfer LP to pair then burn
        vm.prank(alice);
        pair.transfer(address(pair), lp);
        (uint256 out0, uint256 out1) = pair.burn(alice);
        // Should get back close to SEED (minus MINIMUM_LIQUIDITY rounding)
        assertGt(out0, 0);
        assertGt(out1, 0);
        assertApproxEqRel(out0 + out1, 2 * SEED, 1e15);
    }
}

contract LiquidityPair_Swap is LiquidityPair_Base {
    function setUp() public override {
        super.setUp();
        _seedAndMint(alice, SEED, SEED);
    }

    function test_swap_respectsK() public {
        (uint112 r0before, uint112 r1before,) = pair.getReserves();
        uint256 amountIn = 1_000 ether;
        uint256 amountOut = 996 ether; // rough 0.3% fee estimate

        tokenA.mint(address(pair), amountIn);
        pair.swap(0, amountOut, alice, "");

        (uint112 r0after, uint112 r1after,) = pair.getReserves();
        // k should be ≥ k_before (fees increase k)
        assertGe(
            uint256(r0after) * uint256(r1after),
            uint256(r0before) * uint256(r1before)
        );
    }

    function test_swap_revertsOnInsufficient() public {
        // Try to take more than reserves
        vm.expectRevert("LP: INSUFFICIENT_LIQUIDITY");
        pair.swap(SEED + 1, 0, alice, "");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
forge test --match-contract "LiquidityPair" -v
```
Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/LiquidityPair.t.sol
git commit -m "test(contracts): add LiquidityPair unit tests"
```

---

## Task 4: LiquidityRouter Contract

**Files:**
- Create: `obi.router/src/periphery/LiquidityRouter.sol`

- [ ] **Step 1: Create `LiquidityRouter.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILiquidityPair} from "./interfaces/ILiquidityPair.sol";
import {ILiquidityRouter} from "./interfaces/ILiquidityRouter.sol";

/// @title LiquidityRouter
/// @notice Simplified UniswapV2Router02 — no WETH/ETH (not needed on Polkadot Hub).
///         Handles: optimal amount computation, token transfers, mint/burn with
///         slippage minimums and deadline enforcement.
contract LiquidityRouter is ILiquidityRouter {
    using SafeERC20 for IERC20;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "LiquidityRouter: EXPIRED");
        _;
    }

    // ── Add Liquidity ──────────────────────────────────────────────────────

    function addLiquidity(
        address pair,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _computeAmounts(
            pair, amountADesired, amountBDesired, amountAMin, amountBMin
        );
        address token0 = ILiquidityPair(pair).token0();
        address token1 = ILiquidityPair(pair).token1();
        IERC20(token0).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(token1).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = ILiquidityPair(pair).mint(to);
    }

    // ── Remove Liquidity ───────────────────────────────────────────────────

    function removeLiquidity(
        address pair,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        // LP token IS the pair contract (pair inherits ERC-20)
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (amountA, amountB) = ILiquidityPair(pair).burn(to);
        require(amountA >= amountAMin, "LiquidityRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "LiquidityRouter: INSUFFICIENT_B_AMOUNT");
    }

    // ── Quote ──────────────────────────────────────────────────────────────

    /// @notice Given amountA and current reserves, return the proportional amountB.
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure override returns (uint256 amountB) {
        require(amountA > 0, "LiquidityRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "LiquidityRouter: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _computeAmounts(
        address pair,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint112 reserveA, uint112 reserveB,) = ILiquidityPair(pair).getReserves();
        if (reserveA == 0 && reserveB == 0) {
            // First deposit — set the price
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "LiquidityRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                require(amountAOptimal <= amountADesired, "LiquidityRouter: EXCESSIVE_A_AMOUNT");
                require(amountAOptimal >= amountAMin, "LiquidityRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
}
```

- [ ] **Step 2: Compile**

```bash
forge build --silent
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/periphery/LiquidityRouter.sol
git commit -m "feat(contracts): add LiquidityRouter — safe add/remove with slippage"
```

---

## Task 5: LiquidityRouter Tests

**Files:**
- Create: `obi.router/test/LiquidityRouter.t.sol`

- [ ] **Step 1: Create test file**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {LiquidityPair} from "../src/periphery/LiquidityPair.sol";
import {LiquidityRouter} from "../src/periphery/LiquidityRouter.sol";

contract MintableToken2 is ERC20 {
    constructor(string memory name_, string memory sym_) ERC20(name_, sym_) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract LiquidityRouter_Base is Test {
    address internal alice = makeAddr("alice");
    MintableToken2 internal tokenA;
    MintableToken2 internal tokenB;
    LiquidityPair internal pair;
    LiquidityRouter internal router;
    uint256 internal constant ALICE_BAL = 10_000_000 ether;
    uint256 internal deadline;

    function setUp() public virtual {
        tokenA = new MintableToken2("Token A", "TKA");
        tokenB = new MintableToken2("Token B", "TKB");
        pair = new LiquidityPair(address(tokenA), address(tokenB));
        router = new LiquidityRouter();
        deadline = block.timestamp + 3600;

        tokenA.mint(alice, ALICE_BAL);
        tokenB.mint(alice, ALICE_BAL);
        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }
}

contract LiquidityRouter_AddLiquidity is LiquidityRouter_Base {
    function test_addLiquidity_firstDeposit() public {
        uint256 a = 1_000_000 ether;
        uint256 b = 4_000_000 ether;
        vm.prank(alice);
        (uint256 amtA, uint256 amtB, uint256 lp) = router.addLiquidity(
            address(pair), a, b, 0, 0, alice, deadline
        );
        assertEq(amtA, a);
        assertEq(amtB, b);
        assertGt(lp, 0);
        assertEq(pair.balanceOf(alice), lp);
    }

    function test_addLiquidity_subsequentRespectRatio() public {
        // First deposit — sets 1:4 ratio
        vm.prank(alice);
        router.addLiquidity(address(pair), 1_000_000 ether, 4_000_000 ether, 0, 0, alice, deadline);

        // Second deposit: request 2M A and 10M B — should get 2M A and 8M B (respecting 1:4)
        vm.prank(alice);
        (uint256 amtA, uint256 amtB,) = router.addLiquidity(
            address(pair), 2_000_000 ether, 10_000_000 ether, 0, 0, alice, deadline
        );
        assertApproxEqRel(amtA, 2_000_000 ether, 1e15);
        assertApproxEqRel(amtB, 8_000_000 ether, 1e15);
    }

    function test_addLiquidity_rejectsSlippage() public {
        vm.prank(alice);
        router.addLiquidity(address(pair), 1_000_000 ether, 4_000_000 ether, 0, 0, alice, deadline);

        // amountBMin too high — should revert
        vm.prank(alice);
        vm.expectRevert("LiquidityRouter: INSUFFICIENT_B_AMOUNT");
        router.addLiquidity(
            address(pair),
            1_000_000 ether,
            4_000_000 ether,
            0,
            5_000_000 ether, // impossible min
            alice,
            deadline
        );
    }
}

contract LiquidityRouter_RemoveLiquidity is LiquidityRouter_Base {
    function setUp() public override {
        super.setUp();
        vm.prank(alice);
        router.addLiquidity(address(pair), 1_000_000 ether, 4_000_000 ether, 0, 0, alice, deadline);
        vm.prank(alice);
        pair.approve(address(router), type(uint256).max);
    }

    function test_removeLiquidity_returnsProportional() public {
        uint256 lp = pair.balanceOf(alice);
        vm.prank(alice);
        (uint256 amtA, uint256 amtB) = router.removeLiquidity(
            address(pair), lp, 0, 0, alice, deadline
        );
        assertGt(amtA, 0);
        assertGt(amtB, 0);
        // ratio should be preserved: amtB ~= 4 * amtA
        assertApproxEqRel(amtB, 4 * amtA, 1e15);
    }

    function test_removeLiquidity_rejectsSlippage() public {
        uint256 lp = pair.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert("LiquidityRouter: INSUFFICIENT_A_AMOUNT");
        router.removeLiquidity(
            address(pair), lp,
            2_000_000 ether, // impossible min A
            0,
            alice, deadline
        );
    }
}

contract LiquidityRouter_Deadline is LiquidityRouter_Base {
    function test_deadline_reverts() public {
        vm.warp(block.timestamp + 7200); // advance past deadline
        vm.prank(alice);
        vm.expectRevert("LiquidityRouter: EXPIRED");
        router.addLiquidity(address(pair), 1_000 ether, 1_000 ether, 0, 0, alice, block.timestamp - 1);
    }
}
```

- [ ] **Step 2: Run all contract tests**

```bash
forge test --match-contract "LiquidityPair|LiquidityRouter" -v
```
Expected: all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/LiquidityRouter.t.sol
git commit -m "test(contracts): add LiquidityRouter integration tests"
```

---

## Task 6: Deploy Script

**Files:**
- Create: `obi.router/script/DeployLiquidityPairs.s.sol`

Token addresses (Polkadot Hub TestNet, from `modules/app/src/lib/constants.ts`):
- tDOT: `0x2402C804aD8a6217BF73D8483dA7564065c56083`
- tUSDC: `0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626`
- tETH: `0xd92a5325fB3A56f5012F1EBD1bd37573d981144e`
- TKA: `0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f`
- TKB: `0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc`
- UniswapV2PoolAdapter: `0xF06Af9a8fcdf56d69E356A58d4dC5217395918c3`

- [ ] **Step 1: Create `DeployLiquidityPairs.s.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LiquidityPair} from "../src/periphery/LiquidityPair.sol";
import {LiquidityRouter} from "../src/periphery/LiquidityRouter.sol";
import {UniswapV2PoolAdapter} from "../src/adapters/UniswapV2PoolAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title DeployLiquidityPairs
/// @notice Deploy LiquidityRouter + 5 LP-enabled pairs, seed liquidity, register.
///
/// Prerequisites:
///   - Deployer wallet must hold DEFAULT_ADMIN_ROLE on UniswapV2PoolAdapter
///   - All test tokens (tDOT, tUSDC, tETH, TKA, TKB) must have a permissionless
///     mint(address,uint256) function (testnet only)
///
/// Usage:
///   source .env && export PRIVATE_KEY="0x${PRIVATE_KEY}"
///   forge script script/DeployLiquidityPairs.s.sol:DeployLiquidityPairs \
///     --rpc-url polkadot_hub_testnet --broadcast --skip-simulation --non-interactive
contract DeployLiquidityPairs is Script {
    // ── Existing testnet addresses ─────────────────────────────────────────
    address internal constant TDOT  = 0x2402C804aD8a6217BF73D8483dA7564065c56083;
    address internal constant TUSDC = 0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626;
    address internal constant TETH  = 0xd92a5325fB3A56f5012F1EBD1bd37573d981144e;
    address internal constant TKA   = 0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f;
    address internal constant TKB   = 0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc;
    address internal constant ADAPTER = 0xF06Af9a8fcdf56d69E356A58d4dC5217395918c3;

    // ── Seed amounts (all test tokens are 18 decimals) ─────────────────────
    uint256 internal constant SEED = 10_000 ether;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // 1. Deploy LiquidityRouter
        LiquidityRouter router = new LiquidityRouter();
        console.log("LiquidityRouter:", address(router));

        // 2. Deploy 5 LP pairs directly (constructor pattern, not factory)
        LiquidityPair pairDotTkb   = new LiquidityPair(TDOT,  TKB);
        LiquidityPair pairDotUsdc  = new LiquidityPair(TDOT,  TUSDC);
        LiquidityPair pairDotEth   = new LiquidityPair(TDOT,  TETH);
        LiquidityPair pairUsdcEth  = new LiquidityPair(TUSDC, TETH);
        LiquidityPair pairTkbTka   = new LiquidityPair(TKB,   TKA);

        console.log("pairDotTkb  :", address(pairDotTkb));
        console.log("pairDotUsdc :", address(pairDotUsdc));
        console.log("pairDotEth  :", address(pairDotEth));
        console.log("pairUsdcEth :", address(pairUsdcEth));
        console.log("pairTkbTka  :", address(pairTkbTka));

        // 3. Seed each pair: mint tokens to pair, call pair.mint(deployer)
        address deployer = vm.addr(pk);
        _seedPair(pairDotTkb,  TDOT, TKB,   SEED, SEED, deployer);
        _seedPair(pairDotUsdc, TDOT, TUSDC, SEED, SEED, deployer);
        _seedPair(pairDotEth,  TDOT, TETH,  SEED, SEED, deployer);
        _seedPair(pairUsdcEth, TUSDC, TETH, SEED, SEED, deployer);
        _seedPair(pairTkbTka,  TKB,  TKA,  SEED, SEED, deployer);

        // 4. Register with UniswapV2PoolAdapter (deployer must have DEFAULT_ADMIN_ROLE)
        UniswapV2PoolAdapter adapter = UniswapV2PoolAdapter(ADAPTER);
        adapter.setPairRegistered(address(pairDotTkb),  true);
        adapter.setPairRegistered(address(pairDotUsdc), true);
        adapter.setPairRegistered(address(pairDotEth),  true);
        adapter.setPairRegistered(address(pairUsdcEth), true);
        adapter.setPairRegistered(address(pairTkbTka),  true);

        vm.stopBroadcast();

        // 5. Print addresses for copy-paste into modules/app/src/lib/constants.ts
        console.log("=== Copy into constants.ts LP_PAIRS ===");
        console.log("LIQUIDITY_ROUTER:", address(router));
        console.log("tDOT/TKB   pair:", address(pairDotTkb));
        console.log("tDOT/tUSDC pair:", address(pairDotUsdc));
        console.log("tDOT/tETH  pair:", address(pairDotEth));
        console.log("tUSDC/tETH pair:", address(pairUsdcEth));
        console.log("TKB/TKA    pair:", address(pairTkbTka));
    }

    function _seedPair(
        LiquidityPair pair,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address to
    ) internal {
        // Call mint(address,uint256) on each test token
        (bool okA,) = tokenA.call(abi.encodeWithSignature("mint(address,uint256)", address(pair), amountA));
        require(okA, "mint tokenA failed");
        (bool okB,) = tokenB.call(abi.encodeWithSignature("mint(address,uint256)", address(pair), amountB));
        require(okB, "mint tokenB failed");
        pair.mint(to);
    }
}
```

- [ ] **Step 2: Compile**

```bash
forge build --silent
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add script/DeployLiquidityPairs.s.sol
git commit -m "feat(contracts): add DeployLiquidityPairs deploy script"
```

- [ ] **Step 4: Deploy to testnet** (when ready)

```bash
source .env && export PRIVATE_KEY="0x${PRIVATE_KEY}"
forge script script/DeployLiquidityPairs.s.sol:DeployLiquidityPairs \
  --rpc-url polkadot_hub_testnet --broadcast --skip-simulation --non-interactive
```

Record all logged addresses — you'll need them for Task 7.

---

## Task 7: Frontend — Constants, ABIs, Types

**Files:**
- Modify: `modules/app/src/lib/constants.ts`
- Modify: `modules/app/src/lib/abi.ts`
- Modify: `modules/app/src/types/index.ts`

Working directory: `modules/app/`

- [ ] **Step 1: Add to `src/lib/constants.ts`**

Add after `GAS_LIMITS`:

```typescript
export const CONTRACTS = {
  // ... existing ...
  LIQUIDITY_ROUTER: "0x0000000000000000000000000000000000000000", // TODO: fill after deploy
} as const;

// Add to GAS_LIMITS:
export const GAS_LIMITS = {
  APPROVE: BigInt(50_000),
  SWAP: BigInt(300_000),
  ADD_LIQUIDITY: BigInt(400_000),
  REMOVE_LIQUIDITY: BigInt(300_000),
  LP_APPROVE: BigInt(50_000),
} as const;
```

Also add `LP_PAIRS` export (after constants):

```typescript
// import LiquidityPairMeta at the top once types/index.ts is updated
import type { LiquidityPairMeta } from "@/types";

export const LP_PAIRS: LiquidityPairMeta[] = [
  {
    label: "tDOT/TKB",
    address: "0x0000000000000000000000000000000000000000", // TODO: fill after deploy
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_TKB as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "TKB",
  },
  {
    label: "tDOT/tUSDC",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_USDC as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "tUSDC",
  },
  {
    label: "tDOT/tETH",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_DOT as `0x${string}`,
    token1: CONTRACTS.TEST_ETH as `0x${string}`,
    token0Symbol: "tDOT",
    token1Symbol: "tETH",
  },
  {
    label: "tUSDC/tETH",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_USDC as `0x${string}`,
    token1: CONTRACTS.TEST_ETH as `0x${string}`,
    token0Symbol: "tUSDC",
    token1Symbol: "tETH",
  },
  {
    label: "TKB/TKA",
    address: "0x0000000000000000000000000000000000000000",
    token0: CONTRACTS.TEST_TKB as `0x${string}`,
    token1: CONTRACTS.TEST_TKA as `0x${string}`,
    token0Symbol: "TKB",
    token1Symbol: "TKA",
  },
];
```

- [ ] **Step 2: Add ABIs to `src/lib/abi.ts`**

Append to existing file:

```typescript
export const LIQUIDITY_ROUTER_ABI = [
  {
    type: "function",
    name: "addLiquidity",
    inputs: [
      { name: "pair", type: "address" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeLiquidity",
    inputs: [
      { name: "pair", type: "address" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "quote",
    inputs: [
      { name: "amountA", type: "uint256" },
      { name: "reserveA", type: "uint256" },
      { name: "reserveB", type: "uint256" },
    ],
    outputs: [{ name: "amountB", type: "uint256" }],
    stateMutability: "pure",
  },
] as const;

export const LP_PAIR_ABI = [
  {
    type: "function",
    name: "token0",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token1",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "mint",
    inputs: [{ name: "to", type: "address" }],
    outputs: [{ name: "liquidity", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burn",
    inputs: [{ name: "to", type: "address" }],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;
```

- [ ] **Step 3: Add `LiquidityPairMeta` to `src/types/index.ts`**

Append to the end of the file:

```typescript
/** Metadata for a deployed LiquidityPair (LP-token-enabled UV2 pair). */
export interface LiquidityPairMeta {
  label: string;               // e.g. "tDOT/tUSDC"
  address: `0x${string}`;      // deployed LiquidityPair contract
  token0: `0x${string}`;       // lower-address token
  token1: `0x${string}`;       // higher-address token
  token0Symbol: string;
  token1Symbol: string;
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @obidot/app typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants.ts src/lib/abi.ts src/types/index.ts
git commit -m "feat(app): add LiquidityPairMeta type, LP_PAIRS, LIQUIDITY_ROUTER_ABI, LP_PAIR_ABI"
```

---

## Task 8: `use-liquidity.ts` Hooks

**Files:**
- Create: `modules/app/src/hooks/use-liquidity.ts`

Follows the existing `VaultActions` wagmi pattern: `useWriteContract` + `useWaitForTransactionReceipt` + explicit step state.

- [ ] **Step 1: Create `src/hooks/use-liquidity.ts`**

```typescript
"use client";

import { useState, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { CONTRACTS, GAS_LIMITS } from "@/lib/constants";
import { LP_PAIR_ABI, LIQUIDITY_ROUTER_ABI, ERC20_APPROVE_ABI } from "@/lib/abi";
import type { LiquidityPairMeta } from "@/types";

const ROUTER_ADDRESS = CONTRACTS.LIQUIDITY_ROUTER as Address;

// ── useLpBalance ──────────────────────────────────────────────────────────────

export function useLpBalance(pairAddress: Address) {
  const { address } = useAccount();
  const { data, refetch } = useReadContract({
    address: pairAddress,
    abi: LP_PAIR_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });
  const balance = data ?? 0n;
  return {
    balance,
    formatted: formatUnits(balance, 18),
    refetch,
  };
}

// ── usePoolShare ──────────────────────────────────────────────────────────────

export function usePoolShare(pairAddress: Address) {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: [
      { address: pairAddress, abi: LP_PAIR_ABI, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { address: pairAddress, abi: LP_PAIR_ABI, functionName: "totalSupply" },
      { address: pairAddress, abi: LP_PAIR_ABI, functionName: "getReserves" },
    ],
    query: { enabled: !!address },
  });

  const balance = (data?.[0].result as bigint | undefined) ?? 0n;
  const totalSupply = (data?.[1].result as bigint | undefined) ?? 0n;
  const reserves = data?.[2].result as [bigint, bigint, number] | undefined;
  const reserve0 = reserves?.[0] ?? 0n;
  const reserve1 = reserves?.[1] ?? 0n;

  const sharePercent =
    totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0;
  const amount0 = totalSupply > 0n ? (balance * reserve0) / totalSupply : 0n;
  const amount1 = totalSupply > 0n ? (balance * reserve1) / totalSupply : 0n;

  return { sharePercent, amount0, amount1, balance, totalSupply, reserve0, reserve1 };
}

// ── useAddLiquidity ───────────────────────────────────────────────────────────

export type AddLiquidityStep =
  | "idle"
  | "approving-token0"
  | "confirming-approve-0"
  | "approving-token1"
  | "confirming-approve-1"
  | "adding"
  | "confirming-add"
  | "done"
  | "error";

export function useAddLiquidity(pair: LiquidityPairMeta | null) {
  const { address } = useAccount();
  const [step, setStep] = useState<AddLiquidityStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: approveTx0, writeContract: writeApprove0 } = useWriteContract();
  const { data: approveTx1, writeContract: writeApprove1 } = useWriteContract();
  const { data: addTx, writeContract: writeAdd } = useWriteContract();

  const { isSuccess: approve0Done } = useWaitForTransactionReceipt({ hash: approveTx0 });
  const { isSuccess: approve1Done } = useWaitForTransactionReceipt({ hash: approveTx1 });
  const { isSuccess: addDone } = useWaitForTransactionReceipt({ hash: addTx });

  // Advance state machine when txs confirm
  useState(() => {
    if (step === "confirming-approve-0" && approve0Done) setStep("approving-token1");
  });
  useState(() => {
    if (step === "confirming-approve-1" && approve1Done) setStep("adding");
  });
  useState(() => {
    if (step === "confirming-add" && addDone) { setStep("done"); setTxHash(addTx); }
  });

  const execute = useCallback(
    async (amount0: string, amount1: string, slippageBps: number) => {
      if (!pair || !address) return;
      try {
        setStep("idle");
        setError(null);

        const amt0 = parseUnits(amount0, 18);
        const amt1 = parseUnits(amount1, 18);
        const min0 = amt0 - (amt0 * BigInt(slippageBps)) / 10000n;
        const min1 = amt1 - (amt1 * BigInt(slippageBps)) / 10000n;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

        setStep("approving-token0");
        writeApprove0({
          address: pair.token0,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [ROUTER_ADDRESS, amt0],
          gas: GAS_LIMITS.LP_APPROVE,
        });
        setStep("confirming-approve-0");
        // Transitions to "approving-token1" via useWaitForTransactionReceipt effect

        // NOTE: Steps after this point are triggered by the state-machine effects above.
        // The full flow continues in useEffect hooks in the component using this hook.
        // For the approve-1 and add steps, re-call execute() after each confirm OR
        // use the step value to drive sequential button presses.

        void { amt0, amt1, min0, min1, deadline, writeApprove1, writeAdd };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStep("error");
      }
    },
    [pair, address, writeApprove0, writeApprove1, writeAdd],
  );

  return { step, execute, txHash, error };
}

// ── useRemoveLiquidity ────────────────────────────────────────────────────────

export type RemoveLiquidityStep =
  | "idle"
  | "approving-lp"
  | "confirming-approve-lp"
  | "removing"
  | "confirming-remove"
  | "done"
  | "error";

export function useRemoveLiquidity(pair: LiquidityPairMeta | null) {
  const { address } = useAccount();
  const [step, setStep] = useState<RemoveLiquidityStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: approveTx, writeContract: writeApprove } = useWriteContract();
  const { data: removeTx, writeContract: writeRemove } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isSuccess: removeConfirmed } = useWaitForTransactionReceipt({ hash: removeTx });

  const execute = useCallback(
    (lpAmount: bigint, slippageBps: number) => {
      if (!pair || !address) return;
      try {
        setError(null);
        setStep("approving-lp");
        writeApprove({
          address: pair.address,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [ROUTER_ADDRESS, lpAmount],
          gas: GAS_LIMITS.LP_APPROVE,
        });
        setStep("confirming-approve-lp");
        void { slippageBps, writeRemove, approveConfirmed, removeConfirmed };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStep("error");
      }
    },
    [pair, address, writeApprove, writeRemove, approveConfirmed, removeConfirmed],
  );

  return { step, execute, txHash, error };
}
```

**Note to implementer:** The state machine above uses a simplified pattern. In the component (`LiquidityPanel`), use `useEffect` watching `step`, `approve0Done`, `approve1Done`, `addDone`, `approveConfirmed`, `removeConfirmed` to drive the sequential steps — same pattern as `VaultActions` at `src/components/dashboard/vault-actions.tsx`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-liquidity.ts
git commit -m "feat(app): add use-liquidity hooks (useLpBalance, usePoolShare, useAddLiquidity, useRemoveLiquidity)"
```

---

## Task 9: LiquidityPanel Component

**Files:**
- Create: `modules/app/src/components/liquidity/liquidity-panel.tsx`

- [ ] **Step 1: Create `src/components/liquidity/liquidity-panel.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { X, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { cn, formatTokenAmount } from "@/lib/format";
import { CONTRACTS, GAS_LIMITS, SLIPPAGE_OPTIONS } from "@/lib/constants";
import { LP_PAIR_ABI, LIQUIDITY_ROUTER_ABI, ERC20_APPROVE_ABI } from "@/lib/abi";
import type { LiquidityPairMeta } from "@/types";
import { usePoolShare } from "@/hooks/use-liquidity";
import { CHAIN } from "@/lib/constants";

interface LiquidityPanelProps {
  pair: LiquidityPairMeta | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "add" | "remove";

const ROUTER = CONTRACTS.LIQUIDITY_ROUTER as Address;

export function LiquidityPanel({ pair, open, onClose }: LiquidityPanelProps) {
  const [tab, setTab] = useState<Tab>("add");

  if (!pair) return null;

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-[360px] border-l border-border bg-surface shadow-xl",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            UniswapV2 Pool
          </p>
          <p className="text-[15px] font-semibold text-text-primary">{pair.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["add", "remove"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-[13px] font-medium transition-colors",
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t === "add" ? "+ Add Liquidity" : "− Remove"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100%-105px)] p-4">
        {tab === "add" ? (
          <AddTab pair={pair} />
        ) : (
          <RemoveTab pair={pair} />
        )}
      </div>
    </div>
  );
}

// ── Add Tab ───────────────────────────────────────────────────────────────────

function AddTab({ pair }: { pair: LiquidityPairMeta }) {
  const { address, isConnected } = useAccount();
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);

  // Read reserves to compute auto-amount1
  const { reserve0, reserve1, totalSupply } = usePoolShare(pair.address);

  // Auto-compute amount1 when amount0 changes
  useEffect(() => {
    if (!amount0 || reserve0 === 0n) return;
    try {
      const a0 = parseUnits(amount0, 18);
      const a1 = (a0 * reserve1) / reserve0;
      setAmount1(formatUnits(a1, 18).slice(0, 12));
    } catch { /* invalid input */ }
  }, [amount0, reserve0, reserve1]);

  // LP tokens estimate
  const lpEstimate = (() => {
    if (!amount0 || reserve0 === 0n || totalSupply === 0n) return null;
    try {
      const a0 = parseUnits(amount0, 18);
      return (a0 * totalSupply) / reserve0;
    } catch { return null; }
  })();

  // Step machine: approve token0 → approve token1 → addLiquidity
  type Step = "idle" | "approving-0" | "confirming-0" | "approving-1" | "confirming-1" | "adding" | "confirming-add" | "done" | "error";
  const [step, setStep] = useState<Step>("idle");
  const [finalTxHash, setFinalTxHash] = useState<`0x${string}` | undefined>();

  const { data: approveTx0, writeContract: approve0 } = useWriteContract();
  const { data: approveTx1, writeContract: approve1 } = useWriteContract();
  const { data: addTx, writeContract: add } = useWriteContract();

  const { isSuccess: approve0OK } = useWaitForTransactionReceipt({ hash: approveTx0 });
  const { isSuccess: approve1OK } = useWaitForTransactionReceipt({ hash: approveTx1 });
  const { isSuccess: addOK } = useWaitForTransactionReceipt({ hash: addTx });

  useEffect(() => { if (step === "confirming-0" && approve0OK) setStep("approving-1"); }, [step, approve0OK]);
  useEffect(() => {
    if (step === "approving-1") {
      const amt1 = parseUnits(amount1, 18);
      approve1({ address: pair.token1, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [ROUTER, amt1], gas: GAS_LIMITS.LP_APPROVE });
      setStep("confirming-1");
    }
  }, [step, amount1, approve1, pair.token1]);
  useEffect(() => {
    if (step === "confirming-1" && approve1OK) setStep("adding");
  }, [step, approve1OK]);
  useEffect(() => {
    if (step === "adding") {
      const amt0 = parseUnits(amount0, 18);
      const amt1 = parseUnits(amount1, 18);
      const min0 = amt0 - (amt0 * BigInt(slippageBps)) / 10000n;
      const min1 = amt1 - (amt1 * BigInt(slippageBps)) / 10000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      add({
        address: ROUTER,
        abi: LIQUIDITY_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [pair.address, amt0, amt1, min0, min1, address ?? "0x0", deadline],
        gas: GAS_LIMITS.ADD_LIQUIDITY,
      });
      setStep("confirming-add");
    }
  }, [step, amount0, amount1, slippageBps, address, pair.address, add]);
  useEffect(() => { if (step === "confirming-add" && addOK) { setStep("done"); setFinalTxHash(addTx); } }, [step, addOK, addTx]);

  const handleAdd = useCallback(() => {
    if (!address || !amount0 || !amount1) return;
    const amt0 = parseUnits(amount0, 18);
    approve0({ address: pair.token0, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [ROUTER, amt0], gas: GAS_LIMITS.LP_APPROVE });
    setStep("confirming-0");
  }, [address, amount0, amount1, approve0, pair.token0]);

  if (!isConnected) {
    return <p className="text-center text-[13px] text-text-muted py-8">Connect wallet to add liquidity</p>;
  }

  const stepLabel =
    step === "idle" ? "Add Liquidity" :
    step === "confirming-0" || step === "approving-0" ? `Approving ${pair.token0Symbol}…` :
    step === "confirming-1" || step === "approving-1" ? `Approving ${pair.token1Symbol}…` :
    step === "adding" || step === "confirming-add" ? "Adding Liquidity…" :
    step === "done" ? "Done!" : "Add Liquidity";

  const busy = step !== "idle" && step !== "done" && step !== "error";

  return (
    <div className="space-y-4">
      {/* Amount inputs */}
      <div className="space-y-2">
        <AmountInput label={pair.token0Symbol} value={amount0} onChange={setAmount0} />
        <AmountInput label={pair.token1Symbol} value={amount1} onChange={setAmount1} />
      </div>

      {/* LP estimate */}
      {lpEstimate !== null && (
        <div className="rounded border border-border bg-surface-alt px-3 py-2 text-[12px]">
          <span className="text-text-muted">LP tokens you'll receive: </span>
          <span className="font-mono text-text-primary">{formatTokenAmount(lpEstimate, 18, 6)}</span>
        </div>
      )}

      {/* Slippage */}
      <SlippageSelector value={slippageBps} onChange={setSlippageBps} />

      {/* Action button */}
      <button
        type="button"
        disabled={busy || !amount0 || !amount1}
        onClick={step === "idle" || step === "error" ? handleAdd : undefined}
        className={cn(
          "w-full rounded py-2.5 text-[13px] font-semibold transition-colors",
          busy ? "bg-primary/50 text-white cursor-wait" :
          step === "done" ? "bg-bull/20 text-bull border border-bull/30" :
          "bg-primary text-white hover:bg-primary-hover",
        )}
      >
        {busy && <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />}
        {stepLabel}
      </button>

      {/* TX link */}
      {finalTxHash && (
        <a
          href={`${CHAIN.blockExplorer}/tx/${finalTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          View on Blockscout
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── Remove Tab ────────────────────────────────────────────────────────────────

function RemoveTab({ pair }: { pair: LiquidityPairMeta }) {
  const { address, isConnected } = useAccount();
  const [lpInput, setLpInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const { balance, sharePercent, amount0, amount1, totalSupply, reserve0, reserve1 } = usePoolShare(pair.address);

  const lpAmount = (() => {
    try { return lpInput ? parseUnits(lpInput, 18) : 0n; } catch { return 0n; }
  })();

  const out0 = totalSupply > 0n ? (lpAmount * reserve0) / totalSupply : 0n;
  const out1 = totalSupply > 0n ? (lpAmount * reserve1) / totalSupply : 0n;

  type Step = "idle" | "approving" | "confirming-approve" | "removing" | "confirming-remove" | "done" | "error";
  const [step, setStep] = useState<Step>("idle");
  const [finalTxHash, setFinalTxHash] = useState<`0x${string}` | undefined>();

  const { data: approveTx, writeContract: approve } = useWriteContract();
  const { data: removeTx, writeContract: remove } = useWriteContract();
  const { isSuccess: approveOK } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isSuccess: removeOK } = useWaitForTransactionReceipt({ hash: removeTx });

  useEffect(() => {
    if (step === "confirming-approve" && approveOK) setStep("removing");
  }, [step, approveOK]);
  useEffect(() => {
    if (step === "removing") {
      const min0 = out0 - (out0 * BigInt(slippageBps)) / 10000n;
      const min1 = out1 - (out1 * BigInt(slippageBps)) / 10000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      remove({
        address: ROUTER,
        abi: LIQUIDITY_ROUTER_ABI,
        functionName: "removeLiquidity",
        args: [pair.address, lpAmount, min0, min1, address ?? "0x0", deadline],
        gas: GAS_LIMITS.REMOVE_LIQUIDITY,
      });
      setStep("confirming-remove");
    }
  }, [step, out0, out1, slippageBps, lpAmount, address, pair.address, remove]);
  useEffect(() => { if (step === "confirming-remove" && removeOK) { setStep("done"); setFinalTxHash(removeTx); } }, [step, removeOK, removeTx]);

  const handleRemove = useCallback(() => {
    if (!address || lpAmount === 0n) return;
    approve({ address: pair.address, abi: ERC20_APPROVE_ABI, functionName: "approve", args: [ROUTER, lpAmount], gas: GAS_LIMITS.LP_APPROVE });
    setStep("confirming-approve");
  }, [address, lpAmount, approve, pair.address]);

  if (!isConnected) return <p className="text-center text-[13px] text-text-muted py-8">Connect wallet to remove liquidity</p>;

  if (balance === 0n) return <p className="text-center text-[13px] text-text-muted py-8">No position in this pool</p>;

  const busy = step !== "idle" && step !== "done" && step !== "error";
  const stepLabel = step === "idle" ? "Remove Liquidity" :
    step === "confirming-approve" || step === "approving" ? "Approving LP…" :
    step === "removing" || step === "confirming-remove" ? "Removing…" :
    step === "done" ? "Done!" : "Remove Liquidity";

  return (
    <div className="space-y-4">
      {/* Position card */}
      <div className="rounded border border-border bg-surface-alt px-3 py-2.5 space-y-1 text-[12px]">
        <p className="text-text-muted text-[10px] uppercase tracking-wider font-medium">Your Position</p>
        <div className="flex justify-between">
          <span className="text-text-secondary">LP Balance</span>
          <span className="font-mono text-text-primary">{formatTokenAmount(balance, 18, 6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Pool Share</span>
          <span className="font-mono text-text-primary">{sharePercent.toFixed(4)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">{pair.token0Symbol}</span>
          <span className="font-mono text-text-primary">{formatTokenAmount(amount0, 18, 6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">{pair.token1Symbol}</span>
          <span className="font-mono text-text-primary">{formatTokenAmount(amount1, 18, 6)}</span>
        </div>
      </div>

      {/* LP amount input + % buttons */}
      <div className="space-y-2">
        <AmountInput label="LP tokens" value={lpInput} onChange={setLpInput} />
        <div className="flex gap-2">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setLpInput(formatUnits((balance * BigInt(Math.round(pct * 100))) / 100n, 18))}
              className="flex-1 rounded border border-border py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
            >
              {pct === 1 ? "Max" : `${pct * 100}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Expected output */}
      {lpAmount > 0n && (
        <div className="rounded border border-border bg-surface-alt px-3 py-2 text-[12px] space-y-1">
          <p className="text-text-muted text-[10px] uppercase tracking-wider">Expected Output</p>
          <div className="flex justify-between">
            <span className="text-text-secondary">{pair.token0Symbol}</span>
            <span className="font-mono">{formatTokenAmount(out0, 18, 6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">{pair.token1Symbol}</span>
            <span className="font-mono">{formatTokenAmount(out1, 18, 6)}</span>
          </div>
        </div>
      )}

      <SlippageSelector value={slippageBps} onChange={setSlippageBps} />

      <button
        type="button"
        disabled={busy || lpAmount === 0n}
        onClick={step === "idle" || step === "error" ? handleRemove : undefined}
        className={cn(
          "w-full rounded py-2.5 text-[13px] font-semibold transition-colors",
          busy ? "bg-primary/50 text-white cursor-wait" :
          step === "done" ? "bg-bull/20 text-bull border border-bull/30" :
          "bg-primary text-white hover:bg-primary-hover",
        )}
      >
        {busy && <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />}
        {stepLabel}
      </button>

      {finalTxHash && (
        <a href={`${CHAIN.blockExplorer}/tx/${finalTxHash}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline">
          <CheckCircle className="h-3.5 w-3.5" />View on Blockscout<ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative rounded border border-border bg-surface-alt">
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.0"
        className="w-full bg-transparent px-3 py-2.5 text-[14px] font-mono text-text-primary outline-none pr-16"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-muted">
        {label}
      </span>
    </div>
  );
}

function SlippageSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Slippage</p>
      <div className="flex gap-2">
        {SLIPPAGE_OPTIONS.map((opt) => (
          <button
            key={opt.bps}
            type="button"
            onClick={() => onChange(opt.bps)}
            className={cn(
              "flex-1 rounded border py-1 text-[11px] font-mono transition-colors",
              value === opt.bps
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-text-secondary hover:bg-surface-hover",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @obidot/app typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/liquidity/
git commit -m "feat(app): add LiquidityPanel component with Add/Remove tabs"
```

---

## Task 10: Wire into Yields Page

**Files:**
- Modify: `modules/app/src/components/yields/yield-grid.tsx`
- Modify: `modules/app/src/app/yields/page.tsx`

- [ ] **Step 1: Update `yield-grid.tsx` — all 3 onEarn locations**

**Change 1 — `YieldGridProps` interface** (line 90):

```typescript
// Before:
onEarn?: (name: string, apy: number) => void;
// After:
onEarn?: (name: string, apy: number, pairMeta?: LiquidityPairMeta) => void;
```

Add import at top:
```typescript
import type { LiquidityPairMeta } from "@/types";
import { LP_PAIRS } from "@/lib/constants";
```

**Change 2 — call site in row** (line 324):

```typescript
// Before:
onClick={() => onEarn?.(y.name, y.apyPercent)}
// After:
onClick={() => {
  const pairMeta = item.isUniswap
    ? LP_PAIRS.find((p) => p.label === y.name)
    : undefined;
  onEarn?.(y.name, y.apyPercent, pairMeta);
}}
```

- [ ] **Step 2: Update `yields/page.tsx`**

Add import:
```typescript
import type { LiquidityPairMeta } from "@/types";
import { LiquidityPanel } from "@/components/liquidity/liquidity-panel";
```

Add state after `earnHint` state:
```typescript
const [selectedLpPair, setSelectedLpPair] = useState<LiquidityPairMeta | null>(null);
```

Update `handleEarn`:
```typescript
function handleEarn(name: string, apy: number, pairMeta?: LiquidityPairMeta) {
  if (pairMeta) {
    setSelectedLpPair(pairMeta);
  } else {
    setEarnHint({ name, apy });
    sidebarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
```

Add `LiquidityPanel` render before the closing `</div>` of the page:
```tsx
<LiquidityPanel
  pair={selectedLpPair}
  open={!!selectedLpPair}
  onClose={() => setSelectedLpPair(null)}
/>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @obidot/app typecheck
```
Expected: no errors.

- [ ] **Step 4: Lint**

```bash
pnpm --filter @obidot/app lint
```
Expected: no errors or only pre-existing warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/yields/yield-grid.tsx src/app/yields/page.tsx
git commit -m "feat(app): wire LiquidityPanel into yields page for UV2 rows"
```

---

## Post-Deploy: Update LP_PAIRS addresses

After Task 6 deploys successfully and you have real addresses:

- [ ] Update `LP_PAIRS` in `modules/app/src/lib/constants.ts` with the 5 pair addresses
- [ ] Update `CONTRACTS.LIQUIDITY_ROUTER` with the router address
- [ ] Commit: `chore: fill deployed LP pair + router addresses`

---

## Verification Checklist

- [ ] `forge test --match-contract "LiquidityPair|LiquidityRouter" -v` — all 10 tests pass
- [ ] `pnpm --filter @obidot/app typecheck` — no errors
- [ ] `pnpm --filter @obidot/app lint` — no errors
- [ ] Navigate to `/yields`, filter UniswapV2, click `+ Earn` on a UV2 row → panel slides in from right
- [ ] Connect wallet → Add tab shows amount inputs, slippage, LP estimate
- [ ] Remove tab shows "No position in this pool" (before adding) or position card after adding
