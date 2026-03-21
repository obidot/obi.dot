"use client";

import { RefreshCw, Terminal } from "lucide-react";
import { DecisionCard } from "@/components/agent/decision-card";
import { cn } from "@/lib/format";
import type { AgentDecision } from "@/types";

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function DecisionFeed({
  decisions,
  refetch = () => {},
  isRefetching = false,
}: {
  decisions: AgentDecision[];
  refetch?: () => void;
  isRefetching?: boolean;
}) {
  const latestDecision = decisions[0];

  if (decisions.length === 0) {
    return (
      <div className="panel retro-empty">
        <div className="text-center">
          <Terminal className="mx-auto h-7 w-7 text-text-muted" />
          <p className="mt-2 font-mono text-sm text-text-muted">
            No decisions yet
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Decisions will appear here as the agent runs its autonomous loop
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-secondary">
            <Terminal className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Execution Tape</span>
            <h3 className="panel-title">Decision Log</h3>
            <p className="panel-subtitle">
              Latest cycles first, with full reasoning and vault snapshot
              details on expansion.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">
            {latestDecision
              ? `Updated ${timeAgo(latestDecision.timestamp)}`
              : "No data yet"}
          </span>
          <span className="pill bg-surface-alt text-text-secondary text-[10px]">
            {decisions.length} entries
          </span>
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="btn-ghost min-h-0 px-3 py-2"
            aria-label="Refresh decisions"
          >
            <RefreshCw
              className={cn("h-3 w-3", isRefetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Decision list — terminal style */}
      <div className="divide-y-[3px] divide-border bg-border">
        {decisions.map((decision) => (
          <DecisionCard
            key={`${decision.cycle}-${decision.timestamp}`}
            decision={decision}
          />
        ))}
      </div>
    </div>
  );
}
