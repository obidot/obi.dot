"use client";

import type { CrossChainVaultState } from "@/types";
import { formatRelativeTime, cn } from "@/lib/format";
import {
  CheckCircle2,
  ShieldAlert,
  Landmark,
  Globe,
  Activity,
} from "lucide-react";

// ── Sync staleness helper ──────────────────────────────────────────────────

function getSyncStatus(lastSyncMs: number): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  const ageMins = (Date.now() - lastSyncMs) / 60_000;
  if (ageMins > 60)
    return { label: "Stale", dotClass: "bg-danger", textClass: "text-danger" };
  if (ageMins > 15)
    return {
      label: "Aging",
      dotClass: "bg-warning",
      textClass: "text-warning",
    };
  return { label: "Fresh", dotClass: "bg-primary", textClass: "text-primary" };
}

// ── Component ──────────────────────────────────────────────────────────────

export function NetworkHealth({ state }: { state: CrossChainVaultState }) {
  const totalChains = state.satellites.length + 1;
  const emergencyCount = state.satellites.filter((s) => s.emergencyMode).length;
  const healthyCount = totalChains - emergencyCount;
  const isFullyHealthy = emergencyCount === 0;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-text-muted" />
          <h3 className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Network Health
          </h3>
          <span
            className={cn(
              "pill text-[9px]",
              isFullyHealthy
                ? "bg-primary/10 text-primary"
                : "bg-danger/10 text-danger",
            )}
          >
            {isFullyHealthy ? "All Operational" : `${emergencyCount} Alert`}
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-muted">
          {healthyCount}
          <span className="text-text-muted opacity-50">/</span>
          {totalChains} nodes healthy
        </span>
      </div>

      {/* ── Chain grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {/* Hub cell */}
        <div className="flex flex-col gap-2.5 bg-surface p-3.5 transition-colors hover:bg-surface-hover">
          <div className="flex items-center justify-between">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Landmark className="h-3.5 w-3.5 text-primary" />
            </div>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-[12px] font-semibold leading-tight text-text-primary">
              {state.hub?.chain ?? "Polkadot Hub"}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="font-mono text-[9px] text-primary">
                Origin · Live
              </span>
            </div>
          </div>
        </div>

        {/* Satellite cells */}
        {state.satellites.map((sat) => {
          const sync = getSyncStatus(sat.lastSyncTimestamp);
          return (
            <div
              key={sat.chainId}
              className={cn(
                "flex flex-col gap-2.5 bg-surface p-3.5 transition-colors hover:bg-surface-hover",
                sat.emergencyMode && "bg-danger/[0.04]",
              )}
            >
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    sat.emergencyMode ? "bg-danger/10" : "bg-accent/10",
                  )}
                >
                  <Globe
                    className={cn(
                      "h-3.5 w-3.5",
                      sat.emergencyMode ? "text-danger" : "text-accent",
                    )}
                  />
                </div>
                {sat.emergencyMode ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-danger" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-[12px] font-semibold leading-tight text-text-primary">
                  {sat.chainName}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      sync.dotClass,
                    )}
                  />
                  <span
                    className={cn("font-mono text-[9px]", sync.textClass)}
                  >
                    {formatRelativeTime(sat.lastSyncTimestamp)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
