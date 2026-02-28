"use client";

import { Activity, Cpu, Zap, Radio } from "lucide-react";

export function AgentStatus({ decisionCount }: { decisionCount: number }) {
  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {/* Status */}
        <div className="flex items-center gap-3 bg-surface px-4 py-3">
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-30" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Status
            </p>
            <p className="font-mono text-sm font-semibold text-primary">
              Running
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
              GPT-4o
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
