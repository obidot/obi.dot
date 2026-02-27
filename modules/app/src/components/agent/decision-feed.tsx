"use client";

import type { AgentDecision } from "@/types";
import { DecisionCard } from "@/components/agent/decision-card";

export function DecisionFeed({
  decisions,
}: {
  decisions: AgentDecision[];
}) {
  if (decisions.length === 0) {
    return (
      <div className="card flex min-h-[300px] items-center justify-center p-8">
        <div className="text-center">
          <p className="font-mono text-lg text-text-muted">
            No decisions yet
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Decisions will appear here as the agent runs its autonomous loop
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.map((decision) => (
        <DecisionCard key={decision.id} decision={decision} />
      ))}
    </div>
  );
}
