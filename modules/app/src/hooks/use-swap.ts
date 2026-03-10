"use client";

import { useQuery } from "@tanstack/react-query";
import { getSwapQuote, getSwapRoutes } from "@/lib/api";

/**
 * Fetch a swap quote from the agent API → SwapQuoter on-chain.
 * Only fires when all four params are truthy.
 */
export function useSwapQuote(params: {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}) {
  const enabled =
    !!params.pool &&
    !!params.tokenIn &&
    !!params.tokenOut &&
    !!params.amountIn &&
    params.amountIn !== "0";

  return useQuery({
    queryKey: ["swap", "quote", params],
    queryFn: () => getSwapQuote(params),
    enabled,
    staleTime: 10_000, // quotes are fresh for 10s
    retry: 1,
  });
}

/**
 * Fetch available swap routes (pool adapters + router status) from the agent API.
 */
export function useSwapRoutes() {
  return useQuery({
    queryKey: ["swap", "routes"],
    queryFn: getSwapRoutes,
    staleTime: 30_000, // adapter list is fairly static
  });
}
