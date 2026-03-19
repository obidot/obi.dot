"use client";

import { useMemo } from "react";
import type { ProtocolYield, BifrostYield } from "@/types";
import type { VaultOnChainState } from "@/hooks/use-vault-state";
import { formatUsdNumber, cn } from "@/lib/format";
import { PieChart, Lightbulb } from "lucide-react";

interface PortfolioOptimizerProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  vault: VaultOnChainState | undefined;
}

interface AllocationSlice {
  name: string;
  category?: string;
  apy: number;
  tvl: number;
  /** Suggested allocation weight 0-1 */
  weight: number;
  /** USD amount if vault fully deployed */
  amountUsd: number;
  /** Color for the bar */
  color: string;
}

/**
 * Simplified Markowitz-inspired optimizer.
 * Weights = normalized (APY * safetyMultiplier * tvlMultiplier).
 */
function optimizeAllocations(
  yields: ProtocolYield[],
  bifrostYields: BifrostYield[],
  totalBudgetUsd: number,
): AllocationSlice[] {
  const COLORS = [
    "bg-primary",
    "bg-secondary",
    "bg-accent",
    "bg-warning",
    "bg-primary/60",
    "bg-secondary/60",
    "bg-accent/60",
    "bg-warning/60",
    "bg-danger/60",
  ];

  type Item = {
    name: string;
    apy: number;
    tvl: number;
    category?: string;
    safetyMul: number;
  };

  const items: Item[] = [];

  for (const y of yields) {
    items.push({
      name: y.name,
      apy: y.apyPercent,
      tvl: y.tvlUsd,
      safetyMul: 0.9,
    });
  }
  for (const y of bifrostYields) {
    const mul =
      y.category === "SLP"
        ? 1.0
        : y.category === "DEX"
          ? 0.7
          : y.category === "Farming"
            ? 0.5
            : y.category === "SALP"
              ? 0.6
              : 0.7;
    items.push({
      name: y.name,
      apy: y.apyPercent,
      tvl: y.tvlUsd,
      category: y.category,
      safetyMul: mul,
    });
  }

  // Score each: APY * safety * log(TVL)
  const scored = items.map((item) => {
    const tvlFactor = Math.log10(Math.max(item.tvl, 1_000)) / 8; // normalize to 0-1ish
    const rawScore = item.apy * item.safetyMul * tvlFactor;
    return { ...item, rawScore: Math.max(rawScore, 0.01) };
  });

  const totalScore = scored.reduce((a, b) => a + b.rawScore, 0);

  return scored
    .map((item, idx) => {
      const weight = item.rawScore / totalScore;
      return {
        name: item.name,
        category: item.category,
        apy: item.apy,
        tvl: item.tvl,
        weight,
        amountUsd: weight * totalBudgetUsd,
        color: COLORS[idx % COLORS.length],
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

export function PortfolioOptimizer({
  yields,
  bifrostYields,
  vault,
}: PortfolioOptimizerProps) {
  const totalUsd = vault
    ? (Number(vault.totalAssets) / 1e18) * 7 // rough DOT price
    : 10_000;

  const allocations = useMemo(
    () => optimizeAllocations(yields, bifrostYields, totalUsd),
    [yields, bifrostYields, totalUsd],
  );

  const weightedApy = allocations.reduce((a, s) => a + s.apy * s.weight, 0);

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <PieChart className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Portfolio Optimizer
            </h3>
            <p className="font-mono text-xs text-text-muted">
              Risk-adjusted allocation for {formatUsdNumber(totalUsd, true)}{" "}
              portfolio
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            Weighted APY
          </p>
          <p className="stat-number text-lg text-primary">
            {weightedApy.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Allocation Bar */}
      <div className="px-4 py-3">
        <div className="flex h-6 overflow-hidden rounded-full">
          {allocations.map((slice) => (
            <div
              key={slice.name}
              className={cn("h-full transition-all", slice.color)}
              style={{
                width: `${slice.weight * 100}%`,
                minWidth: slice.weight > 0.01 ? "2px" : "0",
              }}
              title={`${slice.name}: ${(slice.weight * 100).toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      {/* Allocation Table */}
      <div className="border-t border-border">
        <table className="table-pro w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Protocol</th>
              <th className="px-4 py-2 text-right">Weight</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">APY</th>
              <th className="px-4 py-2 text-right">Contrib</th>
            </tr>
          </thead>
          <tbody>
            {allocations.slice(0, 8).map((slice) => (
              <tr key={slice.name} className="hover:bg-surface-hover">
                <td className="px-4 py-1.5 text-left">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", slice.color)} />
                    <span className="truncate text-xs text-text-primary">
                      {slice.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-1.5 text-right font-mono text-xs text-text-secondary">
                  {(slice.weight * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-1.5 text-right font-mono text-xs text-text-secondary">
                  {formatUsdNumber(slice.amountUsd, true)}
                </td>
                <td className="px-4 py-1.5 text-right font-mono text-xs text-primary">
                  {slice.apy.toFixed(1)}%
                </td>
                <td className="px-4 py-1.5 text-right font-mono text-xs text-accent">
                  +{(slice.apy * slice.weight).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommendation */}
      <div className="flex items-start gap-2.5 border-t border-border px-4 py-3">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="font-mono text-xs leading-relaxed text-text-secondary">
          {allocations[0]
            ? `Recommended: Allocate ${(allocations[0].weight * 100).toFixed(0)}% to ${allocations[0].name} for best risk-adjusted returns. `
            : ""}
          Diversify across {Math.min(allocations.length, 4)} protocols to reduce
          concentration risk. Rebalance when any position drifts &gt;10% from
          target weights.
        </p>
      </div>
    </div>
  );
}
