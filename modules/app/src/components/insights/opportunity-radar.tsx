"use client";

import { useMemo } from "react";
import type { ProtocolYield, BifrostYield } from "@/types";
import {
  scoreOpportunities,
  type ScoredOpportunity,
} from "@/lib/yield-opportunity-score";
import { formatApy, formatUsdNumber, cn } from "@/lib/format";
import {
  Zap,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Ban,
  ChevronRight,
  Target,
} from "lucide-react";

const SIGNAL_CONFIG = {
  STRONG_BUY: {
    icon: Zap,
    label: "Strong Buy",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    glow: "glow-green",
  },
  BUY: {
    icon: TrendingUp,
    label: "Buy",
    color: "text-primary",
    bg: "bg-primary/8",
    border: "border-primary/20",
    glow: "",
  },
  NEUTRAL: {
    icon: ShieldCheck,
    label: "Neutral",
    color: "text-text-secondary",
    bg: "bg-surface-hover",
    border: "border-border",
    glow: "",
  },
  CAUTION: {
    icon: AlertTriangle,
    label: "Caution",
    color: "text-warning",
    bg: "bg-warning/8",
    border: "border-warning/20",
    glow: "",
  },
  AVOID: {
    icon: Ban,
    label: "Avoid",
    color: "text-danger",
    bg: "bg-danger/8",
    border: "border-danger/20",
    glow: "",
  },
} as const;

interface OpportunityRadarProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  onSelectOpportunity?: (opp: ScoredOpportunity) => void;
}

export function OpportunityRadar({
  yields,
  bifrostYields,
  onSelectOpportunity,
}: OpportunityRadarProps) {
  const scored = useMemo(
    () => scoreOpportunities(yields, bifrostYields),
    [yields, bifrostYields],
  );

  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length)
      : 0;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Target className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Opportunity Radar
            </h3>
            <p className="font-mono text-[9px] text-text-muted">
              AI-scored yield opportunities ranked by risk-adjusted returns
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-text-muted">
            Avg Score
          </p>
          <p className={cn("stat-number text-lg", avgScore >= 60 ? "text-primary" : avgScore >= 40 ? "text-warning" : "text-danger")}>
            {avgScore}
          </p>
        </div>
      </div>

      {/* Opportunity List */}
      <div className="divide-y divide-border-subtle">
        {scored.map((opp, idx) => {
          const config = SIGNAL_CONFIG[opp.signal];
          const SignalIcon = config.icon;

          return (
            <button
              key={`${opp.yield.protocol}-${opp.yield.name}`}
              type="button"
              onClick={() => onSelectOpportunity?.(opp)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
            >
              {/* Rank */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-[10px] font-bold text-text-muted">
                {idx + 1}
              </span>

              {/* Score Bar */}
              <div className="w-12 shrink-0">
                <div className="flex items-center gap-1">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className={cn("h-full rounded-full transition-all", opp.score >= 60 ? "bg-primary" : opp.score >= 40 ? "bg-warning" : "bg-danger")}
                      style={{ width: `${opp.score}%` }}
                    />
                  </div>
                </div>
                <p className="mt-0.5 text-center font-mono text-[9px] font-bold text-text-secondary">
                  {opp.score}
                </p>
              </div>

              {/* Name + Signal */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {opp.yield.name}
                  </p>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      config.bg,
                      config.color,
                    )}
                  >
                    <SignalIcon className="h-2.5 w-2.5" />
                    {config.label}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-text-muted">
                  {opp.recommendation}
                </p>
              </div>

              {/* APY + TVL */}
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-bold text-primary">
                  {formatApy(opp.yield.apyPercent)}
                </p>
                <p className="font-mono text-[9px] text-text-muted">
                  {formatUsdNumber(opp.yield.tvlUsd, true)}
                </p>
              </div>

              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            </button>
          );
        })}
      </div>

      {/* Footer: Score breakdown legend */}
      <div className="flex items-center gap-4 border-t border-border px-4 py-2">
        <span className="font-mono text-[9px] text-text-muted">Score = </span>
        {[
          { label: "APY", w: 30 },
          { label: "TVL", w: 25 },
          { label: "Risk-Adj", w: 20 },
          { label: "Category", w: 15 },
          { label: "Fresh", w: 10 },
        ].map((s) => (
          <span
            key={s.label}
            className="font-mono text-[9px] text-text-muted"
          >
            {s.label}({s.w})
          </span>
        ))}
      </div>
    </div>
  );
}
