"use client";

import { useQuery } from "@tanstack/react-query";
import { getPriceHistory, type IndexedPriceHistoryBar } from "@/lib/graphql";

export type PriceHistoryWindow = "24H" | "7D";

const WINDOW_SECONDS: Record<PriceHistoryWindow, number> = {
  "24H": 24 * 60 * 60,
  "7D": 7 * 24 * 60 * 60,
};

export function usePriceHistory(
  tokenIn: string,
  tokenOut: string,
  window: PriceHistoryWindow,
) {
  return useQuery<IndexedPriceHistoryBar[]>({
    queryKey: [
      "price-history",
      tokenIn.toLowerCase(),
      tokenOut.toLowerCase(),
      window,
    ],
    queryFn: () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - WINDOW_SECONDS[window];
      return getPriceHistory(tokenIn, tokenOut, from, to);
    },
    enabled: !!tokenIn && !!tokenOut,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
