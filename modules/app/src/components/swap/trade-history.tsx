"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, History, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import {
  type SwapEvent,
  useSwapSubscription,
} from "@/hooks/use-graphql-subscription";
import { CHAIN } from "@/lib/constants";
import {
  getSwapExecutionsByRecipient,
  type IndexedSwapExecution,
} from "@/lib/graphql";

function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function SwapRow({ swap }: { swap: IndexedSwapExecution }) {
  const amtIn = parseFloat(formatUnits(BigInt(swap.amountIn), 18)).toFixed(4);
  const amtOut = parseFloat(formatUnits(BigInt(swap.amountOut), 18)).toFixed(4);
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-[12px] text-text-primary">
          {amtIn} → {amtOut}
        </p>
        <p className="text-[11px] text-text-muted">
          {swap.poolType} · {timeAgo(swap.timestamp)}
        </p>
      </div>
      <a
        href={`${CHAIN.blockExplorer}/tx/${swap.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-[11px] text-text-muted hover:text-primary transition-colors shrink-0 ml-3"
      >
        {swap.txHash.slice(0, 6)}…{swap.txHash.slice(-4)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export function TradeHistory() {
  const { address, isConnected } = useAccount();
  const [liveSwaps, setLiveSwaps] = useState<IndexedSwapExecution[]>([]);

  const {
    data: historicalSwaps,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trade-history", address],
    queryFn: () =>
      address ? getSwapExecutionsByRecipient(address, 20) : Promise.resolve([]),
    enabled: isConnected && !!address,
    staleTime: 60_000,
  });

  const handleNewSwap = useCallback(
    (event: SwapEvent) => {
      if (!address || event.recipient.toLowerCase() !== address.toLowerCase())
        return;
      const asIndexed: IndexedSwapExecution = {
        id: event.id,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
        tokenIn: event.tokenIn,
        tokenOut: event.tokenOut,
        amountIn: event.amountIn,
        amountOut: event.amountOut,
        recipient: event.recipient,
        poolType: event.poolType,
        hops: 1,
      };
      setLiveSwaps((prev) => [asIndexed, ...prev.slice(0, 19)]);
    },
    [address],
  );

  const { connected } = useSwapSubscription(handleNewSwap);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-center">
        <History className="h-6 w-6 text-text-muted" />
        <p className="text-[13px] text-text-muted">
          Connect wallet to view your trade history
        </p>
      </div>
    );
  }

  // Merge live + historical, deduplicate by id
  const allSwaps = [...liveSwaps, ...(historicalSwaps ?? [])].filter(
    (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-text-muted" />
          <span className="text-[15px] font-semibold text-text-primary">
            Trade History
          </span>
        </div>
        {!connected && (
          <span className="font-mono text-[11px] text-text-muted animate-pulse">
            Reconnecting…
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
          </div>
        )}
        {error && !isLoading && (
          <p className="text-[12px] text-danger py-4">
            Failed to load history — live updates only
          </p>
        )}
        {!isLoading && allSwaps.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <History className="h-6 w-6 text-text-muted" />
            <p className="text-[13px] text-text-secondary font-semibold">
              No trades yet
            </p>
            <p className="text-[12px] text-text-muted">
              Your swap history will appear here
            </p>
          </div>
        )}
        {allSwaps.map((s) => (
          <SwapRow key={s.id} swap={s} />
        ))}
      </div>

      <div className="shrink-0 px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted text-center">
          Swaps executed via SwapRouter · indexed by obi.index
        </p>
      </div>
    </div>
  );
}
