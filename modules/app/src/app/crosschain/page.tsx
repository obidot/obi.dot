"use client";

import { useCrossChainState } from "@/hooks/use-crosschain";
import { SatelliteTable } from "@/components/crosschain/satellite-table";
import { ChainTopology } from "@/components/crosschain/chain-topology";
import { AllocationBreakdown } from "@/components/crosschain/allocation-breakdown";
import { NetworkHealth } from "@/components/crosschain/network-health";
import { Loader2, RefreshCw } from "lucide-react";

// ── Page ───────────────────────────────────────────────────────────────────

export default function CrossChainPage() {
  const { data, isLoading, error, refetch } =
    useCrossChainState();

  return (
    <div className="space-y-4">
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
