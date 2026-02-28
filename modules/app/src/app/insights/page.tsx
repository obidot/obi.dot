"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { useVaultState } from "@/hooks/use-vault-state";
import { useAgentLog } from "@/hooks/use-agent-log";
import { PageHero, HeroStat } from "@/components/ui/page-hero";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { OpportunityRadar } from "@/components/insights/opportunity-radar";
import { RiskMatrix } from "@/components/insights/risk-matrix";
import { PositionSimulatorPanel } from "@/components/insights/position-simulator";
import { YieldComparison } from "@/components/insights/yield-comparison";
import { PortfolioOptimizer } from "@/components/insights/portfolio-optimizer";
import { MarketPulse } from "@/components/insights/market-pulse";
import { Brain, Target, TrendingUp, Shield, RefreshCw } from "lucide-react";

export default function InsightsPage() {
  const { data: yields, isLoading: yLoading, error: yError, refetch: yRefetch } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();
  const { data: vault } = useVaultState();
  const { data: decisions } = useAgentLog();

  const isLoading = yLoading || bLoading;

  const allApys = [
    ...(yields ?? []).map((y) => y.apyPercent),
    ...(bifrost ?? []).map((y) => y.apyPercent),
  ];
  const sourceCount = (yields?.length ?? 0) + (bifrost?.length ?? 0);
  const bestApy = allApys.length > 0 ? Math.max(...allApys) : 0;

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Financial Intelligence"
        title="AI Insights Hub"
        description="Actionable analytics powered by on-chain data and AI scoring"
        stats={
          <>
            <HeroStat
              label="Sources"
              icon={<Target className="h-3.5 w-3.5 text-accent" />}
              value={<span className="text-text-primary">{sourceCount}</span>}
            />
            <HeroStat
              label="Top APY"
              icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
              value={<span className="text-primary">{bestApy.toFixed(2)}%</span>}
            />
            <HeroStat
              label="AI Cycles"
              icon={<Brain className="h-3.5 w-3.5 text-secondary" />}
              value={
                <span className="text-secondary">{decisions?.length ?? 0}</span>
              }
            />
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={6} />
          <PanelSkeleton rows={8} />
          <PanelSkeleton rows={4} />
        </div>
      ) : yError ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load yield data for insights
          </p>
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
        <div className="space-y-4">
          {/* Row 1: Market Pulse + Opportunity Radar */}
          <div className="grid gap-4 md:grid-cols-2">
            <MarketPulse
              decisions={decisions ?? []}
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
            />
            <OpportunityRadar
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
            />
          </div>

          {/* Row 2: Risk Matrix (full width) */}
          <RiskMatrix yields={yields ?? []} bifrostYields={bifrost ?? []} />

          {/* Row 3: Position Simulator + Portfolio Optimizer */}
          <div className="grid gap-4 md:grid-cols-2">
            <PositionSimulatorPanel
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
            />
            <PortfolioOptimizer
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
              vault={vault}
            />
          </div>

          {/* Row 4: Yield Comparison (full width) */}
          <YieldComparison
            yields={yields ?? []}
            bifrostYields={bifrost ?? []}
          />
        </div>
      )}
    </div>
  );
}
