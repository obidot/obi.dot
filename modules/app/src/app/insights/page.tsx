"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { useVaultState } from "@/hooks/use-vault-state";
import { useAgentLog } from "@/hooks/use-agent-log";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { OpportunityRadar } from "@/components/insights/opportunity-radar";
import { RiskMatrix } from "@/components/insights/risk-matrix";
import { PositionSimulatorPanel } from "@/components/insights/position-simulator";
import { YieldComparison } from "@/components/insights/yield-comparison";
import { PortfolioOptimizer } from "@/components/insights/portfolio-optimizer";
import { MarketPulse } from "@/components/insights/market-pulse";
import { RefreshCw } from "lucide-react";
import { useProtocolActivity } from "@/hooks/use-protocol-activity";
import { ProtocolActivity } from "@/components/insights/protocol-activity";

export default function InsightsPage() {
  const { data: yields, isLoading: yLoading, error: yError, refetch: yRefetch } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();
  const { data: vault } = useVaultState();
  const { data: decisions } = useAgentLog();
  const { data: activity, isLoading: actLoading, error: actError, connected: actConnected } = useProtocolActivity();

  const isLoading = yLoading || bLoading || actLoading;

  return (
    <div className="space-y-4">
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
          {/* Row 0: Protocol Activity (full width) */}
          <ProtocolActivity
            data={activity ?? null}
            isLoading={actLoading}
            error={actError ?? null}
            connected={actConnected}
          />

          {/* Row 1: Market Pulse + Opportunity Radar */}
          <div className="grid gap-4 md:grid-cols-2">
            <MarketPulse
              decisions={decisions ?? []}
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
              recentSwapCount={activity?.stats.totalSwaps ?? 0}
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
