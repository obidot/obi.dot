"use client";

import { Crosshair, Shield } from "lucide-react";
import { useMemo } from "react";
import { cn, formatUsdNumber } from "@/lib/format";
import { analyzeRisks, riskTierBg, riskTierColor } from "@/lib/risk-analyzer";
import type { BifrostYield, ProtocolYield } from "@/types";

interface RiskMatrixProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
}

const QUADRANT_LABELS = [
  {
    x: 25,
    y: 75,
    label: "Sweet Spot",
    desc: "Low risk, High reward",
    color: "text-primary",
  },
  {
    x: 75,
    y: 75,
    label: "High Alpha",
    desc: "High risk, High reward",
    color: "text-warning",
  },
  {
    x: 25,
    y: 25,
    label: "Safe Haven",
    desc: "Low risk, Low reward",
    color: "text-accent",
  },
  {
    x: 75,
    y: 25,
    label: "Avoid",
    desc: "High risk, Low reward",
    color: "text-danger",
  },
];

export function RiskMatrix({ yields, bifrostYields }: RiskMatrixProps) {
  const profiles = useMemo(
    () => analyzeRisks(yields, bifrostYields),
    [yields, bifrostYields],
  );

  // Normalize coordinates for the plot area
  const maxApy = Math.max(...profiles.map((p) => p.apy), 1);

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-secondary">
            <Crosshair className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Risk Surface</span>
            <h3 className="panel-title">Risk / Reward Matrix</h3>
            <p className="panel-subtitle">
              Quadrant view of reward potential against aggregate protocol risk.
            </p>
          </div>
        </div>
      </div>

      <div className="relative mx-4 my-4 h-[320px] border-[3px] border-border bg-background">
        <div className="absolute inset-0">
          <div className="absolute left-1/2 top-0 h-full w-px bg-border-subtle" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-border-subtle" />
        </div>

        {QUADRANT_LABELS.map((q) => (
          <div
            key={q.label}
            className="absolute flex flex-col items-center"
            style={{
              left: `${q.x}%`,
              top: `${100 - q.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span
              className={cn("font-mono text-xs font-bold opacity-40", q.color)}
            >
              {q.label}
            </span>
            <span className="font-mono text-[10px] text-text-muted opacity-30">
              {q.desc}
            </span>
          </div>
        ))}

        {profiles.map((profile) => {
          const x = (profile.overallRisk / 100) * 100;
          const y = Math.min((profile.apy / (maxApy * 1.2)) * 100, 95);
          const size = Math.max(
            8,
            Math.min(24, (profile.tvl / 50_000_000) * 20),
          );

          return (
            <div
              key={`${profile.protocol}-${profile.name}`}
              className="group absolute"
              style={{
                left: `${Math.max(3, Math.min(97, x))}%`,
                bottom: `${Math.max(3, Math.min(97, y))}%`,
                transform: "translate(-50%, 50%)",
              }}
            >
              <div
                className={cn(
                  "rounded-full border-2 transition-all duration-200 group-hover:scale-150",
                  profile.isBifrost
                    ? "border-secondary bg-secondary/40"
                    : "border-primary bg-primary/40",
                )}
                style={{ width: `${size}px`, height: `${size}px` }}
              />

              <div
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 scale-0 border-[3px] border-border bg-surface p-2 shadow-lg transition-transform group-hover:scale-100"
                style={{ width: "180px" }}
              >
                <p className="truncate text-xs font-semibold text-text-primary">
                  {profile.name}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    Risk: {profile.overallRisk}%
                  </span>
                  <span
                    className={cn(
                      "pill text-[10px]",
                      riskTierBg(profile.tier),
                      riskTierColor(profile.tier),
                    )}
                  >
                    {profile.tier}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-xs text-primary">
                    APY: {profile.apy.toFixed(1)}%
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    TVL: {formatUsdNumber(profile.tvl, true)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2">
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            Risk →
          </span>
        </div>
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 -rotate-90">
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
            Reward →
          </span>
        </div>
      </div>

      <div className="border-t-[3px] border-border">
        <table className="table-pro w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Protocol</th>
              <th className="px-4 py-2 text-right">Risk</th>
              <th className="px-4 py-2 text-right">APY</th>
              <th className="px-4 py-2 text-right">Protocol</th>
              <th className="px-4 py-2 text-right">IL</th>
              <th className="px-4 py-2 text-right">Liquidity</th>
              <th className="px-4 py-2 text-center">Tier</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr
                key={`${p.protocol}-${p.name}`}
                className="hover:bg-surface-hover"
              >
                <td className="px-4 py-2 text-left">
                  <div className="flex items-center gap-2">
                    <Shield className={cn("h-3 w-3", riskTierColor(p.tier))} />
                    <span className="truncate text-xs text-text-primary">
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <RiskBar value={p.overallRisk} />
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-primary">
                  {p.apy.toFixed(1)}%
                </td>
                <td className="px-4 py-2 text-right">
                  <RiskBar value={p.dimensions.protocolRisk} />
                </td>
                <td className="px-4 py-2 text-right">
                  <RiskBar value={p.dimensions.impermanentLoss} />
                </td>
                <td className="px-4 py-2 text-right">
                  <RiskBar value={p.dimensions.liquidityRisk} />
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={cn(
                      "pill text-[11px]",
                      riskTierBg(p.tier),
                      riskTierColor(p.tier),
                    )}
                  >
                    {p.tier}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskBar({ value }: { value: number }) {
  const color =
    value < 30 ? "bg-primary" : value < 60 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-xs text-text-muted">{value}</span>
    </div>
  );
}
