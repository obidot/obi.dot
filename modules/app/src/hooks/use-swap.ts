"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { POOL_ADAPTER_ABI, SWAP_ROUTER_ABI } from "@/lib/abi";
import { getSwapQuote } from "@/lib/api";
import { CONTRACTS, ZERO_ADDRESS } from "@/lib/constants";
import type {
  PoolAdapterInfo,
  SwapRouteResult,
  SwapRoutesResponse,
} from "@/types";
import { POOL_TYPE_LABELS, PoolType } from "@/types";

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
    queryKey: [
      "swap",
      "quote",
      params.pool,
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
    ],
    queryFn: async () => {
      const data = await getSwapQuote(params);
      return data.bestQuote;
    },
    enabled,
    staleTime: 3_000,
    retry: 1,
  });
}

const ADAPTER_REGISTRY: Array<{
  poolType: PoolType;
  adapter: `0x${string}`;
}> = [
  {
    poolType: PoolType.HydrationOmnipool,
    adapter: CONTRACTS.HYDRATION_ADAPTER as `0x${string}`,
  },
  {
    poolType: PoolType.AssetHubPair,
    adapter: CONTRACTS.ASSET_HUB_ADAPTER as `0x${string}`,
  },
  {
    poolType: PoolType.BifrostDEX,
    adapter: CONTRACTS.BIFROST_DEX_ADAPTER as `0x${string}`,
  },
];

export function useSwapRoutes() {
  type ReadContractSpec = {
    address: `0x${string}`;
    abi: typeof SWAP_ROUTER_ABI | typeof POOL_ADAPTER_ABI;
    functionName: "paused" | "supportsPair";
    args: readonly unknown[];
  };
  type ReadContractResult = { result?: unknown };

  const contracts = [
    // [0] Router paused?
    {
      address: CONTRACTS.SWAP_ROUTER as `0x${string}`,
      abi: SWAP_ROUTER_ABI,
      functionName: "paused" as const,
      args: [] as const,
    },
    // [1..N] supportsPair per adapter — use zero-address pool + TestDOT pair
    ...ADAPTER_REGISTRY.map(({ adapter }) => ({
      address: adapter,
      abi: POOL_ADAPTER_ABI,
      functionName: "supportsPair" as const,
      args: [
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
        CONTRACTS.TEST_DOT as `0x${string}`,
        CONTRACTS.NATIVE_DOT as `0x${string}`,
      ] as const,
    })),
  ] as const;

  const result = useReadContracts({
    contracts: contracts as readonly ReadContractSpec[],
    query: { staleTime: 30_000 },
  });

  const data: SwapRoutesResponse | undefined = result.data
    ? (() => {
        const contractData = result.data as ReadonlyArray<ReadContractResult>;
        const routerPaused =
          (contractData[0]?.result as boolean | undefined) ?? false;
        const adapters: PoolAdapterInfo[] = ADAPTER_REGISTRY.map(
          ({ poolType, adapter }, i) => ({
            poolType,
            label: POOL_TYPE_LABELS[poolType],
            adapter,
            deployed:
              (contractData[i + 1]?.result as boolean | undefined) ?? false,
          }),
        );
        return {
          adapters,
          routerDeployed: true,
          routerPaused,
        };
      })()
    : undefined;

  return { ...result, data };
}

/** Fetch all adapter quotes from SwapQuoter.getAllQuotes() */
export function useAllQuotes(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}) {
  const enabled =
    !!params.tokenIn &&
    !!params.tokenOut &&
    !!params.amountIn &&
    params.amountIn !== "0";

  return useQuery({
    queryKey: [
      "swap",
      "quotes",
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
    ],
    queryFn: async () => {
      const data = await getSwapQuote({
        pool: ZERO_ADDRESS,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
      });
      return data.allQuotes;
    },
    enabled,
    staleTime: 12_000,
    retry: 1,
  });
}

export function useRouteFinder(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // wei string
}) {
  const [routes, setRoutes] = useState<SwapRouteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const hasInput =
    !!params.tokenIn &&
    !!params.tokenOut &&
    !!params.amountIn &&
    params.amountIn !== "0";

  // Derive staleness: stale if last fetch was > 30s ago
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);
  const isStale = lastFetchedAt !== null && now - lastFetchedAt > 30_000;

  const fetchRoutes = useCallback(
    async (isBackground: boolean, signal: AbortSignal) => {
      if (!hasInput) return;
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      try {
        const url = `/api/routes?tokenIn=${encodeURIComponent(params.tokenIn)}&tokenOut=${encodeURIComponent(params.tokenOut)}&amountIn=${encodeURIComponent(params.amountIn)}`;
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          success: boolean;
          data?: { routes: SwapRouteResult[]; timestamp: string };
        };
        setRoutes(json.data?.routes ?? []);
        setLastFetchedAt(Date.now());
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to fetch routes");
        if (!isBackground) setRoutes([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.tokenIn, params.tokenOut, params.amountIn, hasInput],
  );

  // Initial fetch (debounced 600ms)
  useEffect(() => {
    if (!hasInput) {
      setRoutes([]);
      setIsLoading(false);
      setError(null);
      setLastFetchedAt(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchRoutes(false, controller.signal);
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hasInput, fetchRoutes]);

  // Auto-refresh every 5s when input is valid
  useEffect(() => {
    if (!hasInput) return;
    const controller = new AbortController();
    const interval = setInterval(() => {
      void fetchRoutes(true, controller.signal);
    }, 5_000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [hasInput, fetchRoutes]);

  return { routes, isLoading, isRefreshing, isStale, lastFetchedAt, error };
}
