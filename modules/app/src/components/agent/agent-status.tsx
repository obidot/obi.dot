"use client";

import { Activity, Cpu, Zap } from "lucide-react";

export function AgentStatus({ decisionCount }: { decisionCount: number }) {
  return (
    <div className="card flex items-center divide-x divide-border px-2">
      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <div className="relative">
          <div className="h-3 w-3 rounded-full bg-primary" />
          <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-30" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Status
          </p>
          <p className="font-mono text-sm font-semibold text-primary">
            Running
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <Cpu className="h-4 w-4 text-text-muted" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Decisions
          </p>
          <p className="font-mono text-sm font-semibold text-text-primary">
            {decisionCount}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <Activity className="h-4 w-4 text-text-muted" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Mode
          </p>
          <p className="font-mono text-sm font-semibold text-accent">
            Autonomous
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <Zap className="h-4 w-4 text-text-muted" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Model
          </p>
          <p className="font-mono text-sm font-semibold text-text-primary">
            GPT-4o
          </p>
        </div>
      </div>
    </div>
  );
}
