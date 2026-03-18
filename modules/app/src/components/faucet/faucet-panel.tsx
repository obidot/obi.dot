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
      setTxHash(undefined);
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
