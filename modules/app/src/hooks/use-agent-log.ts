"use client";

import { useQuery } from "@tanstack/react-query";
import { getAgentLog } from "@/lib/api";

export function useAgentLog() {
  return useQuery({
    queryKey: ["agent", "log"],
    queryFn: getAgentLog,
    refetchInterval: 5_000,
  });
}
