"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useAccount,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import { cn, formatTokenAmount } from "@/lib/format";
import { CONTRACTS, SWAP_ROUTER_ABI, ERC20_APPROVE_ABI } from "@/lib/constants";
import { useSwapQuote, useSwapRoutes } from "@/hooks/use-swap";
import { QuoteDisplay } from "./quote-display";
import { Loader2, ArrowDownUp, AlertTriangle, Settings2 } from "lucide-react";
import type { SwapToken } from "@/types";
import { PoolType, POOL_TYPE_LABELS } from "@/types";

// ── Available tokens on Polkadot Hub TestNet ──────────────────────────────

const TOKENS: SwapToken[] = [
  {
    address: CONTRACTS.TEST_DOT,
    symbol: "tDOT",
    name: "Test DOT",
    decimals: 18,
  },
  {
    address: CONTRACTS.NATIVE_DOT,
    symbol: "DOT",
    name: "Polkadot DOT",
    decimals: 10,
  },
  {
    address: CONTRACTS.NATIVE_USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
];

const SLIPPAGE_OPTIONS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "2%", bps: 200 },
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

// ── Swap step state machine ────────────────────────────────────────────────
// idle → approving → approve-confirming → swapping → swap-confirming → done
type SwapStep =
  | "idle"
  | "approving"
  | "approve-confirming"
  | "swapping"
  | "swap-confirming"
  | "done";

// ── Component ─────────────────────────────────────────────────────────────

export function SwapForm() {
  // ── State ───────────────────────────────────────────────────────────────
  const [tokenInIdx, setTokenInIdx] = useState(0);
  const [tokenOutIdx, setTokenOutIdx] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(200); // 2% default (matches SlippageGuard)
  const [showSettings, setShowSettings] = useState(false);
  const [swapStep, setSwapStep] = useState<SwapStep>("idle");

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];

  // ── Wallet ──────────────────────────────────────────────────────────────
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({
    address,
    token: tokenIn.address as Address,
    query: { enabled: isConnected && !!address },
  });

  // ── Router status ───────────────────────────────────────────────────────
  const { data: routes } = useSwapRoutes();
  const routerDeployed = routes?.routerDeployed ?? false;
  const routerPaused = routes?.routerPaused ?? false;
  const routerAddress = CONTRACTS.SWAP_ROUTER;
  const routerReady =
    routerDeployed &&
    !routerPaused &&
    (routerAddress as string) !== ZERO_ADDRESS;

  // ── Quote ───────────────────────────────────────────────────────────────
  const parsedAmountIn = useMemo(() => {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0)
      return "";
    try {
      return parseUnits(amountIn, tokenIn.decimals).toString();
    } catch {
      return "";
    }
  }, [amountIn, tokenIn.decimals]);

  const {
    data: quote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useSwapQuote({
    pool: ZERO_ADDRESS, // let quoter find best pool
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: parsedAmountIn,
  });

  // ── Min output (with slippage) ──────────────────────────────────────────
  const minAmountOut = useMemo(() => {
    if (!quote) return BigInt(0);
    const out = BigInt(quote.amountOut);
    return out - (out * BigInt(slippageBps)) / BigInt(10_000);
  }, [quote, slippageBps]);

  // ── Token approval ──────────────────────────────────────────────────────
  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: approveWalletPending,
    error: approveError,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // ── Swap execution ─────────────────────────────────────────────────────
  const {
    data: swapTxHash,
    writeContract: writeSwap,
    isPending: swapWalletPending,
    error: swapError,
  } = useWriteContract();

  const { isLoading: swapConfirming, isSuccess: swapConfirmed } =
    useWaitForTransactionReceipt({ hash: swapTxHash });

  // ── Step progression ───────────────────────────────────────────────────
  // When the approval is confirmed on-chain, fire the actual swap.
  useEffect(() => {
    if (
      swapStep === "approve-confirming" &&
      approveConfirmed &&
      quote &&
      parsedAmountIn &&
      address
    ) {
      setSwapStep("swapping");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min
      // Use swapFlat() — flat args, PolkaVM-compatible (no nested struct calldata)
      writeSwap({
        address: routerAddress as Address,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapFlat",
        args: [
          quote.source, // poolType: uint8
          quote.pool as Address, // pool: address
          tokenIn.address as Address, // tokenIn: address
          tokenOut.address as Address, // tokenOut: address
          BigInt(quote.feeBps), // feeBps: uint256
          ZERO_BYTES32, // data: bytes32
          BigInt(parsedAmountIn), // amountIn: uint256
          minAmountOut, // minAmountOut: uint256
          address, // to: address
          deadline, // deadline: uint256
        ],
      });
    }
  }, [
    swapStep,
    approveConfirmed,
    quote,
    parsedAmountIn,
    address,
    routerAddress,
    tokenIn,
    tokenOut,
    minAmountOut,
    writeSwap,
  ]);

  // Track swap wallet-pending → confirming → done transitions
  useEffect(() => {
    if (swapStep === "swapping" && swapWalletPending) {
      // wallet prompt accepted — tx is in mempool, wait for receipt
      setSwapStep("swap-confirming");
    }
  }, [swapStep, swapWalletPending]);

  useEffect(() => {
    if (swapStep === "swap-confirming" && swapConfirmed) {
      setSwapStep("done");
    }
  }, [swapStep, swapConfirmed]);

  // Reset step on errors
  useEffect(() => {
    if (approveError || swapError) {
      setSwapStep("idle");
    }
  }, [approveError, swapError]);

  const isExecuting = swapStep !== "idle" && swapStep !== "done";

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      setAmountIn(raw);
    }
  };

  const handleFlipTokens = () => {
    setTokenInIdx(tokenOutIdx);
    setTokenOutIdx(tokenInIdx);
    setAmountIn("");
  };

  const handlePct = (fraction: number) => {
    if (!isConnected || !balanceData) return;
    const bal = Number(formatUnits(balanceData.value, balanceData.decimals));
    if (bal <= 0) return;
    const val = (bal * fraction).toFixed(6).replace(/\.?0+$/, "");
    setAmountIn(val);
  };

  const handleSwap = useCallback(() => {
    if (!routerReady || !quote || !parsedAmountIn || !address) return;
    if (swapStep !== "idle" && swapStep !== "done") return;

    setSwapStep("approving");
    // Step 1: approve router to spend tokenIn
    writeApprove({
      address: tokenIn.address as Address,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [routerAddress as Address, BigInt(parsedAmountIn)],
    });
  }, [
    routerReady,
    quote,
    parsedAmountIn,
    address,
    swapStep,
    writeApprove,
    tokenIn,
    routerAddress,
  ]);

  // After wallet confirms the approve tx, advance to approve-confirming state
  useEffect(() => {
    if (swapStep === "approving" && approveWalletPending) {
      setSwapStep("approve-confirming");
    }
  }, [swapStep, approveWalletPending]);

  // Reset to idle when user changes tokens/amount so they can re-swap
  useEffect(() => {
    setSwapStep("idle");
  }, [tokenInIdx, tokenOutIdx, amountIn]);

  // ── Derived display values ──────────────────────────────────────────────
  const displayBalance =
    isConnected && balanceData
      ? `${formatTokenAmount(balanceData.value.toString(), balanceData.decimals, 4)} ${tokenIn.symbol}`
      : "\u2014";

  const amountOutDisplay = quote
    ? formatUnits(BigInt(quote.amountOut), tokenOut.decimals)
    : "";

  const minOutDisplay =
    minAmountOut > BigInt(0)
      ? formatUnits(minAmountOut, tokenOut.decimals)
      : "";

  const sourceLabel = quote ? POOL_TYPE_LABELS[quote.source as PoolType] : "";

  // ── Not-deployed banner ─────────────────────────────────────────────────
  const showNotDeployed = (routerAddress as string) === ZERO_ADDRESS;

  // ── Button label ────────────────────────────────────────────────────────
  const buttonLabel = () => {
    if (!isConnected) return "CONNECT WALLET";
    if (!routerReady) return "ROUTER UNAVAILABLE";
    if (!parsedAmountIn) return "ENTER AMOUNT";
    if (!quote) return "FETCHING QUOTE...";
    switch (swapStep) {
      case "approving":
        return "APPROVING...";
      case "approve-confirming":
        return "CONFIRMING APPROVAL...";
      case "swapping":
        return "SWAPPING...";
      case "swap-confirming":
        return "CONFIRMING SWAP...";
      case "done":
        return "SWAP AGAIN";
      default:
        return `SWAP ${tokenIn.symbol} \u2192 ${tokenOut.symbol}`;
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-text-primary">Swap</h3>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="btn-ghost p-1.5"
          aria-label="Swap settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Slippage settings */}
      {showSettings && (
        <div className="mb-4 rounded-md border border-border bg-background/60 p-3">
          <p className="text-[11px] text-text-muted mb-2">Slippage Tolerance</p>
          <div className="flex gap-1.5">
            {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className={cn(
                  "btn-ghost flex-1 py-1 text-[11px] font-mono",
                  slippageBps === bps && "ring-1 ring-primary text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Not-deployed banner */}
      {showNotDeployed && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" />
          <p className="text-[11px] text-text-secondary">
            SwapRouter is not yet deployed. Quotes are unavailable until
            deployment.
          </p>
        </div>
      )}

      {/* Token In selector + amount */}
      <div className="mb-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-text-muted">You Pay</span>
          <span className="font-mono text-[11px] text-text-secondary">
            {displayBalance}
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amountIn}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            aria-label="Amount to swap"
            className="input-trading pr-24 text-right text-lg"
          />
          <select
            value={tokenInIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (idx === tokenOutIdx) handleFlipTokens();
              else setTokenInIdx(idx);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-hover rounded px-2 py-0.5 font-mono text-[12px] text-text-primary border border-border cursor-pointer"
          >
            {TOKENS.map((t, i) => (
              <option key={t.address} value={i}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Percentage buttons */}
      <div className="flex gap-1.5 mb-2">
        {[0.25, 0.5, 0.75, 1.0].map((frac) => (
          <button
            key={frac}
            type="button"
            onClick={() => handlePct(frac)}
            className="btn-ghost flex-1 py-1 text-[11px] font-mono"
          >
            {frac * 100}%
          </button>
        ))}
      </div>

      {/* Flip button */}
      <div className="flex justify-center my-1">
        <button
          type="button"
          onClick={handleFlipTokens}
          className="btn-ghost p-1.5 rounded-full border border-border hover:border-primary transition-colors"
          aria-label="Flip tokens"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      {/* Token Out display */}
      <div className="mb-3 mt-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-text-muted">You Receive</span>
          {sourceLabel && (
            <span className="font-mono text-[10px] text-accent">
              via {sourceLabel}
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            readOnly
            value={quoteLoading ? "..." : amountOutDisplay}
            placeholder="0.00"
            aria-label="Amount to receive"
            className="input-trading pr-24 text-right text-lg text-text-secondary"
          />
          <select
            value={tokenOutIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (idx === tokenInIdx) handleFlipTokens();
              else setTokenOutIdx(idx);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-hover rounded px-2 py-0.5 font-mono text-[12px] text-text-primary border border-border cursor-pointer"
          >
            {TOKENS.map((t, i) => (
              <option key={t.address} value={i}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quote details */}
      {quote && parsedAmountIn && (
        <QuoteDisplay
          quote={quote}
          tokenOut={tokenOut}
          slippageBps={slippageBps}
          minAmountOut={minOutDisplay}
        />
      )}

      {/* Quote error */}
      {quoteError && parsedAmountIn && (
        <div className="mb-3 text-center">
          <p className="text-[11px] text-danger">
            Quote unavailable — {quoteError.message.slice(0, 80)}
          </p>
        </div>
      )}

      {/* Swap confirmation */}
      {swapStep === "done" && swapTxHash && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[11px] text-primary font-medium">
            Swap confirmed!
          </p>
          <p className="text-[10px] text-text-muted font-mono mt-0.5 break-all">
            {swapTxHash}
          </p>
        </div>
      )}

      {/* Approval / swap errors */}
      {(approveError || swapError) && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
          <p className="text-[11px] text-danger">
            {approveError
              ? `Approval failed — ${approveError.message.slice(0, 100)}`
              : `Swap failed — ${swapError?.message.slice(0, 100)}`}
          </p>
        </div>
      )}

      {/* Execute button */}
      <button
        type="button"
        disabled={
          !isConnected ||
          !parsedAmountIn ||
          !quote ||
          isExecuting ||
          !routerReady
        }
        onClick={handleSwap}
        className="btn-primary"
      >
        {isExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
        {buttonLabel()}
      </button>

      {!isConnected && (
        <p className="mt-2 text-center text-[10px] text-text-muted">
          Connect wallet to enable swaps
        </p>
      )}
    </div>
  );
}
