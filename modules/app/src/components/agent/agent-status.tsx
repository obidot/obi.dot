"use client";

import { Cpu, Zap, Radio, Clock } from "lucide-react";
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

export function AgentStatus({ decisionCount, decisions = [] }: AgentStatusProps) {
  const lastDecision = decisions.at(-1);
  const lastTimestamp = lastDecision?.timestamp ?? 0;
  const isActive = lastTimestamp > 0 && Date.now() - lastTimestamp < ACTIVE_THRESHOLD_MS;
  const statusLabel = decisionCount === 0 ? "Standby" : isActive ? "Running" : "Idle";
  const statusColor = isActive ? "text-primary" : decisionCount === 0 ? "text-text-muted" : "text-warning";
  const dotColor = isActive ? "bg-primary" : decisionCount === 0 ? "bg-text-muted" : "bg-warning";

  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
        {/* Status */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <div className="relative">
            <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
            {isActive && (
              <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-30" />
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Status
            </p>
            <p className={`font-mono text-sm font-semibold ${statusColor}`}>
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Decisions */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <Cpu className="h-4 w-4 text-text-muted" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Decisions
            </p>
            <p className="font-mono text-sm font-semibold text-text-primary">
              {decisionCount}
            </p>
          </div>
        </div>

        {/* Mode */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <Radio className="h-4 w-4 text-text-muted" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Mode
            </p>
            <p className="font-mono text-sm font-semibold text-accent">
              Autonomous
            </p>
          </div>
        </div>

        {/* Model */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <Zap className="h-4 w-4 text-text-muted" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Model
            </p>
            <p className="font-mono text-sm font-semibold text-text-primary">
              GPT-5-mini
            </p>
          </div>
        </div>

        {/* Last Cycle */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <Clock className="h-4 w-4 text-text-muted" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Last Cycle
            </p>
            <p className="font-mono text-sm font-semibold text-text-primary">
              {lastTimestamp > 0 ? timeAgo(lastTimestamp) : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
