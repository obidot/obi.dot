"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/constants";
import {
  getIndexedStrategyExecutions,
  type IndexedStrategyExecution,
} from "@/lib/graphql";

// Shape returned by the agent's in-memory /api/strategies endpoint
interface AgentStrategyRecord {
  id: string;
  action: string;
  target: string;
  amount: string;
  reasoning: string;
  status: "pending" | "executed" | "failed" | "timeout";
  txHash?: string;
  timestamp: number;
}

/** Map agent StrategyRecord → IndexedStrategyExecution shape for uniform display */
function agentRecordToIndexed(
  r: AgentStrategyRecord,
): IndexedStrategyExecution {
  return {
    id: r.id,
    txHash: r.txHash ?? "",
    blockNumber: 0,
    timestamp: new Date(r.timestamp).toISOString(),
    executor: r.id,
    destination: r.action,
    targetChain: "Polkadot Hub",
    protocol: r.target,
    amount: r.amount,
    profit: "0",
    success: r.status === "executed",
  };
}

async function fetchStrategies(): Promise<IndexedStrategyExecution[]> {
  // 1. Try GraphQL indexer — use it if reachable, even if empty
  try {
    const indexed = await getIndexedStrategyExecutions(20);
    return indexed; // trust the indexer; don't fall back just because it's empty
  } catch {
    // indexer offline or errored — fall through to agent API
  }

  // 2. Fall back to agent in-memory store
  try {
    const res = await fetch(`${API_BASE}/strategies`);
    if (!res.ok) return [];
    const envelope = (await res.json()) as {
      success: boolean;
      data?: AgentStrategyRecord[];
    };
    if (!envelope.success || !envelope.data) return [];
    return envelope.data.map(agentRecordToIndexed);
  } catch {
    return [];
  }
}

export function useStrategies(): {
  data: IndexedStrategyExecution[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["strategies"],
    queryFn: fetchStrategies,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { data, isLoading, error: error as Error | null, refetch };
}
