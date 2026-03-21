"use client";

import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Droplets,
  PauseCircle,
  RefreshCcw,
} from "lucide-react";
import { useId, useState } from "react";
import { cn, formatRelativeTime, formatTokenAmount } from "@/lib/format";
import type { AgentDecision } from "@/types";

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
  LOCAL_SWAP: {
    icon: ArrowLeftRight,
    color: "text-accent",
    pillClass: "bg-accent/10 text-accent",
    label: "Local Swap",
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
  const detailsId = useId();
  const config = ACTION_CONFIG[decision.action] ?? ACTION_CONFIG.NO_ACTION;
  const Icon = config.icon;

  return (
    <div className="bg-surface">
      <button
        type="button"
        className="w-full px-4 py-4 text-left transition-colors hover:bg-surface-hover"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
          <span className="w-14 shrink-0 font-mono text-[10px] text-text-muted">
            #{decision.cycle}
          </span>

          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center border-2 border-border bg-surface-alt",
              config.color,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>

          <span className={cn("pill text-[10px]", config.pillClass)}>
            {config.label}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-text-secondary">
              {decision.reasoning}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Snapshot {decision.snapshot ? "attached" : "not available"}
            </p>
          </div>

          <span className="shrink-0 font-mono text-[10px] text-text-muted">
            {formatRelativeTime(decision.timestamp)}
          </span>

          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-text-muted transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        </div>
      </button>

      <div
        id={detailsId}
        className={cn(
          "overflow-hidden transition-all duration-200",
          expanded ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="border-t-[3px] border-border bg-surface-alt px-4 py-4">
          <div className="border-[3px] border-border bg-background p-3">
            <p className="font-mono text-xs leading-relaxed text-text-secondary">
              {decision.reasoning}
            </p>
          </div>

          {decision.snapshot && (
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
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
    <div className="border-[3px] border-border bg-background px-3 py-2.5">
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
