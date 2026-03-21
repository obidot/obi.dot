"use client";

import { useQuery } from "@tanstack/react-query";
import { getBifrostYields, getUniswapV2Yields, getYields } from "@/lib/api";

export function useYields() {
  return useQuery({
    queryKey: ["yields"],
    queryFn: getYields,
  });
}

export function useBifrostYields() {
  return useQuery({
    queryKey: ["yields", "bifrost"],
    queryFn: getBifrostYields,
  });
}

export function useUniswapV2Yields() {
  return useQuery({
    queryKey: ["yields", "uniswap"],
    queryFn: getUniswapV2Yields,
    retry: 1,
    staleTime: 60_000,
  });
}
