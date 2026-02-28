"use client";

import type { CrossChainVaultState, SatelliteChainState } from "@/types";
import { formatUsd, cn } from "@/lib/format";
import {
  Landmark,
  Globe,
  Zap,
  CheckCircle2,
  ShieldAlert,
  Network,
} from "lucide-react";

// ── Chain color palette ────────────────────────────────────────────────────

const CHAIN_COLORS = [
  {
    bg: "bg-accent/10",
    text: "text-accent",
    bar: "bg-accent",
    border: "border-accent/20",
    dot: "bg-accent",
  },
  {
    bg: "bg-secondary/10",
    text: "text-secondary",
    bar: "bg-secondary",
    border: "border-secondary/20",
    dot: "bg-secondary",
  },
  {
    bg: "bg-warning/10",
    text: "text-warning",
    bar: "bg-warning",
    border: "border-warning/20",
    dot: "bg-warning",
  },
  {
    bg: "bg-primary/10",
    text: "text-primary",
    bar: "bg-primary",
    border: "border-primary/20",
    dot: "bg-primary",
  },
] as const;

// ── Sub-components ─────────────────────────────────────────────────────────

function SatelliteRow({
  sat,
  idx,
  globalTotal,
}: {
  sat: SatelliteChainState;
  idx: number;
  globalTotal: bigint;
}) {
  const color = CHAIN_COLORS[idx % CHAIN_COLORS.length];
  const assets = BigInt(sat.totalAssets);
  const pct =
    globalTotal > 0n ? Number((assets * 10000n) / globalTotal) / 100 : 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-5 py-4 transition-colors",
        "border-b border-border last:border-b-0 hover:bg-surface-hover",
        sat.emergencyMode && "bg-danger/[0.03]",
      )}
    >
      {/* Chain avatar */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          color.bg,
          color.border,
        )}
      >
        <Globe className={cn("h-4 w-4", color.text)} />
      </div>

      {/* Chain identity */}
      <div className="min-w-[130px] flex-1">
        <p className="text-[13px] font-semibold leading-tight text-text-primary">
          {sat.chainName}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-text-muted">
          Para #{sat.chainId}
        </p>
      </div>

      {/* Assets */}
      <div className="hidden sm:block text-right">
        <p className="stat-number text-[15px] text-text-primary">
          {formatUsd(sat.totalAssets)}
        </p>
        <p className="font-mono text-[9px] text-text-muted uppercase tracking-wider">
          Deployed
        </p>
      </div>

      {/* Allocation mini-bar */}
      <div className="hidden md:flex w-28 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className={cn("font-mono text-[10px]", color.text)}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-border">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              color.bar,
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0">
        {sat.emergencyMode ? (
          <span className="pill bg-danger/10 text-danger text-[10px]">
            <ShieldAlert className="h-3 w-3" />
            Emergency
          </span>
        ) : (
          <span className="pill bg-primary/10 text-primary text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Healthy
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ChainTopology({ state }: { state: CrossChainVaultState }) {
  const globalTotal = BigInt(state.globalTotalAssets ?? "0");
  const satTotal = BigInt(state.totalSatelliteAssets ?? "0");
  const hubAssets = globalTotal - satTotal;
  const hubPct =
    globalTotal > 0n ? Number((hubAssets * 10000n) / globalTotal) / 100 : 100;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* ── Panel header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-3.5 w-3.5 text-text-muted" />
          <h3 className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Chain Topology
          </h3>
          <span className="pill bg-border text-text-muted text-[9px]">
            {state.satellites.length + 1} nodes
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-muted">
          Polkadot · XCM v3
        </span>
      </div>

      {/* ── Layout: Hub | XCM Connector | Satellites ──────────── */}
      <div className="flex min-h-[180px]">
        {/* Hub Vault — left column */}
        <div className="flex w-52 shrink-0 flex-col justify-center border-r border-border bg-surface p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Landmark className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                Hub Vault
              </p>
              <p className="text-[12px] font-semibold text-text-primary leading-tight">
                {state.hub?.chain ?? "Polkadot Hub"}
              </p>
            </div>
          </div>

          <p className="stat-number text-2xl text-text-primary">
            {formatUsd(hubAssets.toString())}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-text-muted">
            Total hub assets
          </p>

          {/* Allocation bar */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                Allocation
              </span>
              <span className="font-mono text-[11px] font-semibold text-primary">
                {hubPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${Math.min(hubPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Live indicator */}
          <div className="mt-4 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[9px] text-primary">
              Active · EVM
            </span>
          </div>
        </div>

        {/* ── XCM Connector — center spine ──────────────────────── */}
        <div className="relative flex w-14 shrink-0 flex-col items-center justify-center gap-2.5 border-r border-border bg-background/50">
          {/* Flowing dots — top half */}
          <div className="flex flex-col items-center gap-1.5">
            {[0, 150, 300, 450].map((delay) => (
              <span
                key={delay}
                className="xcm-dot h-1 w-1 rounded-full bg-accent/60"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>

          {/* XCM badge */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/25 bg-accent/8">
              <Zap className="h-3 w-3 text-accent" />
            </div>
            <span className="font-mono text-[8px] uppercase tracking-widest text-accent/70">
              XCM
            </span>
          </div>

          {/* Flowing dots — bottom half (reversed order) */}
          <div className="flex flex-col items-center gap-1.5">
            {[450, 300, 150, 0].map((delay, i) => (
              <span
                key={i}
                className="xcm-dot h-1 w-1 rounded-full bg-accent/60"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>

        {/* ── Satellite chain list — right column ───────────────── */}
        <div className="flex flex-1 flex-col">
          {state.satellites.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center">
                <Globe className="mx-auto mb-2 h-7 w-7 text-text-muted opacity-30" />
                <p className="font-mono text-xs text-text-muted">
                  No satellite vaults configured
                </p>
              </div>
            </div>
          ) : (
            state.satellites.map((sat, idx) => (
              <SatelliteRow
                key={sat.chainId}
                sat={sat}
                idx={idx}
                globalTotal={globalTotal}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
