// modules/app/src/hooks/use-user-vault-position.ts
"use client";

import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { VAULT_ABI } from "@/lib/abi";
import { CONTRACTS } from "@/lib/constants";

const VAULT_ADDRESS = CONTRACTS.VAULT as Address;

export interface UserVaultPosition {
  /** Raw ERC-4626 share balance */
  sharesBalance: bigint;
  /** Redemption value in tDOT (convertToAssets result) */
  assetsValue: bigint;
}

export function useUserVaultPosition(): {
  data: UserVaultPosition | null;
  isLoading: boolean;
} {
  const { address, isConnected } = useAccount();

  const { data: sharesBalance, isLoading: sharesLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [address as Address],
    query: {
      enabled: isConnected && !!address,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  });

  const { data: assetsValue, isLoading: assetsLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [sharesBalance ?? 0n],
    query: {
      enabled: isConnected && sharesBalance !== undefined,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  });

  if (!isConnected || !address || sharesBalance === undefined) {
    return { data: null, isLoading: sharesLoading };
  }

  return {
    data: {
      sharesBalance: sharesBalance as bigint,
      assetsValue: (assetsValue ?? 0n) as bigint,
    },
    isLoading: sharesLoading || assetsLoading,
  };
}
