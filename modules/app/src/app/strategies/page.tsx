"use client";

import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { StrategyTable } from "@/components/strategies/strategy-table";
import { PageHero } from "@/components/ui/page-hero";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useStrategies } from "@/hooks/use-strategies";
import type { IndexedStrategyExecution } from "@/lib/graphql";
import type { StrategyRecord } from "@/types";

/** Map obi.index IndexedStrategyExecution → the StrategyRecord shape used by StrategyTable. */
function toStrategyRecord(s: IndexedStrategyExecution): StrategyRecord {
  return {
    id: s.id,
    action: s.destination, // destination = "Native"/"Hyper"
    target: s.protocol,
    amount: s.amount,
    reasoning: `${s.targetChain} via ${s.executor}`,
    status: s.success ? "executed" : "failed",
    timestamp: new Date(s.timestamp).getTime(),
    txHash: s.txHash,
  };
}

export default function StrategiesPage() {
  const { data: indexed, isLoading, error, refetch } = useStrategies();

  const strategies: StrategyRecord[] = useMemo(
    () => (indexed ?? []).map(toStrategyRecord),
    [indexed],
  );

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Strategies"
        title="Execution Ledger"
        description="Tracked strategy actions, outcomes, and on-chain execution links in the same retro operations frame."
      />
      {isLoading ? (
        <PanelSkeleton rows={8} />
      ) : error ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load strategies
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <StrategyTable strategies={strategies} />
      )}
    </div>
  );
}
