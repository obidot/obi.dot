"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  CONTRACTS,
  SWAP_QUOTER_ABI,
  SWAP_ROUTER_ABI,
  POOL_ADAPTER_ABI,
} from "@/lib/constants";
import type {
  SwapQuoteResult,
  SwapRoutesResponse,
  PoolAdapterInfo,
} from "@/types";
import { PoolType, POOL_TYPE_LABELS } from "@/types";

// ── useSwapQuote ──────────────────────────────────────────────────────────

/**
 * Fetch the best swap quote directly from SwapQuoter.getBestQuote (on-chain view).
 * Only fires when all four params are truthy and amountIn is non-zero.
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
        feeBps: result.data.feeBps,
        amountIn: result.data.amountIn.toString(),
        amountOut: result.data.amountOut.toString(),
      }
    : undefined;

  return { ...result, data };
}

// ── useSwapRoutes ─────────────────────────────────────────────────────────

/** Adapter registry entries — pool type, label, deployed address */
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

/**
 * Check available swap routes directly on-chain:
 *   - SwapRouter.paused()
 *   - IPoolAdapter.supportsPair(address(0), tokenIn=address(0), tokenOut=address(0))
 *     for each registered adapter (address(0) = generic / any pair)
 *
 * The supportsPair call with zero-addresses returns the general "is this adapter
 * registered and functional?" flag, matching the pattern used in on-chain tests.
 */
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
    contracts,
    query: { staleTime: 30_000 },
  });

  const data: SwapRoutesResponse | undefined = result.data
    ? (() => {
        const routerPaused =
          (result.data[0].result as boolean | undefined) ?? false;
        const adapters: PoolAdapterInfo[] = ADAPTER_REGISTRY.map(
          ({ poolType, adapter }, i) => ({
            poolType,
            label: POOL_TYPE_LABELS[poolType],
            adapter,
            deployed:
              (result.data[i + 1].result as boolean | undefined) ?? false,
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
