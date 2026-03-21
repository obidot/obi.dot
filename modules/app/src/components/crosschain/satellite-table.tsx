"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Globe,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn, formatRelativeTime, formatUsd } from "@/lib/format";
import type { SatelliteChainState } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

type SortKey = "chainName" | "totalAssets" | "lastSyncTimestamp" | "status";
type SortDir = "asc" | "desc";

// ── Color palette ──────────────────────────────────────────────────────────

const CHAIN_COLORS = [
  { bg: "bg-accent/10", text: "text-accent", bar: "bg-accent" },
  { bg: "bg-secondary/10", text: "text-secondary", bar: "bg-secondary" },
  { bg: "bg-warning/10", text: "text-warning", bar: "bg-warning" },
  { bg: "bg-primary/10", text: "text-primary", bar: "bg-primary" },
] as const;

// ── Sync freshness sub-component ───────────────────────────────────────────

function SyncBadge({ timestamp }: { timestamp: number }) {
  const ageMins = (Date.now() - timestamp) / 60_000;

  let dotClass = "bg-primary";
  let textClass = "text-text-secondary";
  if (ageMins > 60) {
    dotClass = "bg-danger";
    textClass = "text-danger";
  } else if (ageMins > 15) {
    dotClass = "bg-warning";
    textClass = "text-warning";
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
      <span className={cn("font-mono text-xs", textClass)}>
        {formatRelativeTime(timestamp)}
      </span>
    </div>
  );
}

// ── Sortable header ────────────────────────────────────────────────────────

function SortableTh({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === currentKey;
  return (
    <th scope="col">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 transition-colors",
          "text-xs font-medium uppercase tracking-wider",
          active
            ? "text-text-secondary"
            : "text-text-muted hover:text-text-secondary",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-2.5 w-2.5 text-primary" />
          ) : (
            <ArrowDown className="h-2.5 w-2.5 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-35" />
        )}
      </button>
    </th>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function SatelliteTable({
  satellites,
  globalTotal,
}: {
  satellites: SatelliteChainState[];
  globalTotal: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("totalAssets");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const globalBigInt = useMemo(() => BigInt(globalTotal), [globalTotal]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d: SortDir) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    return [...satellites].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "chainName") {
        cmp = a.chainName.localeCompare(b.chainName);
      } else if (sortKey === "totalAssets") {
        const diff = BigInt(a.totalAssets) - BigInt(b.totalAssets);
        cmp = diff > 0n ? 1 : diff < 0n ? -1 : 0;
      } else if (sortKey === "lastSyncTimestamp") {
        cmp = a.lastSyncTimestamp - b.lastSyncTimestamp;
      } else if (sortKey === "status") {
        cmp = Number(a.emergencyMode) - Number(b.emergencyMode);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [satellites, sortKey, sortDir]);

  if (satellites.length === 0) {
    return (
      <div className="panel retro-empty">
        <div className="text-center">
          <Globe className="mx-auto mb-3 h-8 w-8 text-text-muted opacity-25" />
          <p className="font-mono text-xs text-text-muted">
            No satellite vaults connected
          </p>
          <p className="mt-1 text-[11px] text-text-muted opacity-60">
            Configure satellite chains in the vault contract
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-warning">
            <Globe className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Detailed View</span>
            <h3 className="panel-title">Satellite Vaults</h3>
            <p className="panel-subtitle">
              Sortable chain table for allocation, last sync freshness, and
              emergency flags.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-secondary/10 text-secondary text-[9px]">
            {satellites.length} {satellites.length === 1 ? "chain" : "chains"}
          </span>
          <span className="pill bg-surface-alt text-text-secondary text-[9px]">
            Click a column to sort
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr>
              <th scope="col" className="w-10 text-center text-text-muted">
                #
              </th>
              <SortableTh
                label="Chain"
                sortKey="chainName"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTh
                label="Assets"
                sortKey="totalAssets"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <th
                scope="col"
                className="text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                Allocation
              </th>
              <SortableTh
                label="Last Sync"
                sortKey="lastSyncTimestamp"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortableTh
                label="Status"
                sortKey="status"
                currentKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((sat, idx) => {
              const color = CHAIN_COLORS[idx % CHAIN_COLORS.length];
              const assets = BigInt(sat.totalAssets);
              const allocPct =
                globalBigInt > 0n
                  ? Number((assets * 10000n) / globalBigInt) / 100
                  : 0;

              return (
                <tr
                  key={sat.chainId}
                  className={cn(sat.emergencyMode && "bg-danger/[0.04]")}
                >
                  {/* Rank */}
                  <td className="w-10 text-center font-mono text-[11px] text-text-muted">
                    {idx + 1}
                  </td>

                  {/* Chain identity */}
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                          color.bg,
                        )}
                      >
                        <Globe className={cn("h-3 w-3", color.text)} />
                      </div>
                      <div>
                        <p className="font-sans text-[13px] font-semibold text-text-primary">
                          {sat.chainName}
                        </p>
                        <p className="font-mono text-[9px] text-text-muted">
                          Para #{sat.chainId}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Assets */}
                  <td>
                    <span className="stat-number text-[13px] text-text-primary">
                      {formatUsd(sat.totalAssets)}
                    </span>
                  </td>

                  {/* Allocation with inline bar */}
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-14 rounded-full bg-border">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            color.bar,
                          )}
                          style={{ width: `${Math.min(allocPct, 100)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[10px] font-medium",
                          color.text,
                        )}
                      >
                        {allocPct.toFixed(1)}%
                      </span>
                    </div>
                  </td>

                  {/* Last sync */}
                  <td>
                    <SyncBadge timestamp={sat.lastSyncTimestamp} />
                  </td>

                  {/* Status */}
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
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-strip">
        <p className="font-mono text-[10px] text-text-muted">
          {satellites.filter((s) => !s.emergencyMode).length} healthy ·{" "}
          {satellites.filter((s) => s.emergencyMode).length} emergency ·{" "}
          {satellites.length} total
        </p>
      </div>
    </div>
  );
}
