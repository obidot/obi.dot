"use client";

import { useCrossChainState } from "@/hooks/use-crosschain";
import { SatelliteTable } from "@/components/crosschain/satellite-table";
import { ChainTopology } from "@/components/crosschain/chain-topology";
import { Loader2, Globe, ArrowLeftRight } from "lucide-react";
import { formatUsd } from "@/lib/format";

export default function CrossChainPage() {
  const { data, isLoading, error } = useCrossChainState();

  return (
    <div className="space-y-4">
      {/* Hero bar */}
      <div className="hero-banner px-6 py-5">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Cross-Chain Router
            </p>
            <h1 className="mt-1 stat-number text-2xl text-text-primary">
              Multi-Chain Topology
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              Vault distribution across Polkadot parachains via XCM
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Global TVL
                </p>
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-accent" />
                  <span className="stat-number text-lg text-text-primary">
                    {formatUsd(data.globalTotalAssets ?? "0")}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Satellites
                </p>
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-secondary" />
                  <span className="stat-number text-lg text-secondary">
                    {data.satellites.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="panel flex min-h-[400px] items-center justify-center rounded-lg p-8">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            <span className="font-mono text-xs text-text-muted">
              Loading cross-chain state...
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load cross-chain state
          </p>
        </div>
      ) : data ? (
        <>
          <ChainTopology state={data} />
          <SatelliteTable satellites={data.satellites} />
        </>
      ) : null}
    </div>
  );
}
