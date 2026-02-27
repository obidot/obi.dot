"use client";

import { useQuery } from "@tanstack/react-query";
import { getVaultState, getVaultPerformance } from "@/lib/api";

export function useVaultState() {
  return useQuery({
    queryKey: ["vault", "state"],
    queryFn: getVaultState,
  });
}

export function useVaultPerformance() {
  return useQuery({
    queryKey: ["vault", "performance"],
    queryFn: getVaultPerformance,
  });
}
