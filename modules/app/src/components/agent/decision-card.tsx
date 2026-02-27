"use client";

import type { AgentDecision } from "@/types";
import { formatRelativeTime, cn } from "@/lib/format";
import {
  ArrowUpRight,
  PauseCircle,
  RefreshCcw,
  Droplets,
} from "lucide-react";

const ACTION_CONFIG: Record<
  string,
  { icon: typeof ArrowUpRight; color: string; label: string }
> = {
  REALLOCATE: {
    icon: ArrowUpRight,
    color: "text-primary bg-primary/10",
    label: "Reallocate",
  },
  BIFROST_STRATEGY: {
    icon: Droplets,
    color: "text-secondary bg-secondary/10",
    label: "Bifrost Strategy",
  },
  CROSS_CHAIN_REBALANCE: {
    icon: RefreshCcw,
    color: "text-accent bg-accent/10",
    label: "Rebalance",
  },
  NO_ACTION: {
    icon: PauseCircle,
    color: "text-text-muted bg-surface-hover",
    label: "No Action",
  },
};

export function DecisionCard({ decision }: { decision: AgentDecision }) {
  const config = ACTION_CONFIG[decision.action] ?? ACTION_CONFIG.NO_ACTION;
  const Icon = config.icon;

  return (
    <div className="card card-hover p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn("shrink-0 rounded-lg p-2", config.color)}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">
              {config.label}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              Cycle #{decision.cycleNumber}
            </span>
            <span className="ml-auto font-mono text-xs text-text-muted">
              {formatRelativeTime(decision.timestamp)}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            {decision.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}
