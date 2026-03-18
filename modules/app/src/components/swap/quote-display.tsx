"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { cn } from "@/lib/format";
import { PoolType, POOL_TYPE_LABELS } from "@/types";
import type { SwapQuoteResult, SwapToken } from "@/types";
import { ChevronDown, ChevronUp } from "lucide-react";

interface QuoteDisplayProps {
  quote: SwapQuoteResult;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  slippageBps: number;
  minAmountOut: string;
  priceImpactBps?: number;
}

export function QuoteDisplay({
  quote,
  tokenIn,
  tokenOut,
  slippageBps,
  minAmountOut,
  priceImpactBps = 0,
}: QuoteDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const feePercent = (quote.feeBps / 100).toFixed(2);
  const sourceLabel = POOL_TYPE_LABELS[quote.source as PoolType] ?? "Unknown";
  const slippagePercent = (slippageBps / 100).toFixed(1);
  const impactPct = (priceImpactBps / 100).toFixed(2);

  const impactColor =
    priceImpactBps < 50
      ? "text-bull"
      : priceImpactBps < 200
        ? "text-warning"
        : "text-danger";

  const rateDisplay = (() => {
    try {
      const inFloat = Number(formatUnits(BigInt(quote.amountIn), tokenIn.decimals));
      const outFloat = Number(formatUnits(BigInt(quote.amountOut), tokenOut.decimals));
      if (inFloat <= 0) return null;
      return `1 ${tokenIn.symbol} = ${(outFloat / inFloat).toFixed(6)} ${tokenOut.symbol}`;
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-3 mb-4 pb-3 border-b border-border">
      {/* Big metric row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Min Received */}
        {minAmountOut && (
          <div className="bg-background/60 border border-border px-3 py-2.5">
            <p className="execution-metric-label mb-1">Min Received</p>
            <p className="execution-metric-value text-text-primary">
              {Number(minAmountOut).toFixed(4)}
              <span className="text-[12px] text-text-muted font-normal ml-1">{tokenOut.symbol}</span>
            </p>
          </div>
        )}
        {/* Price Impact */}
        <div className="bg-background/60 border border-border px-3 py-2.5">
          <p className="execution-metric-label mb-1">Price Impact</p>
          <p className={cn("execution-metric-value", impactColor)}>
            {impactPct}
            <span className="text-[12px] font-normal ml-0.5">%</span>
          </p>
        </div>
      </div>

      {/* Expandable details */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-[12px] text-text-muted hover:text-text-secondary transition-colors"
      >
        <span>{rateDisplay ?? "Details"}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Route</span>
            <span className="font-mono text-[13px] text-accent">{sourceLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Pool Fee</span>
            <span className="font-mono text-[13px] text-text-secondary">{feePercent}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-text-muted">Max Slippage</span>
            <span className="font-mono text-[13px] text-text-secondary">{slippagePercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
