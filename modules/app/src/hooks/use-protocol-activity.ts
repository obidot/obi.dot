"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getIndexedVaultStats,
  getIndexedSwapExecutions,
  getIndexedDeposits,
  type IndexedVaultStats,
  type IndexedSwapExecution,
  type IndexedDeposit,
} from "@/lib/graphql";
import {
  useSwapSubscription,
  type SwapEvent,
} from "@/hooks/use-graphql-subscription";
import { formatUnits } from "viem";

export interface ProtocolActivityData {
  stats: IndexedVaultStats;
  recentSwaps: IndexedSwapExecution[];
  recentDeposits: IndexedDeposit[];
  recentVolume: string;
  liveSwapCount: number;
}

function calcVolume(swaps: IndexedSwapExecution[]): string {
  const total = swaps.reduce((sum, s) => sum + BigInt(s.amountIn), 0n);
  return parseFloat(formatUnits(total, 18)).toFixed(2);
}

export function useProtocolActivity() {
  const [liveSwapCount, setLiveSwapCount] = useState(0);
  const [liveSwaps, setLiveSwaps] = useState<IndexedSwapExecution[]>([]);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["protocol-activity-stats"],
    queryFn: getIndexedVaultStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: recentSwaps, isLoading: swapsLoading } = useQuery({
    queryKey: ["protocol-activity-swaps"],
    queryFn: () => getIndexedSwapExecutions(20),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: recentDeposits } = useQuery({
    queryKey: ["protocol-activity-deposits"],
    queryFn: () => getIndexedDeposits(10),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const handleSwapEvent = useCallback((event: SwapEvent) => {
    setLiveSwapCount((prev) => prev + 1);
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
    setLiveSwaps((prev) => [asIndexed, ...prev.slice(0, 4)]);
  }, []);

  const { connected } = useSwapSubscription(handleSwapEvent);

  // Reset live counter each time the server data refreshes (prevents double-counting)
  useEffect(() => {
    setLiveSwapCount(0);
  }, [stats]);

  const allSwaps = [
    ...liveSwaps,
    ...(recentSwaps ?? []),
  ].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  const data: ProtocolActivityData | null =
    stats && recentSwaps
      ? {
          stats: {
            ...stats,
            totalSwaps: stats.totalSwaps + liveSwapCount,
          },
          recentSwaps: allSwaps,
          recentDeposits: recentDeposits ?? [],
          recentVolume: calcVolume(allSwaps.slice(0, 20)),
          liveSwapCount,
        }
      : null;

  return {
    data,
    isLoading: statsLoading || swapsLoading,
    error: statsError,
    connected,
  };
}
