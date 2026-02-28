"use client";

import type { CrossChainVaultState } from "@/types";
import { formatUsd } from "@/lib/format";
import { ArrowRight, Globe, Landmark, Zap } from "lucide-react";

export function ChainTopology({ state }: { state: CrossChainVaultState }) {
  const globalTotal = state.globalTotalAssets ?? "0";
  const satTotal = state.totalSatelliteAssets ?? "0";
  const hubAssets = BigInt(globalTotal) - BigInt(satTotal);
  const hubPct =
    BigInt(globalTotal) > 0n
      ? Number((hubAssets * 100n) / BigInt(globalTotal))
      : 100;
  const satPct = 100 - hubPct;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Asset Distribution
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
        {/* Hub vault */}
        <div className="bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Landmark className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">
                Hub Vault
              </p>
              <p className="stat-number text-xl text-text-primary">
                {formatUsd(hubAssets.toString())}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-text-muted">
                Allocation
              </span>
              <span className="font-mono text-[10px] text-primary">
                {hubPct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${hubPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Flow indicator — XCM bridge */}
        <div className="flex flex-col items-center justify-center bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="h-px w-8 bg-accent/40" />
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/5">
              <Zap className="h-4 w-4 text-accent" />
            </div>
            <div className="h-px w-8 bg-accent/40" />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-accent">
            XCM Bridge
          </p>
          <p className="mt-1 stat-number text-sm text-text-primary">
            {formatUsd(state.globalTotalAssets ?? "0")}
          </p>
          <p className="text-[9px] text-text-muted">Global TVL</p>
        </div>

        {/* Satellite vaults */}
        <div className="bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10">
              <Globe className="h-4 w-4 text-secondary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">
                Satellite Vaults
              </p>
              <p className="stat-number text-xl text-text-primary">
                {formatUsd(satTotal)}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-text-muted">
                Allocation
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {satPct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-border">
              <div
                className="h-full rounded-full bg-secondary transition-all duration-500"
                style={{ width: `${satPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
