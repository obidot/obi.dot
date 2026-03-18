# Obidot MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken route data and indexer by correcting stale contract addresses, then add vault seeding and a faucet UI to make the testnet MVP usable end-to-end.

**Architecture:** Stream 0 unblocks everything by patching three stale addresses/keys across two config files. Streams A–C are verification + operational steps (on-chain commands). Stream D adds the faucet page as new UI code in the Next.js app.

**Tech Stack:** TypeScript, Next.js 15 App Router, wagmi v2 / viem v2, Foundry `cast`, Fastify agent, Prisma + Supabase PostgreSQL

---

## File Map

| File | Change |
|---|---|
| `obi.index/src/config/contracts.ts` | Fix ObidotVault address (1-line edit) |
| `modules/agent/.env` | Fix SWAP_ROUTER_ADDRESS (1-line edit) |
| `modules/app/src/lib/abi.ts` | Add `ERC20_MINT_ABI` export |
| `modules/app/src/shared/navbar.ts` | Add `visibleOnChainId` to NavItem type + Faucet entry |
| `modules/app/src/components/layout/navbar.tsx` | Filter nav items by chainId |
| `modules/app/src/components/faucet/faucet-panel.tsx` | New: FaucetCard + FaucetPanel components |
| `modules/app/src/app/faucet/page.tsx` | New: `/faucet` page |

---

## Task 0: Fix stale contract addresses (Stream 0 — unblocks everything)

**Files:**
- Modify: `obi.index/src/config/contracts.ts` (line 29)
- Modify: `modules/agent/.env` (local only — not committed to git)

> **This task must land before any other task. All downstream tasks depend on it.**

> **Scope note:** The spec mentions four repos but based on actual code inspection, only two files need changing:
> - `obi-kit/packages/` — grep confirms no stale SwapRouter address in any `.ts` file
> - `modules/agent/src/config/constants.ts` — agent's tUSDC has no hardcoded `decimals: 18`; route math uses raw bigints from `getReserves()` directly. Decimal-formatted display is handled by the app's `TOKENS` array (`swap.ts`), which already has `decimals: 6`.
>
> If you want to double-check before proceeding:
> ```bash
> grep -r "0x0A85A1B0\|decimals.*18" /home/harry-riddle/dev/github.com/obidot/obi-kit/packages/ 2>/dev/null
> grep -n "tUSDC.*decimals\|decimals.*tUSDC" /home/harry-riddle/dev/github.com/obidot/obidot/modules/agent/src/config/constants.ts
> ```
> Both should return empty — no changes needed in those files.

- [ ] **Step 1: Fix ObidotVault address in obi.index**

Open `/home/harry-riddle/dev/github.com/obidot/obi.index/src/config/contracts.ts`.

Find this line (currently line 29):
```typescript
  ObidotVault: "0x4D327724C167ac4D66125a5DcC0724DDaCD63fF9" as Address,
```
Replace with:
```typescript
  ObidotVault: "0x03473a95971Ba0496786a615e21b1e87bDFf0025" as Address,
```

- [ ] **Step 2: Verify the change**

```bash
grep "ObidotVault" /home/harry-riddle/dev/github.com/obidot/obi.index/src/config/contracts.ts
```
Expected output:
```
  ObidotVault: "0x03473a95971Ba0496786a615e21b1e87bDFf0025" as Address,
```

- [ ] **Step 3: Fix SWAP_ROUTER_ADDRESS in agent .env**

Open `/home/harry-riddle/dev/github.com/obidot/obidot/modules/agent/.env`.

Find this line:
```
SWAP_ROUTER_ADDRESS=0x0A85A1B0bb893cab3b5fad7312ac241e92C8Badf
```
Replace with:
```
SWAP_ROUTER_ADDRESS=0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c
```

- [ ] **Step 4: Verify the change**

```bash
grep "SWAP_ROUTER" /home/harry-riddle/dev/github.com/obidot/obidot/modules/agent/.env
```
Expected output:
```
SWAP_ROUTER_ADDRESS=0x60a72d1e20c5dc40Bb5a24394f0583d863201A3c
```

- [ ] **Step 5: Commit**

```bash
# Commit obi.index fix (the only git-tracked change in this task)
cd /home/harry-riddle/dev/github.com/obidot/obi.index
git add src/config/contracts.ts
git commit -m "fix: update ObidotVault to Phase 17 address 0x03473a95"
```

> **Note:** `modules/agent/.env` is gitignored and must **not** be committed. The change to `.env` is local only — edit the file manually and do not add it to git.

---

## Task 1: Verify V2 pair reserves (Stream A)

**Files:** No code changes — on-chain read verification only.

> **Prerequisite:** Task 0 complete, `cast` available in PATH.

- [ ] **Step 1: Check tDOT/tUSDC pair reserves**

```bash
cast call 0x84864aff1aac120809f3a2ebf0be0f2cc3a51528 \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```
Expected: both `reserve0` and `reserve1` are non-zero (e.g. `1000000000000000000000` and `7000000000`).

- [ ] **Step 2: Check tUSDC/tETH pair reserves**

```bash
cast call 0x9E628e8F4f26771F3208E2B9071d843cFeF45b1a \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```
Expected: both reserves non-zero.

- [ ] **Step 3: Check tDOT/tETH pair reserves**

```bash
cast call 0x412cfeb621f5a43a08adda9c8d09f29651570a01 \
  "getReserves()(uint112,uint112,uint32)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```
Expected: both reserves non-zero.

- [ ] **Step 4: If any reserve is zero — re-seed**

If any pair returned `0,0,0`, re-run the seeding script:
```bash
cd /home/harry-riddle/dev/github.com/obidot/obi.router
export PRIVATE_KEY=$(grep "^PRIVATE_KEY" .env | cut -d= -f2)
forge script script/DeployPairsAndSeed.s.sol \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}" \
  --broadcast
```
Then re-run steps 1–3 to confirm reserves are non-zero.

- [ ] **Step 5: Start agent and smoke-test /api/routes**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/agent
pnpm dev &
sleep 5

# tDOT → tUSDC, 1 tDOT = 1e18 raw
curl -s "http://localhost:3001/api/routes?\
tokenIn=0x2402C804aD8a6217BF73D8483dA7564065c56083&\
tokenOut=0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626&\
amountIn=1000000000000000000" | jq .
```
Expected: `success: true`, at least one route with `status: "live"` and `amountOut` approximately `"7000000"` (7 tUSDC in 6-decimal units, NOT `7000000000000000000`).

- [ ] **Step 6: Verify app displays correct amount**

Open `http://localhost:3010/swap/polkadot-hub-testnet/tdot-to-tusdc` in a browser.
Enter `1` in the tDOT input field.
Expected: output shows `≈ 7.0000 tUSDC` (not `0.000007`).

---

## Task 2: Bootstrap obi.index indexer (Stream B)

**Files:** No code changes — env verification + database setup + indexer startup.

> **Prerequisite:** Task 0 complete (vault address fixed). Supabase DATABASE_URL configured in obi.index `.env`.

- [ ] **Step 1: Verify required env vars**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obi.index
cat .env | grep -E "DATABASE_URL|RPC_URL|BLOCKSCOUT"
```
Expected — all three present:
```
DATABASE_URL=postgresql://...supabase...
RPC_URL=https://eth-rpc-testnet.polkadot.io/
BLOCKSCOUT_URL=https://blockscout-testnet.polkadot.io
```
If any are missing, add them to `.env` before continuing.

- [ ] **Step 2: Apply schema to Supabase**

```bash
npm run db:push
```
Expected: "Your database is now in sync with your Prisma schema." (or equivalent Prisma output). No errors.

- [ ] **Step 3: Generate Prisma client**

```bash
npm run db:generate
```
Expected: Prisma client generated successfully.

- [ ] **Step 4: Start the indexer**

```bash
npm run dev
```
Watch the startup logs. Expected within 10 seconds:
```
Apollo Server ready at http://localhost:4350/graphql
Poller started, polling every 60000ms
```
If `ObidotVault` address appears in logs, verify it says `0x03473a95...` (confirming Task 0 fix took effect).

- [ ] **Step 5: Backfill historical events**

In a separate terminal:
```bash
cd /home/harry-riddle/dev/github.com/obidot/obi.index
npm run seed
```
Expected: script completes without error. May take 2–5 minutes.

- [ ] **Step 6: Verify data via GraphQL**

Open `http://localhost:4350/graphql` and run:
```graphql
query {
  oracleStates { feedAddress price decimals lastUpdated }
  vaultState { totalAssets totalSupply paused }
  swapExecutions(limit: 5) {
    id txHash amountIn amountOut poolType timestamp
  }
}
```
Expected: `oracleStates` and `vaultState` return data (non-null). `swapExecutions` may be empty if no swaps have been made yet.

---

## Task 3: Seed vault with tDOT and start agent loop (Stream C)

**Files:** No code changes — on-chain transactions only.

> **Prerequisite:** Task 0 complete. `cast` available. `.env` in obi.router has `PRIVATE_KEY` (without `0x` prefix — use `"0x${PRIVATE_KEY}"` in all commands).

- [ ] **Step 1: Load wallet credentials**

```bash
export PRIVATE_KEY=$(grep "^PRIVATE_KEY" /home/harry-riddle/dev/github.com/obidot/obi.router/.env | cut -d= -f2)
export DEPLOYER_ADDR=$(cast wallet address --private-key "0x${PRIVATE_KEY}")
echo "Deployer: $DEPLOYER_ADDR"
```
Verify the deployer address looks correct (0x-prefixed EVM address).

- [ ] **Step 2: Mint 100,000 tDOT to deployer wallet**

```bash
cast send 0x2402C804aD8a6217BF73D8483dA7564065c56083 \
  "mint(address,uint256)" \
  "$DEPLOYER_ADDR" 100000000000000000000000 \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```
Expected: transaction confirmed, status `1` (success).

- [ ] **Step 3: Verify tDOT balance**

```bash
cast call 0x2402C804aD8a6217BF73D8483dA7564065c56083 \
  "balanceOf(address)(uint256)" \
  "$DEPLOYER_ADDR" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```
Expected: `100000000000000000000000` (100,000 × 10^18) or greater.

- [ ] **Step 4: Approve vault to spend tDOT**

```bash
cast send 0x2402C804aD8a6217BF73D8483dA7564065c56083 \
  "approve(address,uint256)" \
  0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  100000000000000000000000 \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```
Expected: tx confirmed, status `1`.

- [ ] **Step 5: Deposit 10,000 tDOT into vault**

```bash
cast send 0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  "deposit(uint256,address)" \
  10000000000000000000000 \
  "$DEPLOYER_ADDR" \
  --rpc-url https://eth-rpc-testnet.polkadot.io \
  --private-key "0x${PRIVATE_KEY}"
```
Expected: tx confirmed, status `1`.

- [ ] **Step 6: Verify vault totalAssets**

```bash
cast call 0x03473a95971Ba0496786a615e21b1e87bDFf0025 \
  "totalAssets()(uint256)" \
  --rpc-url https://eth-rpc-testnet.polkadot.io
```
Expected: `10000000000000000000000` (10,000 × 10^18).

- [ ] **Step 7: Start agent autonomous loop**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/agent
pnpm dev
```
Watch logs. Within 30 seconds, expected:
```
Agent decision: HOLD | DEPLOY | REBALANCE
```
If the agent errors on vault read, confirm `VAULT_ADDRESS` in `.env` matches `0x03473a95...`.

---

## Task 4: Add ERC20_MINT_ABI to app abi.ts (Stream D — Step 1)

**Files:**
- Modify: `modules/app/src/lib/abi.ts`

This ABI fragment is needed by the faucet component. Add it as a named export at the end of the file.

- [ ] **Step 1: Append ERC20_MINT_ABI export**

Open `modules/app/src/lib/abi.ts`. At the very end (after the last `];`), add:

```typescript

export const ERC20_MINT_ABI = [
    {
        name: "mint",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
    },
] as const;
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app
pnpm typecheck 2>&1 | tail -5
```
Expected: 0 errors. If there are errors, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/lib/abi.ts
git commit -m "feat(faucet): add ERC20_MINT_ABI to abi.ts"
```

---

## Task 5: Add Faucet nav item with chain-gate (Stream D — Step 2)

**Files:**
- Modify: `modules/app/src/shared/navbar.ts`
- Modify: `modules/app/src/components/layout/navbar.tsx`

The Faucet link should only appear when connected to Polkadot Hub TestNet (chainId 420420417).

- [ ] **Step 1: Add visibleOnChainId to NavItem type in navbar.ts**

Open `modules/app/src/shared/navbar.ts`. Find the `NavItem` type:
```typescript
export type NavItem = {
  label: string;
  href: string | ((context: NavHrefContext) => string);
  children?: NavItem[];
};
```
Replace with:
```typescript
export type NavItem = {
  label: string;
  href: string | ((context: NavHrefContext) => string);
  children?: NavItem[];
  visibleOnChainId?: number;
};
```

- [ ] **Step 2: Add Faucet entry to NAV_ITEMS**

In the same file, find the `NAV_ITEMS` array. Add the Faucet entry before `{ label: "Dashboard", href: "/" }`:
```typescript
  { label: "Faucet", href: "/faucet", visibleOnChainId: 420420417 },
```

The end of NAV_ITEMS should look like:
```typescript
  { label: "Agent", href: "/agent" },
  { label: "Faucet", href: "/faucet", visibleOnChainId: 420420417 },
  { label: "Dashboard", href: "/" },
];
```

- [ ] **Step 3: Add chainId-based filtering in Navbar component**

Open `modules/app/src/components/layout/navbar.tsx`.

At the top, add `useChainId` to the wagmi imports:
```typescript
import { useAccount, useChainId } from "wagmi";
```

Inside the `Navbar` function body, add after the existing hook calls:
```typescript
const chainId = useChainId();
```

Find the `.map((item) => {` line inside `NavigationMenuList`. Before the map, add the filter:
```typescript
{NAV_ITEMS.filter(
  (item) =>
    item.visibleOnChainId === undefined ||
    item.visibleOnChainId === chainId,
).map((item) => {
```
And close the filter's JSX after the existing `})}` (the closing of the map).

The full block should look like:
```tsx
<NavigationMenuList className="h-full gap-0">
  {NAV_ITEMS.filter(
    (item) =>
      item.visibleOnChainId === undefined ||
      item.visibleOnChainId === chainId,
  ).map((item) => {
    // ... existing map body unchanged ...
  })}
</NavigationMenuList>
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app
pnpm typecheck 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add modules/app/src/shared/navbar.ts \
        modules/app/src/components/layout/navbar.tsx
git commit -m "feat(faucet): add chain-gated Faucet nav link"
```

---

## Task 6: Build FaucetPanel component (Stream D — Step 3)

**Files:**
- Create: `modules/app/src/components/faucet/faucet-panel.tsx`

This file contains `FaucetCard` (one per token) and `FaucetPanel` (the three-card grid). Uses wagmi `useWriteContract` + `useWaitForTransactionReceipt` — same pattern as the existing swap form.

- [ ] **Step 1: Create the file**

Create `modules/app/src/components/faucet/faucet-panel.tsx` with this content:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_MINT_ABI } from "@/lib/abi";
import { cn } from "@/lib/utils";

// ── Token drip config ────────────────────────────────────────────────────────

const FAUCET_TOKENS = [
  {
    symbol: "tDOT",
    name: "Test DOT",
    address: "0x2402C804aD8a6217BF73D8483dA7564065c56083" as `0x${string}`,
    amount: 100n * 10n ** 18n,
    display: "100 tDOT",
  },
  {
    symbol: "tUSDC",
    name: "Test USDC",
    address: "0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626" as `0x${string}`,
    amount: 1000n * 10n ** 6n,   // 6 decimals
    display: "1,000 tUSDC",
  },
  {
    symbol: "tETH",
    name: "Test ETH",
    address: "0xd92a5325fB3A56f5012F1EBD1bd37573d981144e" as `0x${string}`,
    amount: 10n ** 17n,           // 0.1 tETH
    display: "0.1 tETH",
  },
] as const;

const EXPLORER_BASE = "https://blockscout-testnet.polkadot.io/tx/";

// ── FaucetCard ───────────────────────────────────────────────────────────────

type CardState = "idle" | "pending" | "confirming" | "done" | "error";

function FaucetCard({
  token,
}: {
  token: (typeof FAUCET_TOKENS)[number];
}) {
  const { address: userAddress } = useAccount();
  const [state, setState] = useState<CardState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();

  const { writeContractAsync } = useWriteContract();

  // wagmi v2 removed the onSuccess callback from useWaitForTransactionReceipt.
  // Use isSuccess in a useEffect instead.
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isConfirmed && state === "confirming") {
      setState("done");
    }
  }, [isConfirmed, state]);

  async function handleMint() {
    if (!userAddress) return;
    try {
      setState("pending");
      setErrorMsg(undefined);
      const hash = await writeContractAsync({
        address: token.address,
        abi: ERC20_MINT_ABI,
        functionName: "mint",
        args: [userAddress, token.amount],
      });
      setTxHash(hash);
      setState("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
      setState("error");
    }
  }

  const isLoading = state === "pending" || state === "confirming";
  void isConfirmed; // consumed via useEffect above

  return (
    <div className="panel rounded-lg p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[15px] font-semibold text-text-primary">
            {token.name}
          </p>
          <p className="font-mono text-[12px] text-text-muted">{token.symbol}</p>
        </div>
        <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-text-secondary">
          Testnet
        </span>
      </div>

      {/* Amount */}
      <div className="rounded bg-surface-hover px-3 py-2 text-center">
        <span className="font-mono text-[20px] font-bold text-text-primary">
          {token.display}
        </span>
        <p className="mt-0.5 text-[11px] text-text-muted">per mint</p>
      </div>

      {/* Action */}
      {state === "done" ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13px] font-medium text-bull">Minted!</p>
          {txHash && (
            <a
              href={`${EXPLORER_BASE}${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-text-muted underline"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-6)}
            </a>
          )}
          <button
            type="button"
            onClick={() => setState("idle")}
            className="btn-ghost text-[12px]"
          >
            Mint again
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleMint}
            disabled={isLoading || !userAddress}
            className={cn(
              "btn-primary w-full",
              (!userAddress) && "opacity-50 cursor-not-allowed",
            )}
          >
            {state === "pending"
              ? "Confirm in wallet…"
              : state === "confirming"
                ? "Confirming…"
                : !userAddress
                  ? "Connect wallet"
                  : `Mint ${token.display}`}
          </button>
          {state === "error" && errorMsg && (
            <p className="text-[11px] text-danger leading-snug">{errorMsg}</p>
          )}
        </>
      )}
    </div>
  );
}

// ── FaucetPanel ──────────────────────────────────────────────────────────────

export function FaucetPanel() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {FAUCET_TOKENS.map((token) => (
        <FaucetCard key={token.symbol} token={token} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app
pnpm typecheck 2>&1 | tail -10
```
Expected: 0 errors. The component already uses `useEffect` + `isSuccess` (not `onSuccess`) for wagmi v2 compatibility.

- [ ] **Step 3: Commit**

```bash
git add modules/app/src/components/faucet/faucet-panel.tsx
git commit -m "feat(faucet): add FaucetPanel component with per-token mint cards"
```

---

## Task 7: Build faucet page (Stream D — Step 4)

**Files:**
- Create: `modules/app/src/app/faucet/page.tsx`

- [ ] **Step 1: Create the page**

Create `modules/app/src/app/faucet/page.tsx` with this content:

```tsx
"use client";

import { FaucetPanel } from "@/components/faucet/faucet-panel";

export default function FaucetPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[22px] font-bold text-text-primary">
          Test Token Faucet
        </h1>
        <p className="text-[14px] text-text-secondary">
          Mint test tokens to your connected wallet. You pay your own gas.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded border border-border-subtle bg-surface px-4 py-3">
        <p className="text-[12px] text-text-muted">
          ⚠️ These tokens have no real value. For Polkadot Hub TestNet use only.
          Each mint is a separate on-chain transaction.
        </p>
      </div>

      {/* Cards */}
      <FaucetPanel />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd /home/harry-riddle/dev/github.com/obidot/obidot/modules/app
pnpm typecheck 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 3: Verify build passes**

```bash
pnpm build 2>&1 | tail -15
```
Expected: build succeeds, no type errors. If there are errors, fix them.

- [ ] **Step 4: Commit**

```bash
git add modules/app/src/app/faucet/page.tsx
git commit -m "feat(faucet): add /faucet page"
```

---

## Task 8: Integration smoke test

**Files:** No changes — verification only.

> **Prerequisite:** All Tasks 0–7 complete. Agent running. obi.index running. App running on :3010.

- [ ] **Step 1: Verify faucet page renders**

Open `http://localhost:3010/faucet`.
Expected: Three cards — tDOT (100), tUSDC (1,000), tETH (0.1).
Without wallet connected: buttons show "Connect wallet" and are disabled.
After connecting wallet on Polkadot Hub TestNet: "Mint X" buttons become active.
After connecting on a different chain: "Faucet" nav link should be absent from the navbar.

- [ ] **Step 2: Mint tDOT via UI**

Connect to Polkadot Hub TestNet in the app. Click "Mint 100 tDOT" on the faucet page.
Expected: wallet prompts for signature → "Confirming…" → "Minted!" with block explorer link.
Click the explorer link — verify tx on Blockscout.

- [ ] **Step 3: Full swap flow**

Open `http://localhost:3010/swap/polkadot-hub-testnet/tdot-to-tusdc`.
Enter `1` tDOT → expected output `≈ 7.0000 tUSDC`.
Execute swap → tx confirmed on-chain.

- [ ] **Step 4: Verify swap appears in indexer within 60s**

```graphql
query {
  swapExecutions(limit: 1) {
    txHash amountIn amountOut poolType timestamp
  }
}
```
At `http://localhost:4350/graphql`. Expected: the swap tx appears within one polling cycle (60s).

- [ ] **Step 5: Verify agent loop decision logged**

Watch agent stdout or run:
```bash
curl -s http://localhost:3001/api/agent/log | jq '.[-1]'
```
Expected: most-recent log entry shows `decision` field (`HOLD`, `DEPLOY`, or `REBALANCE`) and a `timestamp` within the last 5 minutes.

---

## MVP Success Checklist

- [ ] `GET /api/routes?tokenIn=tDOT&tokenOut=tUSDC&amountIn=1e18` → `amountOut ≈ "7000000"` (7 tUSDC, 6-decimal)
- [ ] App shows "≈ 7.0000 tUSDC" for 1 tDOT input
- [ ] Swap executes on-chain → tx confirmed
- [ ] Swap event appears in obi.index GraphQL within 60s
- [ ] `/faucet` page mints tDOT in one wallet signature
- [ ] "Faucet" nav link visible only on Polkadot Hub TestNet
- [ ] Vault has ≥ 10,000 tDOT deposited
- [ ] Agent loop logs a decision every 5 minutes
