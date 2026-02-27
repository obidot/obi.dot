"use client";

import { useVaultState } from "@/hooks/use-vault-state";
import { formatUsd } from "@/lib/format";
import { Wallet, Landmark, ArrowUpRight, Loader2 } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "green" | "purple" | "cyan";
  subtext?: string;
}

function StatCard({ label, value, icon, accent = "green", subtext }: StatCardProps) {
  const glowClass =
    accent === "green"
      ? "glow-green"
      : accent === "purple"
        ? "glow-purple"
        : "glow-cyan";

  const iconBg =
    accent === "green"
      ? "bg-primary/10 text-primary"
      : accent === "purple"
        ? "bg-secondary/10 text-secondary"
        : "bg-accent/10 text-accent";

  return (
    <div className={`card card-hover p-5 ${glowClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {label}
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-text-primary">
            {value}
          </p>
          {subtext && (
            <p className="mt-1 font-mono text-xs text-text-secondary">
              {subtext}
            </p>
          )}
        </div>
        <div className={`rounded-lg p-2 ${iconBg}`}>{icon}</div>
      </div>
    </div>
  );
}

export function VaultOverview() {
  const { data: vault, isLoading, error } = useVaultState();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card flex h-[120px] items-center justify-center p-5">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !vault) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-danger">Failed to load vault state</p>
      </div>
    );
  }

  const totalAssets = formatUsd(vault.totalAssets);
  const idleBalance = formatUsd(vault.idleBalance);
  const remoteAssets = formatUsd(vault.totalRemoteAssets);

  // Calculate utilization
  const total = BigInt(vault.totalAssets || "0");
  const remote = BigInt(vault.totalRemoteAssets || "0");
  const utilization = total > 0n ? Number((remote * 100n) / total) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <StatCard
        label="Total Assets"
        value={totalAssets}
        icon={<Wallet className="h-5 w-5" />}
        accent="green"
        subtext={`${vault.strategyCounter} strategies executed`}
      />
      <StatCard
        label="Idle Balance"
        value={idleBalance}
        icon={<Landmark className="h-5 w-5" />}
        accent="cyan"
        subtext="Available for deployment"
      />
      <StatCard
        label="Remote Assets"
        value={remoteAssets}
        icon={<ArrowUpRight className="h-5 w-5" />}
        accent="purple"
        subtext={`${utilization}% utilization`}
      />
    </div>
  );
}
