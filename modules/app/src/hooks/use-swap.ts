"use client";

import { useState, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import {
  SWAP_QUOTER_ABI,
  SWAP_ROUTER_ABI,
  POOL_ADAPTER_ABI,
} from "@/lib/abi";
import type {
  SwapQuoteResult,
  SwapRoutesResponse,
  PoolAdapterInfo,
  SwapRouteResult,
} from "@/types";
import { PoolType, POOL_TYPE_LABELS } from "@/types";
import { ZERO_ADDRESS } from "@/lib/constants";

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

  const result = useReadContract({
    address: CONTRACTS.SWAP_QUOTER as `0x${string}`,
    abi: SWAP_QUOTER_ABI,
    functionName: "getBestQuote",
    args: enabled
      ? [
        params.pool as `0x${string}`,
        params.tokenIn as `0x${string}`,
        params.tokenOut as `0x${string}`,
        BigInt(params.amountIn),
      ]
      : undefined,
    query: {
      enabled,
      staleTime: 10_000, // quotes are fresh for 10s
      retry: 1,
    },
  });

  // Map on-chain tuple (bigint fields) to the serialized SwapQuoteResult shape
  const data: SwapQuoteResult | undefined = result.data
    ? {
      source: result.data.source as PoolType,
      pool: result.data.pool,
      feeBps: Number(result.data.feeBps),
      amountIn: result.data.amountIn.toString(),
      amountOut: result.data.amountOut.toString(),
    }
    : undefined;

  return { ...result, data };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: contracts as any,
    query: { staleTime: 30_000 },
  });

  const data: SwapRoutesResponse | undefined = result.data
    ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyData = result.data as any[];
      const routerPaused =
        (anyData[0]?.result as boolean | undefined) ?? false;
      const adapters: PoolAdapterInfo[] = ADAPTER_REGISTRY.map(
        ({ poolType, adapter }, i) => ({
          poolType,
          label: POOL_TYPE_LABELS[poolType],
          adapter,
          deployed: (anyData[i + 1]?.result as boolean | undefined) ?? false,
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

  const result = useReadContract({
    address: CONTRACTS.SWAP_QUOTER as `0x${string}`,
    abi: SWAP_QUOTER_ABI,
    functionName: "getAllQuotes",
    args: enabled
      ? [
          ZERO_ADDRESS as `0x${string}`,
          params.tokenIn as `0x${string}`,
          params.tokenOut as `0x${string}`,
          BigInt(params.amountIn),
        ]
      : undefined,
    query: {
      enabled,
      staleTime: 12_000,
      retry: 1,
    },
  });

  const data: SwapQuoteResult[] | undefined = result.data
    ? (result.data as Array<{
        source: number;
        pool: string;
        feeBps: bigint;
        amountIn: bigint;
        amountOut: bigint;
      }>).map((q) => ({
        source: q.source as PoolType,
        pool: q.pool,
        feeBps: Number(q.feeBps),
        amountIn: q.amountIn.toString(),
        amountOut: q.amountOut.toString(),
      }))
    : undefined;

  return { ...result, data };
}

export function useRouteFinder(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // wei string
}) {
  const [routes, setRoutes] = useState<SwapRouteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !params.tokenIn ||
      !params.tokenOut ||
      !params.amountIn ||
      params.amountIn === "0"
    ) {
      setRoutes([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const url = `/api/routes?tokenIn=${encodeURIComponent(params.tokenIn)}&tokenOut=${encodeURIComponent(params.tokenOut)}&amountIn=${encodeURIComponent(params.amountIn)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          success: boolean;
          data?: { routes: SwapRouteResult[]; timestamp: string };
        };
        setRoutes(json.data?.routes ?? []);
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to fetch routes");
        setRoutes([]);
      } finally {
        setIsLoading(false);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params.tokenIn, params.tokenOut, params.amountIn]);

  return { routes, isLoading, error };
}
