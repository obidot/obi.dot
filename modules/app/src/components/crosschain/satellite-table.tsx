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
      <div className="panel flex min-h-[200px] items-center justify-center rounded-lg p-8">
        <p className="font-mono text-xs text-text-muted">
          No satellite vaults connected
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Satellite Vaults
          </h3>
          <span className="pill bg-secondary/10 text-secondary text-[10px]">
            {satellites.length} chains
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Assets</th>
              <th>Last Sync</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {satellites.map((sat) => (
              <tr key={sat.chainId}>
                <td>
                  <div>
                    <p className="font-sans text-sm font-medium text-text-primary">
                      {sat.chainName}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      ID: {sat.chainId}
                    </p>
                  </div>
                </td>
                <td className="text-text-primary">
                  {formatUsd(sat.totalAssets)}
                </td>
                <td className="text-text-secondary">
                  {formatRelativeTime(sat.lastSyncTimestamp)}
                </td>
                <td>
                  {sat.emergencyMode ? (
                    <span className="pill bg-danger/10 text-danger text-[10px]">
                      <ShieldAlert className="h-3 w-3" />
                      Emergency
                    </span>
                  ) : (
                    <span className="pill bg-primary/10 text-primary text-[10px]">
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
    </div>
  );
}
