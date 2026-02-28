"use client";

import type { AgentDecision } from "@/types";
import { DecisionCard } from "@/components/agent/decision-card";
import { Terminal } from "lucide-react";

export function DecisionFeed({
  decisions,
}: {
  decisions: AgentDecision[];
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
        <span className="pill bg-surface-hover text-text-secondary text-[10px]">
          {decisions.length} entries
        </span>
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
