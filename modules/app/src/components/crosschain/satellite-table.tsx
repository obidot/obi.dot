"use client";

import type { SatelliteChainState } from "@/types";
import { formatUsd, formatRelativeTime, cn } from "@/lib/format";
import { ShieldAlert, CheckCircle2 } from "lucide-react";

export function SatelliteTable({
  satellites,
}: {
  satellites: SatelliteChainState[];
}) {
  if (satellites.length === 0) {
    return (
      <div className="card flex min-h-[200px] items-center justify-center p-8">
        <p className="font-mono text-sm text-text-muted">
          No satellite vaults connected
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Satellite Vaults
        </h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Chain
            </th>
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Assets
            </th>
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Last Sync
            </th>
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {satellites.map((sat) => (
            <tr
              key={sat.chainId}
              className="transition-colors hover:bg-surface-hover"
            >
              <td className="px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {sat.chainName}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
                    ID: {sat.chainId}
                  </p>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-sm text-text-primary">
                {formatUsd(sat.totalAssets)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                {formatRelativeTime(sat.lastSyncTimestamp)}
              </td>
              <td className="px-4 py-3">
                {sat.emergencyMode ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                    <ShieldAlert className="h-3 w-3" />
                    Emergency
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                    Healthy
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
