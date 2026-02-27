"use client";

import { useQuery } from "@tanstack/react-query";
import { getCrossChainState } from "@/lib/api";

export function useCrossChainState() {
  return useQuery({
    queryKey: ["crosschain", "state"],
    queryFn: getCrossChainState,
  });
}
