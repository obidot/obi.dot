"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { YieldGrid } from "@/components/yields/yield-grid";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { PageHero, HeroStat } from "@/components/ui/page-hero";
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
      <PageHero
        eyebrow="Yield Explorer"
        title="Cross-Chain Yields"
        description="Live yield opportunities from Bifrost, DeFiLlama, and more"
        stats={
          <>
            <HeroStat
              label="Sources"
              icon={<Layers className="h-3.5 w-3.5 text-accent" />}
              value={<span className="text-text-primary">{totalSources}</span>}
            />
            <HeroStat
              label="Best APY"
              icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
              value={<span className="text-primary">{bestApy.toFixed(2)}%</span>}
            />
            <HeroStat
              label="Avg APY"
              icon={<Globe className="h-3.5 w-3.5 text-secondary" />}
              value={<span className="text-secondary">{avgApy.toFixed(2)}%</span>}
            />
          </>
        }
      />

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
