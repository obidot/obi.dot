"use client";

import { useAgentLog } from "@/hooks/use-agent-log";
import { DecisionFeed } from "@/components/agent/decision-feed";
import { AgentStatus } from "@/components/agent/agent-status";
import { Loader2 } from "lucide-react";

export default function AgentPage() {
  const { data: decisions, isLoading, error } = useAgentLog();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Agent Activity
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Live feed of autonomous agent decisions and reasoning
        </p>
      </div>

      <AgentStatus decisionCount={decisions?.length ?? 0} />

      {isLoading ? (
        <div className="card flex min-h-[400px] items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-danger">Failed to load agent log</p>
        </div>
      ) : (
        <DecisionFeed decisions={decisions ?? []} />
      )}
    </div>
  );
}
