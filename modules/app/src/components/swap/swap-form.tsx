"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
import {
  Loader2,
  ArrowDownUp,
  AlertTriangle,
  ChevronDown,
  Check,
  Wallet,
} from "lucide-react";
import type { SwapToken, SwapRouteResult } from "@/types";
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
    address: CONTRACTS.TEST_USDC,
    symbol: "tUSDC",
    name: "Test USDC",
    decimals: 6,
  },
  {
    address: CONTRACTS.TEST_ETH,
    symbol: "tETH",
    name: "Test ETH",
    decimals: 18,
  },
];

// Token color map for colored-circle initials
const TOKEN_COLORS: Record<string, { circle: string; text: string }> = {
  tDOT: { circle: "bg-primary/20", text: "text-primary" },
  tUSDC: { circle: "bg-accent/20", text: "text-accent" },
  tETH: { circle: "bg-secondary/20", text: "text-secondary" },
};

function tokenColor(symbol: string) {
  return (
    TOKEN_COLORS[symbol] ?? {
      circle: "bg-surface-hover",
      text: "text-text-secondary",
    }
  );
}

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

// ── Token Picker Dropdown ─────────────────────────────────────────────────

interface TokenPickerProps {
  selectedIdx: number;
  onSelect: (idx: number) => void;
  disabledIdx?: number;
}

function TokenPicker({
  selectedIdx,
  onSelect,
  disabledIdx,
}: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const token = TOKENS[selectedIdx];
  const colors = tokenColor(token.symbol);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-surface-hover px-3 py-2",
          "hover:border-primary/40 transition-colors min-w-[110px]",
        )}
      >
        {/* Colored circle with initials */}
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            colors.circle,
            colors.text,
          )}
        >
          {token.symbol.slice(0, 2)}
        </span>
        <span className="font-mono text-[13px] font-semibold text-text-primary flex-1 text-left">
          {token.symbol}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
          {TOKENS.map((t, i) => {
            const c = tokenColor(t.symbol);
            const isSelected = i === selectedIdx;
            const isDisabled = i === disabledIdx;
            return (
              <button
                key={t.address}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect(i);
                    setOpen(false);
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-surface-hover",
                  isDisabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    c.circle,
                    c.text,
                  )}
                >
                  {t.symbol.slice(0, 2)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[12px] font-semibold text-text-primary">
                    {t.symbol}
                  </p>
                  <p className="text-[10px] text-text-muted truncate">
                    {t.name}
                  </p>
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

interface SwapFormProps {
  /** Called whenever tokenIn, tokenOut, or amountIn (wei) changes. */
  onInputChange?: (params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
  }) => void;
  /** Route selected in the RouteDiagram — uses swapMultiHop when hops > 1 */
  selectedRoute?: SwapRouteResult | null;
  /** Pre-select token in by index (from URL router param) */
  initialTokenInIdx?: number;
  /** Pre-select token out by index (from URL router param) */
  initialTokenOutIdx?: number;
}

export function SwapForm({
  onInputChange,
  selectedRoute,
  initialTokenInIdx = 0,
  initialTokenOutIdx = 1,
}: SwapFormProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [tokenInIdx, setTokenInIdx] = useState(initialTokenInIdx);
  const [tokenOutIdx, setTokenOutIdx] = useState(initialTokenOutIdx);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(200); // 2% default (matches SlippageGuard)
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

  // ── Notify parent of input changes (for route diagram) ─────────────────
  useEffect(() => {
    onInputChange?.({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn: parsedAmountIn,
    });
  }, [tokenIn.address, tokenOut.address, parsedAmountIn, onInputChange]);

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

      const isMultiHop = selectedRoute && selectedRoute.hops.length > 1;

      if (isMultiHop) {
        // Build Route[] from the selected route's hops
        const routes = selectedRoute.hops.map((hop) => ({
          poolType: Number(hop.poolType) as unknown as number,
          pool: hop.pool as Address,
          tokenIn: hop.tokenIn as Address,
          tokenOut: hop.tokenOut as Address,
          feeBps: BigInt(hop.feeBps),
          data: ZERO_BYTES32,
        }));
        writeSwap({
          address: routerAddress as Address,
          abi: SWAP_ROUTER_ABI,
          functionName: "swapMultiHop",
          args: [
            routes,
            BigInt(parsedAmountIn),
            minAmountOut,
            address,
            deadline,
          ],
        });
      } else {
        // Single-hop via swapFlat() — PolkaVM-compatible (no nested struct calldata)
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
    selectedRoute,
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
      : null;

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
      default: {
        const isMultiHop = selectedRoute && selectedRoute.hops.length > 1;
        const suffix = isMultiHop ? ` (${selectedRoute.hops.length}-HOP)` : "";
        return `SWAP ${tokenIn.symbol} \u2192 ${tokenOut.symbol}${suffix}`;
      }
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* ── Inline slippage selector ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-muted">Max Slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors border",
                slippageBps === bps
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "btn-ghost border-transparent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Not-deployed banner */}
      {showNotDeployed && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" />
          <p className="text-[11px] text-text-secondary">
            SwapRouter is not yet deployed. Quotes are unavailable until
            deployment.
          </p>
        </div>
      )}

      {/* ── Token In box ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-background/60 p-4">
        {/* Header row: label left, wallet icon + balance right */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-text-muted">You Pay</p>
          {displayBalance && (
            <div className="flex items-center gap-1 text-[11px] text-text-muted font-mono">
              <Wallet className="h-3 w-3" />
              <span>{displayBalance}</span>
            </div>
          )}
        </div>

        {/* Amount LEFT, token picker RIGHT */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              inputMode="decimal"
              value={amountIn}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              aria-label="Amount to swap"
              className="input-trading text-left text-2xl font-semibold w-full bg-transparent border-0 focus:ring-0 p-0"
            />
            <p className="text-left text-[11px] text-text-muted mt-1 font-mono">
              {amountIn && Number(amountIn) > 0 ? "≈ —" : ""}
            </p>
          </div>

          <TokenPicker
            selectedIdx={tokenInIdx}
            onSelect={setTokenInIdx}
            disabledIdx={tokenOutIdx}
          />
        </div>

        {/* Percentage buttons */}
        <div className="flex gap-1.5 mt-3">
          {[
            { label: "25%", frac: 0.25 },
            { label: "50%", frac: 0.5 },
            { label: "75%", frac: 0.75 },
            { label: "MAX", frac: 1.0 },
          ].map(({ label, frac }) => (
            <button
              key={label}
              type="button"
              onClick={() => handlePct(frac)}
              className="btn-ghost flex-1 py-1 text-[11px] font-mono"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Flip button ──────────────────────────────────────────────── */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          type="button"
          onClick={handleFlipTokens}
          className={cn(
            "rounded-full border border-border bg-surface p-2",
            "hover:border-primary hover:bg-primary/10 hover:text-primary",
            "transition-all duration-150",
          )}
          aria-label="Flip tokens"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      {/* ── Token Out box ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-background/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-text-muted">You Receive</p>
          {sourceLabel && (
            <span className="font-mono text-[10px] text-accent">
              via {sourceLabel}
            </span>
          )}
        </div>

        {/* Amount LEFT, token picker RIGHT */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              readOnly
              value={quoteLoading ? "..." : amountOutDisplay}
              placeholder="0.00"
              aria-label="Amount to receive"
              className="input-trading text-left text-2xl font-semibold w-full bg-transparent border-0 focus:ring-0 p-0 text-text-secondary"
            />
            <p className="text-left text-[11px] text-text-muted mt-1 font-mono">
              {amountOutDisplay && Number(amountOutDisplay) > 0 ? "≈ —" : ""}
            </p>
          </div>

          <TokenPicker
            selectedIdx={tokenOutIdx}
            onSelect={setTokenOutIdx}
            disabledIdx={tokenInIdx}
          />
        </div>
      </div>

      {/* Quote details */}
      {quote && parsedAmountIn && (
        <QuoteDisplay
          quote={quote}
          tokenIn={tokenIn}
          tokenOut={tokenOut}
          slippageBps={slippageBps}
          minAmountOut={minOutDisplay}
        />
      )}

      {/* Quote error */}
      {quoteError && parsedAmountIn && (
        <div className="text-center">
          <p className="text-[11px] text-danger">
            Quote unavailable — {quoteError.message.slice(0, 80)}
          </p>
        </div>
      )}

      {/* Swap confirmation */}
      {swapStep === "done" && swapTxHash && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-[11px] text-primary font-semibold">
            Swap confirmed!
          </p>
          <p className="text-[10px] text-text-muted font-mono mt-0.5 break-all">
            {swapTxHash}
          </p>
        </div>
      )}

      {/* Approval / swap errors */}
      {(approveError || swapError) && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-[11px] text-danger">
            {approveError
              ? `Approval failed — ${approveError.message.slice(0, 100)}`
              : `Swap failed — ${swapError?.message.slice(0, 100)}`}
          </p>
        </div>
      )}

      {/* Multi-hop route hint */}
      {selectedRoute && selectedRoute.hops.length > 1 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-[11px] text-primary">
            {selectedRoute.hops.length}-hop route selected via{" "}
            {selectedRoute.hops.map((h) => h.poolLabel).join(" → ")}
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
        <p className="text-center text-[10px] text-text-muted">
          Connect wallet to enable swaps
        </p>
      )}
    </div>
  );
}
