"use client";

import { Clock, Cpu, Radio, Workflow } from "lucide-react";
import type { AgentDecision } from "@/types";

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// Agent is considered "Running" if its last decision was within this window
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes

interface AgentStatusProps {
  decisionCount: number;
  decisions?: AgentDecision[];
}

export function AgentStatus({
  decisionCount,
  decisions = [],
}: AgentStatusProps) {
  const lastDecision = decisions[0];
  const lastTimestamp = lastDecision?.timestamp ?? 0;
  const isActive =
    lastTimestamp > 0 && Date.now() - lastTimestamp < ACTIVE_THRESHOLD_MS;
  const statusLabel =
    decisionCount === 0 ? "Standby" : isActive ? "Running" : "Idle";
  const statusColor = isActive
    ? "text-primary"
    : decisionCount === 0
      ? "text-text-muted"
      : "text-warning";
  const dotColor = isActive
    ? "bg-primary"
    : decisionCount === 0
      ? "bg-text-muted"
      : "bg-warning";
  const latestAction =
    lastDecision?.action.replaceAll("_", " ").toLowerCase() ?? "waiting";

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-accent">
            <Cpu className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Agent Core</span>
            <h3 className="panel-title">Execution Status</h3>
            <p className="panel-subtitle">
              Heartbeat, cycle activity, and the latest action emitted by the
              autonomous loop.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-surface-alt text-text-secondary">
            {decisionCount} cycles logged
          </span>
          <span
            className={`pill ${isActive ? "bg-accent text-accent-foreground" : "bg-surface-alt text-text-secondary"}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="metric-grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        <div className="metric-cell flex items-start justify-between gap-4">
          <div>
            <p className="metric-label">Status</p>
            <p className={`metric-value mt-3 ${statusColor}`}>{statusLabel}</p>
            <p className="metric-note mt-2">
              Agent considered live if a cycle ran in the last 5 minutes.
            </p>
          </div>
          <div className="relative mt-1">
            <span className={`block h-3 w-3 rounded-full ${dotColor}`} />
            {isActive && (
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-35" />
            )}
          </div>
        </div>

        <div className="metric-cell">
          <Cpu className="h-4 w-4 text-text-muted" />
          <p className="metric-label mt-4">Cycles Logged</p>
          <p className="metric-value mt-3">{decisionCount}</p>
          <p className="metric-note mt-2">
            Rolling decisions returned from the agent API.
          </p>
        </div>

        <div className="metric-cell">
          <Radio className="h-4 w-4 text-text-muted" />
          <p className="metric-label mt-4">Mode</p>
          <p className="metric-value mt-3 text-accent">Autonomous</p>
          <p className="metric-note mt-2">
            Continuous execution loop with periodic refresh.
          </p>
        </div>

        <div className="metric-cell">
          <Workflow className="h-4 w-4 text-text-muted" />
          <p className="metric-label mt-4">Latest Action</p>
          <p className="metric-value mt-3 text-secondary">{latestAction}</p>
          <p className="metric-note mt-2">
            {lastDecision
              ? `Cycle #${lastDecision.cycle}`
              : "No actions recorded yet."}
          </p>
        </div>

        <div className="metric-cell">
          <Clock className="h-4 w-4 text-text-muted" />
          <p className="metric-label mt-4">Last Cycle</p>
          <p className="metric-value mt-3">
            {lastTimestamp > 0 ? timeAgo(lastTimestamp) : "—"}
          </p>
          <p className="metric-note mt-2">
            {lastTimestamp > 0
              ? `Latest timestamp ${new Date(lastTimestamp).toLocaleTimeString()}`
              : "Waiting for first cycle."}
          </p>
        </div>
      </div>
    </div>
  );
}
