"use client";

import {
  AlertTriangle,
  Calculator,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn, formatApy } from "@/lib/format";
import { formatSimUsd, simulatePosition } from "@/lib/position-simulator";
import type { BifrostYield, ProtocolYield } from "@/types";

interface PositionSimulatorProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
}

type DurationPreset = { label: string; days: number };

const DURATION_PRESETS: DurationPreset[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y", days: 365 },
];

const AMOUNT_PRESETS = [100, 500, 1000, 5000, 10000];

export function PositionSimulatorPanel({
  yields,
  bifrostYields,
}: PositionSimulatorProps) {
  const protocolInputId = useId();
  const amountInputId = useId();
  const durationGroupId = useId();
  const allYields = useMemo(() => {
    const items: {
      yield_: ProtocolYield | BifrostYield;
      category?: "SLP" | "DEX" | "Farming" | "SALP";
    }[] = [];
    for (const y of yields) items.push({ yield_: y });
    for (const y of bifrostYields)
      items.push({ yield_: y, category: y.category });
    return items.sort((a, b) => b.yield_.apyPercent - a.yield_.apyPercent);
  }, [yields, bifrostYields]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [amount, setAmount] = useState(1000);
  const [durationDays, setDurationDays] = useState(90);

  const selected = allYields[selectedIdx];
  const sim = useMemo(() => {
    if (!selected) return null;
    return simulatePosition({
      amountUsd: amount,
      apyPercent: selected.yield_.apyPercent,
      durationDays,
      category: selected.category,
    });
  }, [selected, amount, durationDays]);

  if (!selected || !sim) {
    return (
      <div className="panel retro-empty min-h-[300px]">
        <p className="font-mono text-xs text-text-muted">
          No yield data available
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-accent">
            <Calculator className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Scenario Lab</span>
            <h3 className="panel-title">Position Simulator</h3>
            <p className="panel-subtitle">
              What-if return estimates with break-even timing, IL drag, and
              confidence bands.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-b-[3px] border-border p-4 md:grid-cols-3">
        <div>
          <label
            htmlFor={protocolInputId}
            className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted"
          >
            Protocol
          </label>
          <select
            id={protocolInputId}
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="input-trading w-full py-2 text-xs"
          >
            {allYields.map((item, idx) => (
              <option
                key={`${item.yield_.protocol}-${item.yield_.name}`}
                value={idx}
              >
                {item.yield_.name} ({formatApy(item.yield_.apyPercent)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={amountInputId}
            className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted"
          >
            Amount (USD)
          </label>
          <input
            id={amountInputId}
            type="number"
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="input-trading w-full py-2 text-xs"
            min={0}
            step={100}
          />
          <div className="mt-1.5 flex gap-1">
            {AMOUNT_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
                  amount === a
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                ${a >= 1000 ? `${a / 1000}K` : a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor={durationGroupId}
            className="mb-1.5 block text-xs uppercase tracking-wider text-text-muted"
          >
            Duration
          </label>
          <fieldset
            id={durationGroupId}
            className="flex gap-1"
            aria-label="Duration presets"
          >
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setDurationDays(preset.days)}
                className={cn(
                  "flex-1 rounded py-2 font-mono text-xs font-semibold transition-colors",
                  durationDays === preset.days
                    ? "bg-primary/10 text-primary"
                    : "bg-surface-hover text-text-muted hover:text-text-secondary",
                )}
              >
                {preset.label}
              </button>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="metric-grid grid-cols-2 md:grid-cols-4">
        <ResultCard
          icon={<DollarSign className="h-3.5 w-3.5 text-primary" />}
          label="Projected Return"
          value={formatSimUsd(sim.projectedReturnUsd)}
          valueColor="text-primary"
        />
        <ResultCard
          icon={<TrendingUp className="h-3.5 w-3.5 text-accent" />}
          label="Effective APY"
          value={`${sim.effectiveApy.toFixed(2)}%`}
          valueColor="text-accent"
          sub={`After ~$${(2 * 2.5).toFixed(0)} gas costs`}
        />
        <ResultCard
          icon={<Clock className="h-3.5 w-3.5 text-warning" />}
          label="Break-Even"
          value={`${sim.breakEvenDays} days`}
          valueColor="text-warning"
          sub="To cover gas costs"
        />
        <ResultCard
          icon={<AlertTriangle className="h-3.5 w-3.5 text-danger" />}
          label="Est. IL Risk"
          value={`${sim.estimatedIlPercent.toFixed(1)}%`}
          valueColor="text-danger"
          sub={`-${formatSimUsd(sim.projectedReturnUsd - sim.returnAfterIlUsd)}`}
        />
      </div>

      <div className="section-strip">
        <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">
          Confidence Intervals
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["low", "mid", "high"] as const).map((key) => {
            const proj = sim.confidence[key];
            const isActive = key === "mid";
            return (
              <div
                key={key}
                className={cn(
                  "border-[3px] p-3",
                  isActive
                    ? "border-primary/30 bg-primary/5"
                    : "border-border-subtle bg-background",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "font-mono text-xs font-bold uppercase",
                      key === "low"
                        ? "text-danger"
                        : key === "mid"
                          ? "text-primary"
                          : "text-accent",
                    )}
                  >
                    {proj.label}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {proj.apy.toFixed(1)}% APY
                  </span>
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-text-primary">
                  {formatSimUsd(proj.finalBalance)}
                </p>
                <p
                  className={cn(
                    "font-mono text-xs",
                    proj.totalReturn >= 0 ? "text-primary" : "text-danger",
                  )}
                >
                  {proj.totalReturn >= 0 ? "+" : ""}
                  {formatSimUsd(proj.totalReturn)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-strip">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-text-muted">
            <Calendar className="mr-1 inline h-3 w-3" />
            Growth Timeline
          </p>
          <p className="font-mono text-xs text-text-muted">
            Daily: {formatSimUsd(sim.dailyYieldUsd)} | Monthly:{" "}
            {formatSimUsd(sim.monthlyYieldUsd)}
          </p>
        </div>
        <div className="mt-2 flex h-[80px] items-end gap-px">
          {sim.timeline.map((point) => {
            const maxVal = sim.confidence.high.finalBalance;
            const minVal = amount * 0.95;
            const range = maxVal - minVal;
            const barH =
              range > 0 ? ((point.balanceMid - minVal) / range) * 100 : 50;

            return (
              <div
                key={point.day}
                className="group relative flex-1"
                style={{ minWidth: "2px" }}
              >
                <div
                  className="w-full rounded-t bg-primary/60 transition-all group-hover:bg-primary"
                  style={{ height: `${Math.max(2, barH)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap border-[3px] border-border bg-surface px-1.5 py-0.5 text-[11px] shadow group-hover:block">
                  Day {point.day}: {formatSimUsd(point.balanceMid)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
  sub?: string;
}) {
  return (
    <div className="metric-cell">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="metric-label">{label}</span>
      </div>
      <p className={cn("metric-value mt-3 text-[1.35rem]", valueColor)}>
        {value}
      </p>
      {sub && <p className="font-mono text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
