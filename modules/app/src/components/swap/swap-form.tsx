"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import { cn, formatTokenAmount } from "@/lib/format";
import {
  CONTRACTS,
  SLIPPAGE_OPTIONS,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  CHAIN,
  GAS_LIMITS,
} from "@/lib/constants";
import { SWAP_ROUTER_ABI, ERC20_APPROVE_ABI } from "@/lib/abi";
import { useSwapQuote, useSwapRoutes } from "@/hooks/use-swap";
import { QuoteDisplay } from "./quote-display";
import {
  Loader2,
  ArrowDownUp,
  AlertTriangle,
  Wallet,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import type { SwapToken, SwapRouteResult, SwapStep, SplitRouteSelection } from "@/types";
import { PoolType, POOL_TYPE_LABELS, resolvePoolType } from "@/types";
import { TOKENS } from "@/shared/trade/swap";
import { polkadotHubTestnet } from "@/lib/chains";
import TokenPicker from "./token-picker";

interface SwapFormProps {
  onInputChange?: (params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
  }) => void;
  selectedRoute?: SwapRouteResult | null;
  selectedSplitRoutes?: SplitRouteSelection[];
  initialTokenInIdx?: number;
  initialTokenOutIdx?: number;
}

export default function SwapForm({
  onInputChange,
  selectedRoute,
  selectedSplitRoutes,
  initialTokenInIdx = 0,
  initialTokenOutIdx = 1,
}: SwapFormProps) {
  const [tokenInIdx, setTokenInIdx] = useState(initialTokenInIdx);
  const [tokenOutIdx, setTokenOutIdx] = useState(initialTokenOutIdx);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(200);
  const [swapStep, setSwapStep] = useState<SwapStep>("idle");
  const [impactConfirmed, setImpactConfirmed] = useState(false);

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];

  // ── Wallet ─────────────────────────────────────────────────────────────
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isTestnet = chainId === polkadotHubTestnet.id;
  const { data: balanceInData } = useBalance({
    address,
    token: tokenIn.address as Address,
    query: { enabled: isConnected && !!address },
  });
  const { data: balanceOutData } = useBalance({
    address,
    token: tokenOut.address as Address,
    query: { enabled: isConnected && !!address },
  });

  // ── Router status ──────────────────────────────────────────────────────
  const { data: routes } = useSwapRoutes();
  const routerDeployed = routes?.routerDeployed ?? false;
  const routerPaused = routes?.routerPaused ?? false;
  const routerAddress = CONTRACTS.SWAP_ROUTER;
  const routerReady =
    routerDeployed &&
    !routerPaused &&
    (routerAddress as string) !== ZERO_ADDRESS;

  // ── Split mode detection ────────────────────────────────────────────────
  const isSplitMode = !!selectedSplitRoutes && selectedSplitRoutes.length === 2;
  const selectedRouteIsLocal = selectedRoute?.routeType === "local";
  const selectedRouteHasHops = (selectedRoute?.hops.length ?? 0) > 0;
  const selectedRouteIsLive = selectedRoute?.status === "live";
  const selectedRouteExecutable =
    !!selectedRoute &&
    selectedRouteIsLocal &&
    selectedRouteHasHops &&
    selectedRouteIsLive;
  const splitRoutesExecutable =
    !!isSplitMode &&
    !!selectedSplitRoutes &&
    selectedSplitRoutes.length === 2 &&
    selectedSplitRoutes.every(
      (s) =>
        s.route.routeType === "local" &&
        s.route.status === "live" &&
        s.route.hops.length > 0,
    );

  // ── Quote ──────────────────────────────────────────────────────────────
  const parsedAmountIn = useMemo(() => {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) return "";
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
    pool: ZERO_ADDRESS,
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: parsedAmountIn,
  });

  // Notify parent of input changes (for route diagram)
  useEffect(() => {
    onInputChange?.({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn: parsedAmountIn,
      tokenOutSymbol: tokenOut.symbol,
      tokenOutDecimals: tokenOut.decimals,
    });
  }, [tokenIn.address, tokenOut.address, tokenOut.symbol, tokenOut.decimals, parsedAmountIn, onInputChange]);

  // ── Price impact check ──────────────────────────────────────────────────
  const activeImpactBps = isSplitMode
    ? Math.max(...selectedSplitRoutes!.map((s) => Number(s.route.totalPriceImpactBps)))
    : selectedRoute
      ? Number(selectedRoute.totalPriceImpactBps)
      : 0;
  const highImpact = activeImpactBps > 200; // >2%

  // Reset impact confirmation when route changes
  useEffect(() => {
    setImpactConfirmed(false);
  }, [selectedRoute?.id, selectedSplitRoutes?.length]);

  // ── Effective output amount — prefer route finder (accurate) over on-chain quote ──
  // The on-chain quoter can return placeholder values on testnet.
  const effectiveAmountOut = useMemo(() => {
    if (selectedRoute) return selectedRoute.amountOut;
    return quote?.amountOut ?? null;
  }, [selectedRoute, quote]);

  // Merged quote for display and slippage math — same source/fee as on-chain,
  // but amountOut replaced by the accurate route-finder value.
  const displayQuote = useMemo(() => {
    if (!quote) return undefined;
    if (!effectiveAmountOut) return quote;
    return { ...quote, amountOut: effectiveAmountOut };
  }, [quote, effectiveAmountOut]);

  // ── Min output (with slippage) ──────────────────────────────────────────
  const minAmountOut = useMemo(() => {
    if (!effectiveAmountOut) return BigInt(0);
    const out = BigInt(effectiveAmountOut);
    return out - (out * BigInt(slippageBps)) / BigInt(10_000);
  }, [effectiveAmountOut, slippageBps]);

  // ── Split min output ────────────────────────────────────────────────────
  const splitMinAmountOut = useMemo(() => {
    if (!isSplitMode || !selectedSplitRoutes) return BigInt(0);
    // Sum best outputs from each split leg (rough estimate)
    const totalOut = selectedSplitRoutes.reduce((sum, s) => {
      const out = BigInt(s.route.amountOut ?? "0");
      return sum + out;
    }, BigInt(0));
    return totalOut - (totalOut * BigInt(slippageBps)) / BigInt(10_000);
  }, [isSplitMode, selectedSplitRoutes, slippageBps]);

  // ── Allowance check ─────────────────────────────────────────────────────
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn.address as Address,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: [address as Address, routerAddress as Address],
    query: {
      enabled: isConnected && !!address && !!parsedAmountIn,
      staleTime: 5_000,
    },
  });

  const needsApproval = useMemo(() => {
    if (!parsedAmountIn) return false;
    if (currentAllowance === undefined) return true;
    return (currentAllowance as bigint) < BigInt(parsedAmountIn);
  }, [parsedAmountIn, currentAllowance]);

  // ── Token approval ──────────────────────────────────────────────────────
  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: approveWalletPending,
    error: approveError,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // ── Swap execution ──────────────────────────────────────────────────────
  const {
    data: swapTxHash,
    writeContract: writeSwap,
    isPending: swapWalletPending,
    error: swapError,
  } = useWriteContract();

  const { isLoading: swapConfirming, isSuccess: swapConfirmed } =
    useWaitForTransactionReceipt({ hash: swapTxHash });

  // Extracted swap writer — called directly (sufficient allowance) or after approval
  const executeSwap = useCallback(() => {
    if (!quote || !parsedAmountIn || !address) return;
    if (isSplitMode && !splitRoutesExecutable) return;
    if (!isSplitMode && !selectedRouteExecutable) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    if (isSplitMode && selectedSplitRoutes && selectedSplitRoutes.length === 2) {
      const legs = selectedSplitRoutes.map((s) => ({
        route: {
          poolType: s.route.hops[0] ? 3 : 0,
          pool: (s.route.hops[0]?.pool ?? ZERO_ADDRESS) as Address,
          tokenIn: tokenIn.address as Address,
          tokenOut: tokenOut.address as Address,
          feeBps: BigInt(s.route.hops[0]?.feeBps ?? 30),
          data: ZERO_BYTES32,
        },
        weight: BigInt(s.weight),
      }));
      writeSwap({
        address: routerAddress as Address,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapSplit",
        gas: GAS_LIMITS.SWAP,
        args: [
          legs,
          tokenIn.address as Address,
          tokenOut.address as Address,
          BigInt(parsedAmountIn),
          splitMinAmountOut,
          address,
          deadline,
        ],
      });
    } else {
      if (!selectedRoute) return;

      const isMultiHop = selectedRoute.hops.length > 1;
      const isSingleHopSelected = selectedRoute.hops.length === 1;

      if (isMultiHop && selectedRoute) {
        const routeHops = selectedRoute.hops.map((hop) => ({
          poolType: (resolvePoolType(hop.poolType) ?? PoolType.Custom) as unknown as number,
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
          gas: GAS_LIMITS.SWAP,
          args: [routeHops, BigInt(parsedAmountIn), minAmountOut, address, deadline],
        });
      } else if (isSingleHopSelected && selectedRoute) {
        // Single-hop selected route — use the route's pool/poolType (not the on-chain quoter)
        const hop = selectedRoute.hops[0];
        const poolTypeNum = resolvePoolType(hop.poolType) ?? PoolType.Custom;
        writeSwap({
          address: routerAddress as Address,
          abi: SWAP_ROUTER_ABI,
          functionName: "swapFlat",
          gas: GAS_LIMITS.SWAP,
          args: [
            poolTypeNum,
            hop.pool as Address,
            hop.tokenIn as Address,
            hop.tokenOut as Address,
            BigInt(hop.feeBps),
            ZERO_BYTES32,
            BigInt(parsedAmountIn),
            minAmountOut,
            address,
            deadline,
          ],
        });
      }
    }
  }, [
    quote, parsedAmountIn, address, routerAddress, tokenIn, tokenOut,
    minAmountOut, splitMinAmountOut, selectedRoute, isSplitMode,
    selectedSplitRoutes, writeSwap, selectedRouteExecutable, splitRoutesExecutable,
  ]);

  // Step progression: approval confirmed → fire swap
  useEffect(() => {
    if (swapStep === "approve-confirming" && approveConfirmed && quote && parsedAmountIn && address) {
      void refetchAllowance();
      setSwapStep("swapping");
      executeSwap();
    }
  }, [swapStep, approveConfirmed, quote, parsedAmountIn, address, executeSwap, refetchAllowance]);

  useEffect(() => {
    if (swapStep === "swapping" && swapWalletPending) setSwapStep("swap-confirming");
  }, [swapStep, swapWalletPending]);

  useEffect(() => {
    if (swapStep === "swap-confirming" && swapConfirmed) setSwapStep("done");
  }, [swapStep, swapConfirmed]);

  useEffect(() => {
    if (approveError || swapError) setSwapStep("idle");
  }, [approveError, swapError]);

  const isExecuting = swapStep !== "idle" && swapStep !== "done";

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmountIn(raw);
  };

  const handleFlipTokens = () => {
    setTokenInIdx(tokenOutIdx);
    setTokenOutIdx(tokenInIdx);
    setAmountIn("");
  };

  const handlePct = (fraction: number) => {
    if (!isConnected || !balanceInData) return;
    const bal = Number(formatUnits(balanceInData.value, balanceInData.decimals));
    if (bal <= 0) return;
    const val = (bal * fraction).toFixed(6).replace(/\.?0+$/, "");
    setAmountIn(val);
  };

  const handleSwap = useCallback(() => {
    if (!routerReady || !quote || !parsedAmountIn || !address) return;
    if (swapStep !== "idle" && swapStep !== "done") return;
    if (isSplitMode && !splitRoutesExecutable) return;
    if (!isSplitMode && !selectedRouteExecutable) return;
    if (highImpact && !impactConfirmed) return; // safety: must confirm via button click first

    if (!needsApproval) {
      // Allowance already covers the amount — skip to swap
      setSwapStep("swapping");
      executeSwap();
    } else {
      // Need to approve first
      setSwapStep("approving");
      writeApprove({
        address: tokenIn.address as Address,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        gas: GAS_LIMITS.APPROVE,
        args: [routerAddress as Address, BigInt(parsedAmountIn)],
      });
    }
  }, [routerReady, quote, parsedAmountIn, address, swapStep, highImpact, impactConfirmed, needsApproval, executeSwap, writeApprove, tokenIn, routerAddress, isSplitMode, splitRoutesExecutable, selectedRouteExecutable]);

  useEffect(() => {
    if (swapStep === "approving" && approveWalletPending) setSwapStep("approve-confirming");
  }, [swapStep, approveWalletPending]);

  useEffect(() => {
    setSwapStep("idle");
  }, [tokenInIdx, tokenOutIdx, amountIn]);

  // ── Derived display values ───────────────────────────────────────────────
  const displayBalanceIn =
    isConnected && balanceInData
      ? `${formatTokenAmount(balanceInData.value.toString(), balanceInData.decimals, 4)} ${tokenIn.symbol}`
      : null;

  const displayBalanceOut =
    isConnected && balanceOutData
      ? `${formatTokenAmount(balanceOutData.value.toString(), balanceOutData.decimals, 4)} ${tokenOut.symbol}`
      : null;

  const amountOutDisplay = effectiveAmountOut
    ? formatUnits(BigInt(effectiveAmountOut), tokenOut.decimals)
    : "";

  const minOutDisplay =
    minAmountOut > BigInt(0) ? formatUnits(minAmountOut, tokenOut.decimals) : "";

  // On testnet the on-chain quoter returns Hydration as best, which is misleading.
  // Prefer the selected route's pool label; fall back to quote source only on mainnet.
  const sourceLabel = selectedRoute
    ? (selectedRoute.hops[0]?.poolLabel ?? "")
    : !isTestnet && quote
      ? POOL_TYPE_LABELS[quote.source as PoolType]
      : "";
  const showNotDeployed = (routerAddress as string) === ZERO_ADDRESS;

  const explorerBase = CHAIN.blockExplorer;

  // ── Button label ──────────────────────────────────────────────────────────
  const buttonLabel = () => {
    if (!isConnected) return "CONNECT WALLET";
    if (!routerReady) return "ROUTER UNAVAILABLE";
    if (!parsedAmountIn) return "ENTER AMOUNT";
    if (!quote) return "FETCHING QUOTE…";
    if (!selectedRoute && !isSplitMode) return "SELECT A ROUTE";
    if (selectedRoute && !selectedRouteIsLocal) return "USE CROSS-CHAIN TAB";
    if (selectedRoute && !selectedRouteHasHops) return "ROUTE NOT EXECUTABLE";
    if (selectedRoute?.status === "mainnet_only") return "MAINNET ONLY";
    if (selectedRoute?.status === "coming_soon") return "COMING SOON";
    if (highImpact && !impactConfirmed) return "CONFIRM HIGH IMPACT";
    switch (swapStep) {
      case "approving": return "APPROVING…";
      case "approve-confirming": return "CONFIRMING APPROVAL…";
      case "swapping": return "SWAPPING…";
      case "swap-confirming": return "CONFIRMING SWAP…";
      case "done": return "SWAP AGAIN";
      default: {
        if (needsApproval) return `APPROVE ${tokenIn.symbol}`;
        if (isSplitMode) {
          if (!selectedSplitRoutes || selectedSplitRoutes.length !== 2) {
            return "SELECT 2 SPLIT ROUTES";
          }
          const w0 = selectedSplitRoutes![0].weight / 100;
          const w1 = selectedSplitRoutes![1].weight / 100;
          return `SPLIT SWAP ${w0}% / ${w1}%`;
        }
        const isMultiHop = selectedRouteExecutable && selectedRoute.hops.length > 1;
        const suffix = isMultiHop ? ` (${selectedRoute.hops.length}-HOP)` : "";
        return `SWAP ${tokenIn.symbol} \u2192 ${tokenOut.symbol}${suffix}`;
      }
    }
  };

  const canExecute =
    isConnected &&
    !!parsedAmountIn &&
    !!quote &&
    (selectedRouteExecutable || splitRoutesExecutable) &&
    !isExecuting &&
    routerReady;

  return (
    <div className="p-5 space-y-4">
      {/* ── Slippage selector ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] text-text-muted">Max Slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={cn(
                "px-2.5 py-1 rounded-none text-[14px] font-mono transition-colors border",
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
        <div className="flex items-start gap-2 rounded-none border border-warning/30 bg-warning/5 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" />
          <p className="text-[14px] text-text-secondary">
            SwapRouter is not yet deployed. Quotes are unavailable until deployment.
          </p>
        </div>
      )}

      {/* ── Token In ────────────────────────────────────────────────────── */}
      <div className="rounded-none border border-border bg-background/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[14px] text-text-muted">You Pay</p>
          {displayBalanceIn && (
            <div className="flex items-center gap-1.5 text-[14px] text-text-muted font-mono">
              <Wallet className="h-3.5 w-3.5" />
              <span>{displayBalanceIn}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              inputMode="decimal"
              value={amountIn}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              aria-label="Amount to swap"
              className="input-trading text-left text-[28px] font-bold tracking-tight w-full bg-transparent border-0 focus:ring-0 p-0"
            />
            <p className="text-left text-[14px] text-text-muted mt-1 font-mono">
              {amountIn && Number(amountIn) > 0 ? "≈ market value" : ""}
            </p>
          </div>
          <TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />
        </div>

        <div className="flex gap-1.5 mt-4">
          {[{ label: "25%", frac: 0.25 }, { label: "50%", frac: 0.5 }, { label: "75%", frac: 0.75 }, { label: "MAX", frac: 1.0 }].map(
            ({ label, frac }) => (
              <button key={label} type="button" onClick={() => handlePct(frac)} className="btn-ghost flex-1 py-1 text-[14px] font-mono">
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* ── Flip button ─────────────────────────────────────────────────── */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          type="button"
          onClick={handleFlipTokens}
          className={cn(
            "rounded-none border border-border bg-surface p-2",
            "hover:border-primary hover:bg-primary/10 hover:text-primary",
            "transition-colors duration-150",
          )}
          aria-label="Flip tokens"
        >
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </div>

      {/* ── Token Out ───────────────────────────────────────────────────── */}
      <div className="rounded-none border border-border bg-background/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[14px] text-text-muted">You Receive</p>
          <div className="flex items-center gap-3">
            {displayBalanceOut && (
              <div className="flex items-center gap-1.5 text-[14px] text-text-muted font-mono">
                <Wallet className="h-3.5 w-3.5" />
                <span>{displayBalanceOut}</span>
              </div>
            )}
            {sourceLabel && !displayBalanceOut && (
              <span className="font-mono text-[14px] text-accent">via {sourceLabel}</span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              readOnly
              value={quoteLoading ? "…" : amountOutDisplay}
              placeholder="0.00"
              aria-label="Amount to receive"
              className="input-trading text-left text-[28px] font-bold tracking-tight w-full bg-transparent border-0 focus:ring-0 p-0 text-text-secondary"
            />
            <p className="text-left text-[14px] text-text-muted mt-1 font-mono">
              {amountOutDisplay && Number(amountOutDisplay) > 0 ? "≈ market value" : ""}
            </p>
          </div>
          <TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />
        </div>
        {sourceLabel && displayBalanceOut && (
          <p className="text-[14px] text-text-muted mt-3 font-mono">via {sourceLabel}</p>
        )}
      </div>

      {/* Quote details */}
      {displayQuote && parsedAmountIn && !isSplitMode && (
        <QuoteDisplay
          quote={displayQuote}
          tokenIn={tokenIn}
          tokenOut={tokenOut}
          slippageBps={slippageBps}
          minAmountOut={minOutDisplay}
          priceImpactBps={activeImpactBps}
        />
      )}

      {/* Split mode summary */}
      {isSplitMode && selectedSplitRoutes && (
        <div className="rounded-none border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
          <p className="text-[14px] text-primary font-semibold">Split Route</p>
          {selectedSplitRoutes.map((s) => (
            <div key={s.route.id} className="flex items-center justify-between">
              <span className="text-[13px] text-text-secondary font-mono">{s.route.id}</span>
              <span className="text-[13px] text-primary font-mono font-semibold">{(s.weight / 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* High price impact warning */}
      {highImpact && parsedAmountIn && quote && (
        <div className="rounded-none border border-danger/40 bg-danger/5 px-3 py-2.5">
          <div className="flex items-start gap-2 mb-2">
            <TriangleAlert className="h-4 w-4 text-danger mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] text-danger font-semibold">High Price Impact</p>
              <p className="text-[13px] text-text-secondary mt-0.5">
                This swap has {(activeImpactBps / 100).toFixed(2)}% price impact. You may receive significantly less than expected.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImpactConfirmed((v) => !v)}
            className={cn(
              "flex items-center gap-2 text-[13px] font-mono border px-2 py-1 transition-colors",
              impactConfirmed
                ? "border-danger bg-danger/20 text-danger"
                : "border-danger/40 text-text-muted hover:border-danger hover:text-danger",
            )}
          >
            <span className={cn("w-3.5 h-3.5 border flex items-center justify-center", impactConfirmed ? "border-danger bg-danger/30" : "border-danger/40")}>
              {impactConfirmed && <span className="text-danger text-[9px] font-bold">✓</span>}
            </span>
            I understand the risk
          </button>
        </div>
      )}

      {/* Quote error */}
      {quoteError && parsedAmountIn && (
        <div className="text-center">
          <p className="text-[14px] text-danger">Quote unavailable — {quoteError.message.slice(0, 80)}</p>
        </div>
      )}

      {/* Non-executable selected route hint */}
      {selectedRoute && !selectedRouteExecutable && !isSplitMode && (
        <div className="rounded-none border border-warning/30 bg-warning/5 px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {selectedRoute.routeType !== "local"
              ? "Selected route is cross-chain. Use the Cross-chain tab to execute XCM/bridge routes."
              : selectedRoute.hops.length === 0
                ? "Selected route is informational only and cannot be executed on this tab."
                : selectedRoute.status === "mainnet_only"
                  ? "Selected route is available on mainnet only."
                  : "Selected route is not executable right now."}
          </p>
        </div>
      )}

      {/* Swap confirmed with block explorer link */}
      {swapStep === "done" && swapTxHash && (
        <div className="rounded-none border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-[14px] text-primary font-semibold">Swap confirmed!</p>
          <a
            href={`${explorerBase}/tx/${swapTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] text-text-muted hover:text-primary font-mono mt-0.5 break-all transition-colors"
          >
            <span className="truncate">{swapTxHash}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      )}

      {/* Approval tx link */}
      {(swapStep === "approve-confirming" || swapStep === "swapping") && approveTxHash && (
        <div className="rounded-none border border-border px-3 py-2">
          <p className="text-[13px] text-text-muted">Approval tx:</p>
          <a
            href={`${explorerBase}/tx/${approveTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] text-text-muted hover:text-primary font-mono break-all transition-colors"
          >
            <span className="truncate">{approveTxHash}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      )}

      {/* Approval / swap errors */}
      {(approveError || swapError) && (
        <div className="rounded-none border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-[14px] text-danger">
            {approveError
              ? `Approval failed — ${approveError.message.slice(0, 100)}`
              : `Swap failed — ${swapError?.message.slice(0, 100)}`}
          </p>
        </div>
      )}

      {/* Multi-hop route hint */}
      {selectedRoute && selectedRoute.hops.length > 1 && !isSplitMode && (
        <div className="rounded-none border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-[14px] text-primary">
            {selectedRoute.hops.length}-hop route via{" "}
            {selectedRoute.hops.map((h) => h.poolLabel).join(" → ")}
          </p>
        </div>
      )}

      {/* Execute button */}
      <button
        type="button"
        disabled={!canExecute}
        onClick={highImpact && !impactConfirmed ? () => setImpactConfirmed(true) : handleSwap}
        className={cn(
          "btn-primary",
          highImpact && !impactConfirmed && "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        )}
      >
        {isExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
        {buttonLabel()}
      </button>

      {!isConnected && (
        <p className="text-center text-[13px] text-text-muted">Connect wallet to enable swaps</p>
      )}
    </div>
  );
}
