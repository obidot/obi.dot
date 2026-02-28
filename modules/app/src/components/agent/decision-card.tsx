"use client";

import type { AgentDecision } from "@/types";
import { formatRelativeTime, formatTokenAmount, cn } from "@/lib/format";
import {
  ArrowUpRight,
  PauseCircle,
  RefreshCcw,
  Droplets,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const ACTION_CONFIG: Record<
  string,
  { icon: typeof ArrowUpRight; color: string; pillClass: string; label: string }
> = {
  REALLOCATE: {
    icon: ArrowUpRight,
    color: "text-primary",
    pillClass: "bg-primary/10 text-primary",
    label: "Reallocate",
  },
  BIFROST_STRATEGY: {
    icon: Droplets,
    color: "text-secondary",
    pillClass: "bg-secondary/10 text-secondary",
    label: "Bifrost Strategy",
  },
  CROSS_CHAIN_REBALANCE: {
    icon: RefreshCcw,
    color: "text-accent",
    pillClass: "bg-accent/10 text-accent",
    label: "Rebalance",
  },
  NO_ACTION: {
    icon: PauseCircle,
    color: "text-text-muted",
    pillClass: "bg-surface-hover text-text-muted",
    label: "No Action",
  },
};

export function DecisionCard({ decision }: { decision: AgentDecision }) {
  const [expanded, setExpanded] = useState(false);
  const config = ACTION_CONFIG[decision.action] ?? ACTION_CONFIG.NO_ACTION;
  const Icon = config.icon;

  return (
    <div
      className="cursor-pointer px-4 py-3 transition-colors hover:bg-surface-hover"
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
    >
      <div className="flex items-center gap-3">
        {/* Cycle indicator */}
        <span className="font-mono text-[10px] text-text-muted w-12 shrink-0">
          #{decision.cycle}
        </span>

        {/* Action icon */}
        <div className={cn("shrink-0", config.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Action label */}
        <span className={cn("pill text-[10px]", config.pillClass)}>
          {config.label}
        </span>

        {/* Reasoning preview */}
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
          {decision.reasoning}
        </p>

        {/* Time */}
        <span className="shrink-0 font-mono text-[10px] text-text-muted">
          {formatRelativeTime(decision.timestamp)}
        </span>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-text-muted transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </div>

      {/* Expanded section */}
      <div
        className={cn(
          "mt-2 ml-12 overflow-hidden transition-all duration-200",
          expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {/* Full reasoning */}
        <div className="rounded-md border border-border-subtle bg-background p-3 mb-2">
          <p className="font-mono text-xs leading-relaxed text-text-secondary">
            {decision.reasoning}
          </p>
        </div>

        {/* Snapshot mini-stats (if available) */}
        {decision.snapshot && (
          <div className="grid grid-cols-2 gap-1.5">
            <SnapshotStat
              label="Total Assets"
              value={formatTokenAmount(decision.snapshot.totalAssets)}
              unit="tDOT"
            />
            <SnapshotStat
              label="Idle Balance"
              value={formatTokenAmount(decision.snapshot.idleBalance)}
              unit="tDOT"
            />
            <SnapshotStat
              label="Top APY"
              value={decision.snapshot.topYieldApy}
              unit="%"
            />
            <SnapshotStat
              label="Top Protocol"
              value={decision.snapshot.topYieldProtocol}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-background px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] font-semibold text-text-primary truncate">
        {value}
        {unit && <span className="ml-0.5 text-text-muted">{unit}</span>}
      </p>
    </div>
  );
}
