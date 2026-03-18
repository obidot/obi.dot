"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getIndexedStrategyExecutions,
  type IndexedStrategyExecution,
} from "@/lib/graphql";

/** Fetch the most recent strategy executions indexed by obi.index.
 *  Falls back to empty array if the indexer is offline. */
export function useStrategies(): {
  data: IndexedStrategyExecution[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["indexed", "strategies"],
    queryFn: () => getIndexedStrategyExecutions(20),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { data, isLoading, error: error as Error | null, refetch };
}
