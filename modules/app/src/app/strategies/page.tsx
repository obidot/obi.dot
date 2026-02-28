"use client";

import { useStrategies } from "@/hooks/use-strategies";
import { StrategyTable } from "@/components/strategies/strategy-table";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Activity, TrendingUp, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function StrategiesPage() {
  const { data: strategies, isLoading, error, refetch } = useStrategies();

  const executed = strategies?.filter((s) => s.status === "executed").length ?? 0;
  const failed = strategies?.filter((s) => s.status === "failed" || s.status === "timeout").length ?? 0;
  const total = strategies?.length ?? 0;
  const successRate = total > 0 ? ((executed / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      {/* Hero bar */}
      <div className="hero-banner px-6 py-5">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Strategy Engine
            </p>
            <h1 className="mt-1 stat-number text-2xl text-text-primary">
              Execution History
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              AI agent strategy execution log and performance tracking
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Total</p>
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-accent" />
                <span className="stat-number text-lg text-text-primary">{total}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Executed</p>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="stat-number text-lg text-primary">{executed}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Failed</p>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-danger" />
                <span className="stat-number text-lg text-danger">{failed}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Success Rate</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="stat-number text-lg text-primary">{successRate}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
