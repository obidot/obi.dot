"use client";

import { useStrategies } from "@/hooks/use-strategies";
import { StrategyTable } from "@/components/strategies/strategy-table";
import { Loader2 } from "lucide-react";

export default function StrategiesPage() {
  const { data: strategies, isLoading, error } = useStrategies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Strategies</h1>
        <p className="mt-1 text-sm text-text-secondary">
          AI agent strategy execution history and performance
        </p>
      </div>

      {isLoading ? (
        <div className="card flex min-h-[400px] items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-danger">Failed to load strategies</p>
        </div>
      ) : (
        <StrategyTable strategies={strategies ?? []} />
      )}
    </div>
  );
}
