import { formatUnits } from "viem";
import { PoolType, POOL_TYPE_LABELS } from "@/types";
import type { SwapQuoteResult, SwapToken } from "@/types";

interface QuoteDisplayProps {
  quote: SwapQuoteResult;
  tokenOut: SwapToken;
  slippageBps: number;
  minAmountOut: string;
}

/** Compact swap-quote summary shown below the output field */
export function QuoteDisplay({
  quote,
  tokenOut,
  slippageBps,
  minAmountOut,
}: QuoteDisplayProps) {
  const feePercent = (quote.feeBps / 100).toFixed(2);
  const sourceLabel = POOL_TYPE_LABELS[quote.source as PoolType] ?? "Unknown";
  const slippagePercent = (slippageBps / 100).toFixed(1);

  return (
    <div className="space-y-1.5 mb-4 pb-3 border-b border-border">
      {/* Source */}
      <div className="flex justify-between">
        <span className="text-[11px] text-text-muted">Route</span>
        <span className="font-mono text-[12px] text-accent">{sourceLabel}</span>
      </div>

      {/* Fee */}
      <div className="flex justify-between">
        <span className="text-[11px] text-text-muted">Pool Fee</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {feePercent}%
        </span>
      </div>

      {/* Slippage tolerance */}
      <div className="flex justify-between">
        <span className="text-[11px] text-text-muted">Slippage</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {slippagePercent}%
        </span>
      </div>

      {/* Min received */}
      {minAmountOut && (
        <div className="flex justify-between">
          <span className="text-[11px] text-text-muted">Min Received</span>
          <span className="font-mono text-[12px] text-text-secondary">
            {Number(minAmountOut).toFixed(6)}{" "}
            <span className="text-text-muted">{tokenOut.symbol}</span>
          </span>
        </div>
      )}
    </div>
  );
}
