"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { YieldGrid } from "@/components/yields/yield-grid";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { TrendingUp, Globe, Layers, RefreshCw } from "lucide-react";

export default function YieldsPage() {
  const { data: yields, isLoading: yLoading, error: yError, refetch: yRefetch } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();

  const isLoading = yLoading || bLoading;
  const totalSources = (yields?.length ?? 0) + (bifrost?.length ?? 0);

  const allApys = [
    ...(yields ?? []).map((y) => y.apyPercent),
    ...(bifrost ?? []).map((y) => y.apyPercent),
  ];
  const bestApy = allApys.length > 0 ? Math.max(...allApys) : 0;
  const avgApy =
    allApys.length > 0
      ? allApys.reduce((a, b) => a + b, 0) / allApys.length
      : 0;

  return (
    <div className="space-y-4">
      {/* Hero bar */}
      <div className="hero-banner px-6 py-5">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Yield Explorer
            </p>
            <h1 className="mt-1 stat-number text-2xl text-text-primary">
              Cross-Chain Yields
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              Live yield opportunities from Bifrost, DeFiLlama, and more
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Sources</p>
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-accent" />
                <span className="stat-number text-lg text-text-primary">{totalSources}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Best APY</p>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="stat-number text-lg text-primary">{bestApy.toFixed(2)}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Avg APY</p>
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-secondary" />
                <span className="stat-number text-lg text-secondary">{avgApy.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <PanelSkeleton rows={6} />
      ) : yError ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">Failed to load yields</p>
          <button
            type="button"
            onClick={() => yRefetch()}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <YieldGrid yields={yields ?? []} bifrostYields={bifrost ?? []} />
      )}
    </div>
  );
}
