"use client";

import { useMemo } from "react";
import type { AgentDecision, ProtocolYield, BifrostYield } from "@/types";
import { cn } from "@/lib/format";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Gauge,
} from "lucide-react";

interface MarketPulseProps {
  decisions: AgentDecision[];
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  recentSwapCount: number;
}

interface PulseMetrics {
  /** Overall sentiment -100 to +100 */
  sentiment: number;
  /** Label */
  label: "BULLISH" | "CAUTIOUSLY_BULLISH" | "NEUTRAL" | "CAUTIOUSLY_BEARISH" | "BEARISH";
  /** Color */
  color: string;
  /** Factors */
  factors: PulseFactor[];
  /** Agent activity summary */
  agentActivity: string;
}

interface PulseFactor {
  name: string;
  value: number; // -100 to +100
  description: string;
}

function computePulse(
  decisions: AgentDecision[],
  yields: ProtocolYield[],
  bifrostYields: BifrostYield[],
  recentSwapCount: number,
): PulseMetrics {
  const factors: PulseFactor[] = [];

  // Factor 1: APY momentum — is the average APY trending up or stable?
  const allApys = [
    ...yields.map((y) => y.apyPercent),
    ...bifrostYields.map((y) => y.apyPercent),
  ];
  const avgApy = allApys.length > 0 ? allApys.reduce((a, b) => a + b, 0) / allApys.length : 0;
  const apySignal = avgApy > 10 ? 40 : avgApy > 7 ? 20 : avgApy > 4 ? 0 : -20;
  factors.push({
    name: "APY Level",
    value: apySignal,
    description: `Average APY at ${avgApy.toFixed(1)}% — ${apySignal > 0 ? "above normal" : "within range"}`,
  });

  // Factor 2: Agent decision ratio — more actions = bullish, more NO_ACTION = bearish
  const recent = decisions.slice(0, 20);
  const actions = recent.filter((d) => d.action !== "NO_ACTION").length;
  const actionRatio = recent.length > 0 ? actions / recent.length : 0;
  const actionSignal = actionRatio > 0.5 ? 30 : actionRatio > 0.2 ? 10 : -10;
  factors.push({
    name: "Agent Activity",
    value: actionSignal,
    description: `${actions}/${recent.length} recent decisions were active deployments`,
  });

  // Factor 3: TVL strength — higher TVL = more confidence in the ecosystem
  const totalTvl = [...yields, ...bifrostYields].reduce((a, y) => a + y.tvlUsd, 0);
  const tvlSignal = totalTvl > 200_000_000 ? 25 : totalTvl > 50_000_000 ? 10 : totalTvl > 10_000_000 ? 0 : -15;
  factors.push({
    name: "TVL Depth",
    value: tvlSignal,
    description: `$${(totalTvl / 1e6).toFixed(0)}M total locked — ${tvlSignal > 0 ? "strong" : "developing"} ecosystem`,
  });

  // Factor 4: Yield diversity — more sources = healthier
  const sourceCount = yields.length + bifrostYields.length;
  const diversitySignal = sourceCount >= 8 ? 15 : sourceCount >= 5 ? 5 : -5;
  factors.push({
    name: "Diversity",
    value: diversitySignal,
    description: `${sourceCount} yield sources tracked — ${diversitySignal > 0 ? "well diversified" : "limited options"}`,
  });

  // Factor 5: On-chain swap volume — more swaps = more active ecosystem
  const volumeSignal = recentSwapCount > 100 ? 20 : recentSwapCount > 30 ? 10 : recentSwapCount > 5 ? 0 : -10;
  factors.push({
    name: "Swap Volume",
    value: volumeSignal,
    description: `${recentSwapCount} swaps recorded on-chain — ${volumeSignal > 0 ? "high activity" : "low activity"}`,
  });

  const sentiment = factors.reduce((a, f) => a + f.value, 0);
  const clamped = Math.max(-100, Math.min(100, sentiment));

  let label: PulseMetrics["label"];
  let color: string;
  if (clamped >= 40) { label = "BULLISH"; color = "text-primary"; }
  else if (clamped >= 15) { label = "CAUTIOUSLY_BULLISH"; color = "text-primary/80"; }
  else if (clamped >= -15) { label = "NEUTRAL"; color = "text-text-secondary"; }
  else if (clamped >= -40) { label = "CAUTIOUSLY_BEARISH"; color = "text-warning"; }
  else { label = "BEARISH"; color = "text-danger"; }

  const agentActivity = recent.length > 0
    ? `${actions} active deployment${actions !== 1 ? "s" : ""} in last ${recent.length} cycles`
    : "No recent agent activity";

  return { sentiment: clamped, label, color, factors, agentActivity };
}

export function MarketPulse({
  decisions,
  yields,
  bifrostYields,
  recentSwapCount,
}: MarketPulseProps) {
  const pulse = useMemo(
    () => computePulse(decisions, yields, bifrostYields, recentSwapCount),
    [decisions, yields, bifrostYields, recentSwapCount],
  );

  const SentimentIcon =
    pulse.sentiment >= 15 ? TrendingUp :
    pulse.sentiment <= -15 ? TrendingDown :
    Minus;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10">
            <Gauge className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Market Pulse
            </h3>
            <p className="font-mono text-[9px] text-text-muted">
              Aggregated market sentiment from AI analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SentimentIcon className={cn("h-5 w-5", pulse.color)} />
          <div className="text-right">
            <p className={cn("font-mono text-sm font-bold", pulse.color)}>
              {pulse.label.replace(/_/g, " ")}
            </p>
            <p className="font-mono text-[9px] text-text-muted">
              Score: {pulse.sentiment > 0 ? "+" : ""}{pulse.sentiment}
            </p>
          </div>
        </div>
      </div>

      {/* Sentiment Gauge */}
      <div className="px-4 py-3">
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-hover">
          {/* Gradient background */}
          <div className="absolute inset-0 flex">
            <div className="h-full flex-1 bg-danger/30" />
            <div className="h-full flex-1 bg-warning/30" />
            <div className="h-full flex-1 bg-primary/30" />
          </div>
          {/* Needle */}
          <div
            className="absolute top-0 h-full w-1 rounded-full bg-text-primary shadow-lg transition-all duration-500"
            style={{ left: `${((pulse.sentiment + 100) / 200) * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="font-mono text-[8px] text-danger">Bearish</span>
          <span className="font-mono text-[8px] text-text-muted">Neutral</span>
          <span className="font-mono text-[8px] text-primary">Bullish</span>
        </div>
      </div>

      {/* Factors */}
      <div className="border-t border-border divide-y divide-border-subtle">
        {pulse.factors.map((factor) => (
          <div key={factor.name} className="flex items-center gap-3 px-4 py-2">
            <div className="w-20 shrink-0">
              <span className="font-mono text-[10px] font-semibold text-text-secondary">
                {factor.name}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex h-1.5 items-center">
                <div className="h-full flex-1 overflow-hidden rounded-full bg-surface-hover">
                  {factor.value >= 0 ? (
                    <div className="ml-[50%] h-full rounded-r-full bg-primary" style={{ width: `${(factor.value / 100) * 50}%` }} />
                  ) : (
                    <div className="mr-[50%] ml-auto h-full rounded-l-full bg-danger" style={{ width: `${(Math.abs(factor.value) / 100) * 50}%` }} />
                  )}
                </div>
              </div>
            </div>
            <span className={cn("w-8 text-right font-mono text-[9px] font-bold", factor.value >= 0 ? "text-primary" : "text-danger")}>
              {factor.value > 0 ? "+" : ""}{factor.value}
            </span>
          </div>
        ))}
      </div>

      {/* Agent Activity Summary */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <Activity className="h-3 w-3 text-accent" />
        <p className="font-mono text-[9px] text-text-muted">{pulse.agentActivity}</p>
      </div>
    </div>
  );
}
