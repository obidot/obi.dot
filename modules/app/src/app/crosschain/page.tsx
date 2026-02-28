"use client";

import { useCrossChainState } from "@/hooks/use-crosschain";
import { SatelliteTable } from "@/components/crosschain/satellite-table";
import { ChainTopology } from "@/components/crosschain/chain-topology";
import { AllocationBreakdown } from "@/components/crosschain/allocation-breakdown";
import { NetworkHealth } from "@/components/crosschain/network-health";
import type { SatelliteChainState } from "@/types";
import { formatUsd, cn } from "@/lib/format";
import {
  Loader2,
  Globe,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  GitFork,
} from "lucide-react";

// ── Page ───────────────────────────────────────────────────────────────────

export default function CrossChainPage() {
  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } =
    useCrossChainState();

  const emergencyCount =
    data?.satellites.filter((s: SatelliteChainState) => s.emergencyMode).length ?? 0;
  const healthyCount =
    data?.satellites.filter((s: SatelliteChainState) => !s.emergencyMode).length ?? 0;
  const totalChains = (data?.satellites.length ?? 0) + 1;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="space-y-4">
      {/* ── Hero banner ───────────────────────────────────────────── */}
      <div className="hero-banner px-6 py-5">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          {/* Left — title block */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
              Cross-Chain Router · Polkadot XCM
            </p>
            <h1 className="mt-1 stat-number text-2xl text-text-primary">
              Multi-Chain Topology
            </h1>
            <p className="mt-1.5 max-w-sm text-[12px] text-text-secondary">
              ERC-4626 hub vault routes capital across Polkadot parachains via
              XCM messaging
            </p>
          </div>

          {/* Right — stats + refresh */}
          <div className="flex items-center gap-5">
            {data && (
              <>
                {/* Global TVL */}
                <div className="text-right">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    Global TVL
                  </p>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <Globe className="h-3 w-3 text-accent" />
                    <span className="stat-number text-xl text-text-primary">
                      {formatUsd(data.globalTotalAssets ?? "0")}
                    </span>
                  </div>
                </div>

                {/* Total chains */}
                <div className="text-right">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    Chains
                  </p>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <GitFork className="h-3 w-3 text-text-muted" />
                    <span className="stat-number text-xl text-text-primary">
                      {totalChains}
                    </span>
                  </div>
                </div>

                {/* Healthy */}
                <div className="text-right">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    Healthy
                  </p>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    <span className="stat-number text-xl text-primary">
                      {healthyCount + 1}
                    </span>
                  </div>
                </div>

                {/* Emergency — only shown when > 0 */}
                {emergencyCount > 0 && (
                  <div className="text-right">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                      Emergency
                    </p>
                    <div className="mt-0.5 flex items-center justify-end gap-1.5">
                      <ShieldAlert className="h-3 w-3 text-danger" />
                      <span className="stat-number text-xl text-danger">
                        {emergencyCount}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={cn(
                "btn-ghost flex items-center gap-1.5 text-xs",
                isFetching && "opacity-60",
              )}
            >
              <RefreshCw
                className={cn("h-3 w-3", isFetching && "animate-spin")}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Live indicator + last update */}
        {lastUpdated && (
          <div className="relative z-10 mt-3 flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              Last updated {lastUpdated.toLocaleTimeString()}
            </span>
            {isFetching && (
              <span className="font-mono text-[10px] text-accent">
                · Syncing…
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Content states ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="panel flex min-h-[400px] items-center justify-center rounded-lg p-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            <span className="font-mono text-xs text-text-muted">
              Syncing cross-chain state…
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="panel rounded-lg p-10 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load cross-chain state
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">
            Check that the agent server is running
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost mx-auto mt-4 w-auto px-4 text-xs"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Chain topology — hub + spoke */}
          <ChainTopology state={data} />

          {/* Capital allocation stacked bar */}
          <AllocationBreakdown state={data} />

          {/* Network health per-chain grid */}
          <NetworkHealth state={data} />

          {/* Detailed satellite table */}
          <SatelliteTable
            satellites={data.satellites}
            globalTotal={data.globalTotalAssets ?? "0"}
          />
        </div>
      ) : null}
    </div>
  );
}
