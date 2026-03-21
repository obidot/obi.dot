"use client";

import { BarChart3 } from "lucide-react";
import { cn, formatUsd } from "@/lib/format";
import type { CrossChainVaultState } from "@/types";

// ── Color palette per segment ──────────────────────────────────────────────

const SEGMENT_COLORS = [
  { bar: "bg-primary", text: "text-primary", dot: "bg-primary" },
  { bar: "bg-accent", text: "text-accent", dot: "bg-accent" },
  { bar: "bg-secondary", text: "text-secondary", dot: "bg-secondary" },
  { bar: "bg-warning", text: "text-warning", dot: "bg-warning" },
  { bar: "bg-danger", text: "text-danger", dot: "bg-danger" },
] as const;

interface Segment {
  label: string;
  assets: string;
  pct: number;
  color: (typeof SEGMENT_COLORS)[number];
}

// ── Component ──────────────────────────────────────────────────────────────

export function AllocationBreakdown({
  state,
}: {
  state: CrossChainVaultState;
}) {
  const globalTotal = BigInt(state.globalTotalAssets ?? "0");
  if (globalTotal === 0n) return null;

  const satTotal = BigInt(state.totalSatelliteAssets ?? "0");
  const hubAssets = globalTotal - satTotal;
  const hubPct = Number((hubAssets * 10000n) / globalTotal) / 100;

  const segments: Segment[] = [
    {
      label: state.hub?.chain ?? "Hub",
      assets: hubAssets.toString(),
      pct: hubPct,
      color: SEGMENT_COLORS[0],
    },
    ...state.satellites.map((sat, i) => ({
      label: sat.chainName,
      assets: sat.totalAssets,
      pct: Number((BigInt(sat.totalAssets) * 10000n) / globalTotal) / 100,
      color: SEGMENT_COLORS[(i + 1) % SEGMENT_COLORS.length],
    })),
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-primary">
            <BarChart3 className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Capital Map</span>
            <h3 className="panel-title">Allocation Breakdown</h3>
            <p className="panel-subtitle">
              Distribution of global assets between the hub vault and live
              satellites.
            </p>
          </div>
        </div>
        <span className="pill bg-primary text-primary-foreground">
          {formatUsd(state.globalTotalAssets ?? "0")} global TVL
        </span>
      </div>

      <div className="p-5">
        <div className="flex h-9 w-full overflow-hidden border-[3px] border-border bg-surface-alt">
          {segments.map((seg, i) => (
            <div
              key={seg.label}
              title={`${seg.label}: ${formatUsd(seg.assets)} (${seg.pct.toFixed(1)}%)`}
              className={cn(
                "relative h-full cursor-default transition-all duration-700 hover:brightness-110",
                seg.color.bar,
                i > 0 && "border-l border-background/30",
              )}
              style={{ width: `${seg.pct}%` }}
            >
              {seg.pct >= 12 && (
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-background/70 mix-blend-overlay">
                  {seg.pct.toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className="border-[3px] border-border bg-background px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-sm",
                      seg.color.dot,
                    )}
                  />
                  <span className="retro-label text-sm text-text-primary">
                    {seg.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono text-[11px] font-semibold",
                    seg.color.text,
                  )}
                >
                  {seg.pct.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-text-muted">
                {formatUsd(seg.assets)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
