"use client";

import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { VAULT_ABI } from "@/lib/abi";
import {
  getIndexedVaultState,
  getIndexedVaultStats,
  type IndexedVaultState,
  type IndexedVaultStats,
} from "@/lib/graphql";

const VAULT_ADDRESS = CONTRACTS.VAULT as Address;

export function useVaultOnChain() {
  return useReadContracts({
    contracts: [
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "totalAssets",
      },
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "totalSupply",
      },
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "paused",
      },
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "emergencyMode",
      },
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "totalRemoteAssets",
      },
    ],
    query: { refetchInterval: 12_000 }, // re-read every ~block
  });
}

/** Parsed on-chain vault state with human-readable numbers */
export interface VaultOnChainState {
  totalAssets: bigint;
  totalSupply: bigint;
  totalRemoteAssets: bigint;
  paused: boolean;
  emergencyMode: boolean;
  /** TVL = totalAssets + totalRemoteAssets, formatted to 4 dp */
  tvlDisplay: string;
}

export function useVaultState(): {
  data: VaultOnChainState | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useVaultOnChain();

  if (!data || isLoading) {
    return { data: undefined, isLoading, error: error as Error | null };
  }

  const [
    totalAssetsResult,
    totalSupplyResult,
    pausedResult,
    emergencyModeResult,
    totalRemoteAssetsResult,
  ] = data;

  const totalAssets =
    totalAssetsResult.status === "success"
      ? (totalAssetsResult.result as bigint)
      : BigInt(0);
  const totalSupply =
    totalSupplyResult.status === "success"
      ? (totalSupplyResult.result as bigint)
      : BigInt(0);
  const paused =
    pausedResult.status === "success"
      ? (pausedResult.result as boolean)
      : false;
  const emergencyMode =
    emergencyModeResult.status === "success"
      ? (emergencyModeResult.result as boolean)
      : false;
  const totalRemoteAssets =
    totalRemoteAssetsResult.status === "success"
      ? (totalRemoteAssetsResult.result as bigint)
      : BigInt(0);

  const tvl = totalAssets + totalRemoteAssets;
  const tvlDisplay = `${parseFloat(formatUnits(tvl, 18)).toFixed(4)} tDOT`;

  return {
    data: {
      totalAssets,
      totalSupply,
      totalRemoteAssets,
      paused,
      emergencyMode,
      tvlDisplay,
    },
    isLoading: false,
    error: null,
  };
}

/** User's vault share balance and equivalent asset value */
export function useShareBalance(userAddress?: Address) {
  return useReadContracts({
    contracts: [
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "balanceOf",
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "maxWithdraw",
        args: userAddress ? [userAddress] : undefined,
      },
    ],
    query: {
      enabled: !!userAddress,
      refetchInterval: 12_000,
    },
  });
}

// ── Indexed data from obi.index ────────────────────────────────────────────
// Falls back gracefully if the indexer is offline.

export function useIndexedVaultState(): {
  data: IndexedVaultState | null | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ["indexed", "vaultState"],
    queryFn: getIndexedVaultState,
    retry: 1,
    staleTime: 30_000,
  });
  return { data, isLoading, error: error as Error | null };
}

export function useVaultStats(): {
  data: IndexedVaultStats | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ["indexed", "vaultStats"],
    queryFn: getIndexedVaultStats,
    retry: 1,
    staleTime: 30_000,
  });
  return { data, isLoading, error: error as Error | null };
}

// ── Legacy compat: keep useVaultPerformance for components that use it ─────
// Performance data (cumulative PnL, high-water mark) is not yet indexed;
// still reads from the agent API to avoid breaking callers.

import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { getVaultPerformance } from "@/lib/api";

export function useVaultPerformance() {
  return useTanstackQuery({
    queryKey: ["vault", "performance"],
    queryFn: getVaultPerformance,
  });
}
