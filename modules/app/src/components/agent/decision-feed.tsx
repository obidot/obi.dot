"use client";

import type { AgentDecision } from "@/types";
import { DecisionCard } from "@/components/agent/decision-card";
import { Terminal, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";

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
  if (decisions.length === 0) {
    return (
      <div className="panel flex min-h-[300px] items-center justify-center rounded-lg p-8">
        <div className="text-center">
          <Terminal className="mx-auto h-6 w-6 text-text-muted" />
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
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-text-muted" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Decision Log
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">
            {decisions.length > 0
              ? `Updated ${timeAgo(decisions[decisions.length - 1].timestamp)}`
              : "No data yet"}
          </span>
          <span className="pill bg-surface-hover text-text-secondary text-[10px]">
            {decisions.length} entries
          </span>
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="btn-ghost p-1"
            aria-label="Refresh decisions"
          >
            <RefreshCw className={cn("h-3 w-3", isRefetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Decision list — terminal style */}
      <div className="divide-y divide-border-subtle">
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
