"use client";

import type { CrossChainVaultState } from "@/types";
import { formatUsd, cn } from "@/lib/format";
import { BarChart3 } from "lucide-react";

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

export function AllocationBreakdown({ state }: { state: CrossChainVaultState }) {
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
    <div className="panel overflow-hidden rounded-lg">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-text-muted" />
          <h3 className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Capital Allocation
          </h3>
        </div>
        <span className="stat-number text-sm text-text-primary">
          {formatUsd(state.globalTotalAssets ?? "0")}
          <span className="ml-1.5 font-sans text-[10px] font-normal text-text-muted">
            Global TVL
          </span>
        </span>
      </div>

      <div className="p-5">
        {/* ── Stacked bar ─────────────────────────────────────────── */}
        <div className="flex h-7 w-full overflow-hidden rounded-md border border-border/60">
          {segments.map((seg, i) => (
            <div
              key={i}
              title={`${seg.label}: ${formatUsd(seg.assets)} (${seg.pct.toFixed(1)}%)`}
              className={cn(
                "relative h-full cursor-default transition-all duration-700 hover:brightness-110",
                seg.color.bar,
                i > 0 && "border-l border-background/30",
              )}
              style={{ width: `${seg.pct}%` }}
            >
              {/* Label inside segment if wide enough */}
              {seg.pct >= 12 && (
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold text-background/70 mix-blend-overlay">
                  {seg.pct.toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Legend ──────────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-sm", seg.color.dot)} />
              <span className="font-mono text-[11px] text-text-secondary">
                {seg.label}
              </span>
              <span className={cn("font-mono text-[11px] font-semibold", seg.color.text)}>
                {seg.pct.toFixed(1)}%
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {formatUsd(seg.assets)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
