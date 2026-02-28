"use client";

import { useVaultState } from "@/hooks/use-vault-state";
import { cn } from "@/lib/format";
import { AlertTriangle, ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function HealthIndicators() {
  const { data: vault, isLoading } = useVaultState();

  if (isLoading) {
    return (
      <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading health indicators...">
        <Skeleton className="h-3 w-16" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
        <Skeleton className="mt-3 h-1 w-full rounded-full" />
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="p-4 space-y-2" aria-busy="true" aria-label="Waiting for vault data...">
        <Skeleton className="h-3 w-16" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
        <Skeleton className="mt-3 h-1 w-full rounded-full" />
      </div>
    );
  }

  const dailyLoss = BigInt(vault.dailyLoss || "0");
  const maxDailyLoss = BigInt(vault.maxDailyLoss || "1");
  const lossPercent = maxDailyLoss > 0n ? Number((dailyLoss * 10000n) / maxDailyLoss) / 100 : 0;

  const indicators = [
    {
      label: "Paused",
      value: vault.paused,
      color: vault.paused ? "text-danger" : "text-primary",
    },
    {
      label: "Emergency",
      value: vault.emergencyMode,
      color: vault.emergencyMode ? "text-danger" : "text-primary",
    },
    {
      label: "Daily Loss",
      text: `${lossPercent.toFixed(2)}%`,
      color: lossPercent > 80 ? "text-danger" : lossPercent > 50 ? "text-warning" : "text-primary",
    },
  ];

  return (
    <div className="p-4">
      {/* Emergency / Paused banners */}
      {vault.emergencyMode && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2">
          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-danger" />
          <span className="font-mono text-[11px] font-semibold text-danger">
            Emergency mode active
          </span>
        </div>
      )}
      {vault.paused && !vault.emergencyMode && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="font-mono text-[11px] font-semibold text-warning">
            Vault is paused
          </span>
        </div>
      )}

      <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-muted mb-3">
        Health
      </h3>
      <div className="space-y-2">
        {indicators.map((ind) => (
          <div key={ind.label} className="flex items-center justify-between">
            <span className="text-[12px] text-text-secondary">{ind.label}</span>
            <span className={cn("font-mono text-[12px] font-medium", ind.color)}>
              {"text" in ind ? ind.text : ind.value ? "YES" : "NO"}
            </span>
          </div>
        ))}
      </div>

      {/* Loss bar with progressbar role */}
      <div className="mt-3">
        <div
          className="h-1 w-full rounded-full bg-border"
          role="progressbar"
          aria-label="Daily loss vs. maximum allowed"
          aria-valuenow={Math.round(lossPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              lossPercent > 80
                ? "bg-danger"
                : lossPercent > 50
                  ? "bg-warning"
                  : "bg-primary",
            )}
            style={{ width: `${Math.min(lossPercent, 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-text-muted">
          <span>0%</span>
          <span>Max Loss</span>
        </div>
      </div>
    </div>
  );
}
