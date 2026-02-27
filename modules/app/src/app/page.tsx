"use client";

import { VaultOverview } from "@/components/dashboard/vault-overview";
import { HealthIndicators } from "@/components/dashboard/health-indicators";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { VaultActions } from "@/components/dashboard/vault-actions";
import { PnlChart } from "@/components/dashboard/pnl-chart";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Vault Dashboard
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time overview of the Obidot autonomous vault on Polkadot Hub
        </p>
      </div>

      {/* Stat cards row */}
      <VaultOverview />

      {/* Quick stats bar */}
      <QuickStats />

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* PnL chart — spans 2 columns */}
        <div className="lg:col-span-2">
          <PnlChart />
        </div>

        {/* Right column: Health + Actions */}
        <div className="space-y-6">
          <HealthIndicators />
          <VaultActions />
        </div>
      </div>
    </div>
  );
}
