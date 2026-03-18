"use client";

import { useVaultState, useVaultStats } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";
import { formatUnits } from "viem";
import { Loader2, Eye } from "lucide-react";

export function VaultOverview() {
  const { data: vault, isLoading, error } = useVaultState();
  const { data: stats } = useVaultStats();

  if (isLoading) {
    return (
      <div className="hero-banner flex h-[100px] items-center justify-center">
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
    <div className="hero-banner relative px-6 py-5">
      <div className="relative z-10 flex items-center justify-between">
        {/* TVL */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="stat-number text-3xl text-text-primary">
                ${parseFloat(formatUnits(totalAssets, 18)).toFixed(2)}
              </h2>
              <Eye className="h-4 w-4 text-text-muted" />
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              Total Value Locked.{" "}
              <span className="text-primary cursor-pointer hover:underline">
                Polkadot Hub EVM
              </span>
            </p>
          </div>
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-8">
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
    <div className="text-right">
      <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold text-text-primary">
        {highlight ? <span className="text-primary">{value}</span> : value}
        {suffix && (
          <span className="ml-1 text-[11px] text-text-muted">{suffix}</span>
        )}
      </p>
    </div>
  );
}
