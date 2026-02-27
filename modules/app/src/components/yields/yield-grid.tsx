"use client";

import type { ProtocolYield, BifrostYield } from "@/types";
import { ProtocolCard } from "@/components/yields/protocol-card";

interface YieldGridProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
}

export function YieldGrid({ yields, bifrostYields }: YieldGridProps) {
  if (yields.length === 0 && bifrostYields.length === 0) {
    return (
      <div className="card flex min-h-[400px] items-center justify-center p-8">
        <div className="text-center">
          <p className="font-mono text-lg text-text-muted">
            No yield data available
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Yield sources will appear once the agent fetches data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Bifrost Section */}
      {bifrostYields.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-secondary" />
            <h2 className="text-lg font-semibold text-text-primary">
              Bifrost Yields
            </h2>
            <span className="rounded-full bg-secondary/10 px-2 py-0.5 font-mono text-[10px] text-secondary">
              {bifrostYields.length} sources
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {bifrostYields.map((y) => (
              <ProtocolCard
                key={`${y.protocol}-${y.category}`}
                yield_={y}
                isBifrost
                category={y.category}
              />
            ))}
          </div>
        </div>
      )}

      {/* General Yields */}
      {yields.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <h2 className="text-lg font-semibold text-text-primary">
              All Protocols
            </h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
              {yields.length} sources
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {yields.map((y) => (
              <ProtocolCard
                key={`${y.protocol}-${y.name}`}
                yield_={y}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
