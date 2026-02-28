"use client";

import { useVaultState } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";
import { Loader2, Eye } from "lucide-react";

export function VaultOverview() {
  const { data: vault, isLoading, error } = useVaultState();

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

  const total = BigInt(vault.totalAssets || "0");
  const remote = BigInt(vault.totalRemoteAssets || "0");
  const idle = BigInt(vault.idleBalance || "0");
  const utilization = total > 0n ? Number((remote * 100n) / total) : 0;

  return (
    <div className="hero-banner relative px-6 py-5">
      <div className="relative z-10 flex items-center justify-between">
        {/* TVL */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="stat-number text-3xl text-text-primary">
                ${formatTokenAmount(vault.totalAssets, 18, 2)}
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
            value={formatTokenAmount(remote.toString())}
            suffix="DOT"
          />
          <MetricItem
            label="Utilization"
            value={`${utilization}%`}
            highlight={utilization > 50}
          />
          <MetricItem
            label="Strategies"
            value={vault.strategyCounter}
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
