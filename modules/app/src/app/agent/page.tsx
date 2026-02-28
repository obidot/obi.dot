"use client";

import { useAgentLog } from "@/hooks/use-agent-log";
import { DecisionFeed } from "@/components/agent/decision-feed";
import { AgentStatus } from "@/components/agent/agent-status";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Bot, Activity, Cpu, RefreshCw } from "lucide-react";

export default function AgentPage() {
  const { data: decisions, isLoading, error, refetch } = useAgentLog();

  const actionCounts = (decisions ?? []).reduce(
    (acc, d) => {
      acc[d.action] = (acc[d.action] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {/* Hero bar */}
      <div className="hero-banner px-6 py-5">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Autonomous Agent
            </p>
            <h1 className="mt-1 stat-number text-2xl text-text-primary">
              Agent Activity
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              Live feed of autonomous agent decisions and AI reasoning
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Decisions</p>
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-accent" />
                <span className="stat-number text-lg text-text-primary">
                  {decisions?.length ?? 0}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Actions Taken</p>
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="stat-number text-lg text-primary">
                  {Object.entries(actionCounts)
                    .filter(([k]) => k !== "NO_ACTION")
                    .reduce((sum, [, v]) => sum + v, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AgentStatus decisionCount={decisions?.length ?? 0} />

      {isLoading ? (
        <PanelSkeleton rows={5} />
      ) : error ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">Failed to load agent log</p>
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
        <DecisionFeed decisions={decisions ?? []} />
      )}
    </div>
  );
}
