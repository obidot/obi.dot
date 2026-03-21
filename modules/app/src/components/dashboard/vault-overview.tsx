"use client";

import { Eye, Loader2 } from "lucide-react";
import { formatUnits } from "viem";
import { useVaultState, useVaultStats } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";

export function VaultOverview() {
  const { data: vault, isLoading, error } = useVaultState();
  const { data: stats } = useVaultStats();

  if (isLoading) {
    return (
      <div className="hero-banner flex h-[150px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !vault) {
    return (
      <div className="hero-banner p-6 text-center">
        <p className="text-sm text-danger">Failed to load vault state</p>
      </div>
    );
  }

  const { totalAssets, totalRemoteAssets } = vault;
  const idle = totalAssets - totalRemoteAssets;
  const utilization =
    totalAssets > 0n ? Number((totalRemoteAssets * 100n) / totalAssets) : 0;

  return (
    <div className="hero-banner relative px-5 py-5 md:px-7 md:py-6">
      <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="pill bg-primary text-primary-foreground">
              Vault Board
            </span>
            <span className="pill bg-surface text-text-secondary">
              Polkadot Hub TestNet
            </span>
          </div>
          <div>
            <p className="retro-label text-[0.95rem] text-text-muted">
              Obidot Yield Vault
            </p>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="stat-number text-text-primary">
                ${parseFloat(formatUnits(totalAssets, 18)).toFixed(2)}
              </h2>
              <Eye className="h-4 w-4 text-text-muted" />
            </div>
            <p className="mt-2 max-w-2xl text-[13px] text-text-secondary">
              Autonomous allocation across Polkadot Hub liquidity surfaces with
              on-chain vault accounting and live operational telemetry.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricItem
            label="Idle"
            value={formatTokenAmount(idle.toString())}
            suffix="DOT"
          />
          <MetricItem
            label="Deployed"
            value={formatTokenAmount(totalRemoteAssets.toString())}
            suffix="DOT"
          />
          <MetricItem
            label="Utilization"
            value={`${utilization}%`}
            highlight={utilization > 50}
          />
          <MetricItem
            label="Strategies"
            value={stats ? String(stats.totalStrategies) : "—"}
          />
        </div>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-[118px] border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)]">
      <p className="retro-label text-[0.85rem] text-text-muted">{label}</p>
      <p className="mt-2 text-[15px] font-semibold text-text-primary">
        {highlight ? <span className="text-primary">{value}</span> : value}
        {suffix && (
          <span className="ml-1 text-[11px] text-text-muted">{suffix}</span>
        )}
      </p>
    </div>
  );
}
