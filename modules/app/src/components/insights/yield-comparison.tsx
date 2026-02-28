"use client";

import { useState, useMemo } from "react";
import type { ProtocolYield, BifrostYield } from "@/types";
import { formatApy, formatUsdNumber, cn } from "@/lib/format";
import { GitCompareArrows, Check, X } from "lucide-react";

interface YieldComparisonProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
}

type YieldItem = {
  yield_: ProtocolYield | BifrostYield;
  category?: string;
  isBifrost: boolean;
};

/** 5-dimension radar data */
interface RadarDimension {
  label: string;
  a: number;
  b: number;
  max: number;
}

export function YieldComparison({
  yields,
  bifrostYields,
}: YieldComparisonProps) {
  const allYields = useMemo(() => {
    const items: YieldItem[] = [];
    for (const y of yields) items.push({ yield_: y, isBifrost: false });
    for (const y of bifrostYields)
      items.push({ yield_: y, category: y.category, isBifrost: true });
    return items.sort((a, b) => b.yield_.apyPercent - a.yield_.apyPercent);
  }, [yields, bifrostYields]);

  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(Math.min(1, allYields.length - 1));

  const a = allYields[idxA];
  const b = allYields[idxB];

  if (!a || !b) {
    return (
      <div className="panel flex min-h-[200px] items-center justify-center rounded-lg">
        <p className="font-mono text-xs text-text-muted">Need at least 2 yield sources to compare</p>
      </div>
    );
  }

  const maxApy = Math.max(a.yield_.apyPercent, b.yield_.apyPercent, 1);
  const maxTvl = Math.max(a.yield_.tvlUsd, b.yield_.tvlUsd, 1);

  const dimensions: RadarDimension[] = [
    { label: "APY", a: a.yield_.apyPercent, b: b.yield_.apyPercent, max: maxApy * 1.2 },
    { label: "TVL", a: Math.log10(Math.max(a.yield_.tvlUsd, 1)), b: Math.log10(Math.max(b.yield_.tvlUsd, 1)), max: Math.log10(maxTvl * 2) },
    { label: "Safety", a: safetyScore(a), b: safetyScore(b), max: 100 },
    { label: "Liquidity", a: liquidityScore(a.yield_.tvlUsd), b: liquidityScore(b.yield_.tvlUsd), max: 100 },
    { label: "Stability", a: stabilityScore(a), b: stabilityScore(b), max: 100 },
  ];

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/10">
            <GitCompareArrows className="h-3.5 w-3.5 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Head-to-Head Comparison
            </h3>
            <p className="font-mono text-[9px] text-text-muted">
              Side-by-side 5-dimension analysis
            </p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-4 border-b border-border p-4">
        <div>
          <label className="mb-1 block text-[9px] uppercase tracking-wider text-primary font-bold">
            Protocol A
          </label>
          <select
            value={idxA}
            onChange={(e) => setIdxA(Number(e.target.value))}
            className="input-trading w-full py-1.5 text-xs"
          >
            {allYields.map((item, idx) => (
              <option key={`a-${item.yield_.protocol}-${item.yield_.name}`} value={idx}>
                {item.yield_.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[9px] uppercase tracking-wider text-secondary font-bold">
            Protocol B
          </label>
          <select
            value={idxB}
            onChange={(e) => setIdxB(Number(e.target.value))}
            className="input-trading w-full py-1.5 text-xs"
          >
            {allYields.map((item, idx) => (
              <option key={`b-${item.yield_.protocol}-${item.yield_.name}`} value={idx}>
                {item.yield_.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Visual Radar (simplified bar comparison) */}
      <div className="p-4">
        <div className="space-y-3">
          {dimensions.map((dim) => {
            const aPct = (dim.a / dim.max) * 100;
            const bPct = (dim.b / dim.max) * 100;
            const aWins = dim.a > dim.b;
            const bWins = dim.b > dim.a;

            return (
              <div key={dim.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-text-muted w-16">{dim.label}</span>
                  <div className="flex-1 mx-2 flex gap-1">
                    {/* A bar (grows left-to-right from center) */}
                    <div className="flex-1 flex justify-end">
                      <div className="h-3 overflow-hidden rounded-l-full bg-surface-hover w-full relative">
                        <div
                          className={cn("absolute right-0 h-full rounded-l-full", aWins ? "bg-primary" : "bg-primary/40")}
                          style={{ width: `${Math.min(aPct, 100)}%` }}
                        />
                      </div>
                    </div>
                    {/* B bar (grows left-to-right) */}
                    <div className="flex-1">
                      <div className="h-3 overflow-hidden rounded-r-full bg-surface-hover w-full relative">
                        <div
                          className={cn("absolute left-0 h-full rounded-r-full", bWins ? "bg-secondary" : "bg-secondary/40")}
                          style={{ width: `${Math.min(bPct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-primary" />
            <span className="truncate font-mono text-[9px] text-text-muted">{a.yield_.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-secondary" />
            <span className="truncate font-mono text-[9px] text-text-muted">{b.yield_.name}</span>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="border-t border-border">
        <table className="table-pro w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Metric</th>
              <th className="px-4 py-2 text-right text-primary">A</th>
              <th className="px-4 py-2 text-right text-secondary">B</th>
              <th className="px-4 py-2 text-center">Winner</th>
            </tr>
          </thead>
          <tbody>
            <CompRow
              label="APY"
              aVal={formatApy(a.yield_.apyPercent)}
              bVal={formatApy(b.yield_.apyPercent)}
              aWins={a.yield_.apyPercent > b.yield_.apyPercent}
            />
            <CompRow
              label="TVL"
              aVal={formatUsdNumber(a.yield_.tvlUsd, true)}
              bVal={formatUsdNumber(b.yield_.tvlUsd, true)}
              aWins={a.yield_.tvlUsd > b.yield_.tvlUsd}
            />
            <CompRow
              label="Safety"
              aVal={`${safetyScore(a)}/100`}
              bVal={`${safetyScore(b)}/100`}
              aWins={safetyScore(a) > safetyScore(b)}
            />
            <CompRow
              label="Category"
              aVal={a.category ?? "DeFi"}
              bVal={b.category ?? "DeFi"}
              aWins={false}
              neutral
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompRow({
  label,
  aVal,
  bVal,
  aWins,
  neutral,
}: {
  label: string;
  aVal: string;
  bVal: string;
  aWins: boolean;
  neutral?: boolean;
}) {
  return (
    <tr className="hover:bg-surface-hover">
      <td className="px-4 py-1.5 text-left font-mono text-[10px] text-text-muted">
        {label}
      </td>
      <td className={cn("px-4 py-1.5 text-right font-mono text-xs", aWins && !neutral ? "text-primary font-bold" : "text-text-secondary")}>
        {aVal}
      </td>
      <td className={cn("px-4 py-1.5 text-right font-mono text-xs", !aWins && !neutral ? "text-secondary font-bold" : "text-text-secondary")}>
        {bVal}
      </td>
      <td className="px-4 py-1.5 text-center">
        {neutral ? (
          <span className="text-[9px] text-text-muted">—</span>
        ) : aWins ? (
          <Check className="mx-auto h-3 w-3 text-primary" />
        ) : (
          <Check className="mx-auto h-3 w-3 text-secondary" />
        )}
      </td>
    </tr>
  );
}

// ── Scoring Helpers ───────────────────────────────────────────────────────

function safetyScore(item: YieldItem): number {
  const cat = item.category;
  if (cat === "SLP") return 85;
  if (cat === "DEX") return 60;
  if (cat === "Farming") return 40;
  if (cat === "SALP") return 55;
  // Non-bifrost DeFi protocols — moderate safety
  return 65;
}

function liquidityScore(tvl: number): number {
  if (tvl >= 100_000_000) return 95;
  if (tvl >= 50_000_000) return 80;
  if (tvl >= 10_000_000) return 60;
  if (tvl >= 1_000_000) return 40;
  return 20;
}

function stabilityScore(item: YieldItem): number {
  const apy = item.yield_.apyPercent;
  // Very high APY tends to be volatile/unsustainable
  if (apy > 30) return 25;
  if (apy > 15) return 50;
  if (apy > 8) return 70;
  return 85;
}
