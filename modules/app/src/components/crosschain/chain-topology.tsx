"use client";

import type { CrossChainVaultState } from "@/types";
import { formatUsd } from "@/lib/format";
import { ArrowLeftRight, Globe, Landmark } from "lucide-react";

export function ChainTopology({ state }: { state: CrossChainVaultState }) {
  const hubAssets = BigInt(state.globalTotalAssets) - BigInt(state.totalSatelliteAssets);
  const hubPct =
    BigInt(state.globalTotalAssets) > 0n
      ? Number((hubAssets * 100n) / BigInt(state.globalTotalAssets))
      : 100;
  const satPct = 100 - hubPct;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Hub vault */}
      <div className="card glow-green p-5">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Hub Vault
            </p>
            <p className="font-mono text-xl font-bold text-text-primary">
              {formatUsd(hubAssets.toString())}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${hubPct}%` }}
          />
        </div>
        <p className="mt-1 text-right font-mono text-[10px] text-text-muted">
          {hubPct}% of total
        </p>
      </div>

      {/* Flow indicator */}
      <div className="card flex items-center justify-center p-5">
        <div className="flex flex-col items-center gap-2">
          <ArrowLeftRight className="h-8 w-8 text-accent" />
          <p className="font-mono text-xs text-text-muted">XCM Bridge</p>
          <p className="font-mono text-lg font-bold text-text-primary">
            {formatUsd(state.globalTotalAssets)}
          </p>
          <p className="text-[10px] text-text-muted">Global TVL</p>
        </div>
      </div>

      {/* Satellite vaults */}
      <div className="card glow-purple p-5">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-secondary/10 p-2">
            <Globe className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Satellite Vaults
            </p>
            <p className="font-mono text-xl font-bold text-text-primary">
              {formatUsd(state.totalSatelliteAssets)}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-border">
          <div
            className="h-full rounded-full bg-secondary"
            style={{ width: `${satPct}%` }}
          />
        </div>
        <p className="mt-1 text-right font-mono text-[10px] text-text-muted">
          {satPct}% of total
        </p>
      </div>
    </div>
  );
}
