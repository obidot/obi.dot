"use client";

import { useCrossChainState } from "@/hooks/use-crosschain";
import { SatelliteTable } from "@/components/crosschain/satellite-table";
import { ChainTopology } from "@/components/crosschain/chain-topology";
import { Loader2 } from "lucide-react";

export default function CrossChainPage() {
  const { data, isLoading, error } = useCrossChainState();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Cross-Chain Overview
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Multi-chain vault topology and asset distribution
        </p>
      </div>

      {isLoading ? (
        <div className="card flex min-h-[400px] items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-danger">
            Failed to load cross-chain state
          </p>
        </div>
      ) : data ? (
        <>
          <ChainTopology state={data} />
          <SatelliteTable satellites={data.satelliteAssets} />
        </>
      ) : null}
    </div>
  );
}
