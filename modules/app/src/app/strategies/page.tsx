"use client";

import { useStrategies } from "@/hooks/use-strategies";
import { StrategyTable } from "@/components/strategies/strategy-table";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { PageHero, HeroStat } from "@/components/ui/page-hero";
import { Activity, TrendingUp, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function StrategiesPage() {
  const { data: strategies, isLoading, error, refetch } = useStrategies();

  const executed = strategies?.filter((s) => s.status === "executed").length ?? 0;
  const failed = strategies?.filter((s) => s.status === "failed" || s.status === "timeout").length ?? 0;
  const total = strategies?.length ?? 0;
  const successRate = total > 0 ? ((executed / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Strategy Engine"
        title="Execution History"
        description="AI agent strategy execution log and performance tracking"
        stats={
          <>
            <HeroStat
              label="Total"
              icon={<Activity className="h-3.5 w-3.5 text-accent" />}
              value={<span className="text-text-primary">{total}</span>}
            />
            <HeroStat
              label="Executed"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              value={<span className="text-primary">{executed}</span>}
            />
            <HeroStat
              label="Failed"
              icon={<XCircle className="h-3.5 w-3.5 text-danger" />}
              value={<span className="text-danger">{failed}</span>}
            />
            <HeroStat
              label="Success Rate"
              icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
              value={<span className="text-primary">{successRate}%</span>}
            />
          </>
        }
      />

      {isLoading ? (
        <PanelSkeleton rows={8} />
      ) : error ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">Failed to load strategies</p>
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
        <StrategyTable strategies={strategies ?? []} />
      )}
    </div>
  );
}
