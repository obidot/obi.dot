"use client";

import { RefreshCw } from "lucide-react";
import { AgentStatus } from "@/components/agent/agent-status";
import { DecisionFeed } from "@/components/agent/decision-feed";
import { LiveEvents } from "@/components/agent/live-events";
import { PageHero } from "@/components/ui/page-hero";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useAgentLog } from "@/hooks/use-agent-log";

export default function AgentPage() {
  const {
    data: decisions,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useAgentLog();

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Agent"
        title="Autonomous Console"
        description="Live decisions, execution cycles, and operational events from the Obidot agent."
      />
      <AgentStatus
        decisionCount={decisions?.length ?? 0}
        decisions={decisions ?? []}
      />

      {isLoading ? (
        <PanelSkeleton rows={5} />
      ) : error ? (
        <div className="panel p-8 text-center">
          <p className="font-mono text-sm text-danger">
            Failed to load agent log
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <DecisionFeed
            decisions={decisions ?? []}
            refetch={refetch}
            isRefetching={isFetching}
          />
          <LiveEvents />
        </div>
      )}
    </div>
  );
}
