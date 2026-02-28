"use client";

import { VaultOverview } from "@/components/dashboard/vault-overview";
import { HealthIndicators } from "@/components/dashboard/health-indicators";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { VaultActions } from "@/components/dashboard/vault-actions";
import { PnlChart } from "@/components/dashboard/pnl-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      {/* Hero banner with TVL */}
      <VaultOverview />

      {/* Trading terminal grid: chart left, actions right */}
      <div className="grid grid-cols-1 gap-[1px] overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-[1fr_300px]">
        {/* Left: Chart + stats */}
        <div className="flex flex-col bg-surface">
          {/* Quick stats row inside the chart panel */}
          <QuickStats />
          {/* Candlestick chart */}
          <PnlChart />
        </div>

        {/* Right: Trade form + health */}
        <div className="flex flex-col bg-surface">
          <VaultActions />
          <div className="border-t border-border">
            <HealthIndicators />
          </div>
        </div>
      </div>
    </div>
  );
}
