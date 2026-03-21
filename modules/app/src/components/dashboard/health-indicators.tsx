"use client";

import { AlertTriangle, ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useVaultState } from "@/hooks/use-vault-state";
import { cn } from "@/lib/format";

export function HealthIndicators() {
  const { data: vault, isLoading } = useVaultState();

  if (isLoading || !vault) {
    return (
      <div className="p-4 space-y-2" aria-busy="true">
        <Skeleton className="h-3 w-16" />
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }

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
  ];

  return (
    <div className="bg-surface px-4 py-4">
      {/* Emergency / Paused banners */}
      {vault.emergencyMode && (
        <div className="mb-3 flex items-center gap-2 border-[3px] border-danger bg-danger/10 px-3 py-2 shadow-[2px_2px_0_0_var(--border)]">
          <ShieldOff className="h-3.5 w-3.5 shrink-0 text-danger" />
          <span className="font-mono text-[11px] font-semibold text-danger">
            Emergency mode active
          </span>
        </div>
      )}
      {vault.paused && !vault.emergencyMode && (
        <div className="mb-3 flex items-center gap-2 border-[3px] border-warning bg-warning/10 px-3 py-2 shadow-[2px_2px_0_0_var(--border)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="font-mono text-[11px] font-semibold text-warning">
            Vault is paused
          </span>
        </div>
      )}

      <h3 className="retro-label mb-3 text-[0.85rem] text-text-muted">
        Health
      </h3>
      <div className="space-y-2">
        {indicators.map((ind) => (
          <div key={ind.label} className="flex items-center justify-between">
            <span className="text-[12px] text-text-secondary">{ind.label}</span>
            <span
              className={cn("font-mono text-[12px] font-medium", ind.color)}
            >
              {ind.value ? "YES" : "NO"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
