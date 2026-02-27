"use client";

import { useVaultState } from "@/hooks/use-vault-state";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/format";

interface IndicatorProps {
  label: string;
  value: boolean | string;
  icon: React.ReactNode;
  danger?: boolean;
}

function Indicator({ label, value, icon, danger }: IndicatorProps) {
  const isActive = typeof value === "boolean" ? value : false;
  const displayValue = typeof value === "boolean" ? (value ? "Yes" : "No") : value;

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-text-muted",
            isActive && danger && "text-danger",
            isActive && !danger && "text-primary",
          )}
        >
          {icon}
        </span>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span
        className={cn(
          "font-mono text-sm",
          isActive && danger ? "text-danger" : "text-text-primary",
        )}
      >
        {displayValue}
      </span>
    </div>
  );
}

export function HealthIndicators() {
  const { data: vault, isLoading } = useVaultState();

  if (isLoading) {
    return (
      <div className="card flex h-[200px] items-center justify-center p-5">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!vault) return null;

  // Daily loss percentage
  const dailyLoss = BigInt(vault.dailyLoss || "0");
  const maxDailyLoss = BigInt(vault.maxDailyLoss || "1");
  const lossPercent = maxDailyLoss > 0n ? Number((dailyLoss * 10000n) / maxDailyLoss) / 100 : 0;

  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Health Status
      </h3>
      <div className="divide-y divide-border">
        <Indicator
          label="Paused"
          value={vault.paused}
          icon={<ShieldCheck className="h-4 w-4" />}
          danger
        />
        <Indicator
          label="Emergency"
          value={vault.emergencyMode}
          icon={<ShieldAlert className="h-4 w-4" />}
          danger
        />
        <Indicator
          label="Daily Loss"
          value={`${lossPercent.toFixed(2)}%`}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>
      {/* Daily loss bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-border">
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
        <div className="mt-1 flex justify-between font-mono text-[10px] text-text-muted">
          <span>0%</span>
          <span>Max Daily Loss</span>
        </div>
      </div>
    </div>
  );
}
