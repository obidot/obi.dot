"use client";

import { useQuery } from "@tanstack/react-query";
import { getYields, getBifrostYields } from "@/lib/api";

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
