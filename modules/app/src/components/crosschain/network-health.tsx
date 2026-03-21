"use client";

import {
  Activity,
  CheckCircle2,
  Globe,
  Landmark,
  ShieldAlert,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/format";
import type { CrossChainVaultState } from "@/types";

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
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-accent">
            <Activity className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Ops Monitor</span>
            <h3 className="panel-title">Network Health</h3>
            <p className="panel-subtitle">
              Freshness and emergency status across the hub and every configured
              satellite node.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "pill text-[9px]",
              isFullyHealthy
                ? "bg-accent text-accent-foreground"
                : "bg-danger text-card",
            )}
          >
            {isFullyHealthy ? "All Operational" : `${emergencyCount} Alert`}
          </span>
          <span className="pill bg-surface-alt text-text-secondary text-[9px]">
            {healthyCount}
            <span className="text-text-muted opacity-50">/</span>
            {totalChains} nodes healthy
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
                    className={cn("h-1.5 w-1.5 rounded-full", sync.dotClass)}
                  />
                  <span className={cn("font-mono text-[9px]", sync.textClass)}>
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
