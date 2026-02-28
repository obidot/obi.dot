"use client";

import { useState, useMemo } from "react";
import type { StrategyRecord } from "@/types";
import { formatUsd, truncateAddress, formatRelativeTime, cn } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/strategy-config";
import { StrategyDetail } from "@/components/strategies/strategy-detail";
import {
  ArrowUpDown,
  ExternalLink,
  Search,
} from "lucide-react";

type SortKey = "timestamp" | "amount" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "executed" | "pending" | "failed" | "timeout";

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "executed", label: "Executed" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "timeout", label: "Timeout" },
];

export function StrategyTable({ strategies }: { strategies: StrategyRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<StrategyRecord | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = strategies;
    if (filter !== "all") {
      result = result.filter((s) => s.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.action.toLowerCase().includes(q) ||
          s.target.toLowerCase().includes(q) ||
          s.reasoning.toLowerCase().includes(q),
      );
    }
    return result;
  }, [strategies, filter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "timestamp":
          return dir * (a.timestamp - b.timestamp);
        case "amount":
          return dir * Number(BigInt(a.amount) - BigInt(b.amount));
        case "status": {
          const order = { executed: 0, pending: 1, failed: 2, timeout: 3 };
          return dir * (order[a.status] - order[b.status]);
        }
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  if (strategies.length === 0) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center rounded-lg p-8">
        <div className="text-center">
          <p className="font-mono text-sm text-text-muted">No strategies yet</p>
          <p className="mt-1 text-xs text-text-muted">
            The AI agent will begin executing strategies once conditions are met
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="panel overflow-hidden rounded-lg">
        {/* Toolbar: Filter tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="tab-group">
            {FILTER_TABS.map((tab) => {
              const count =
                tab.key === "all"
                  ? strategies.length
                  : strategies.filter((s) => s.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn("tab-item", filter === tab.key && "active")}
                >
                  {tab.label}
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search strategies..."
              className="input-trading w-[220px] py-1.5 pl-9 pr-3 text-xs"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table-pro">
            <thead>
              <tr>
                <SortableHeader
                  label="Time"
                  sortKey="timestamp"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <th scope="col">Action</th>
                <th scope="col">Protocol</th>
                <SortableHeader
                  label="Amount"
                  sortKey="amount"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                />
                <th scope="col">Tx</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center font-mono text-xs text-text-muted">
                    No strategies match your filter
                  </td>
                </tr>
              ) : (
                sorted.map((strategy) => {
                  const status = STATUS_CONFIG[strategy.status];
                  const StatusIcon = status.icon;

                  return (
                    <tr
                      key={strategy.id}
                      onClick={() => setSelected(strategy)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(strategy);
                        }
                      }}
                      tabIndex={0}
                      className="cursor-pointer"
                      aria-label={`Strategy: ${strategy.action}, ${strategy.status}`}
                    >
                      <td className="text-text-secondary">
                        {formatRelativeTime(new Date(strategy.timestamp).toISOString())}
                      </td>
                      <td className="font-sans text-text-primary">
                        {strategy.action}
                      </td>
                      <td className="text-text-secondary">
                        {truncateAddress(strategy.target)}
                      </td>
                      <td className="text-text-primary">
                        {formatUsd(strategy.amount)}
                      </td>
                      <td>
                        <span
                          className={cn(
                            "pill",
                            status.className,
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {strategy.txHash ? (
                          <a
                            href={`https://blockscout-paseo.parity-chains.parity.io/tx/${strategy.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-accent hover:text-accent/80"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-text-muted">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2">
          <p className="font-mono text-[10px] text-text-muted">
            Showing {sorted.length} of {strategies.length} strategies
          </p>
        </div>
      </div>

      {/* Detail slide-over */}
      {selected && (
        <StrategyDetail
          strategy={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function SortableHeader({
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
  onSort: (key: SortKey) => void;
}) {
  return (
    <th scope="col">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-muted hover:text-text-secondary"
      >
        {label}
        <ArrowUpDown
          className={cn(
            "h-3 w-3",
            currentKey === sortKey ? "text-primary" : "text-text-muted",
          )}
        />
        {currentKey === sortKey && (
          <span className="text-[8px] text-primary">
            {dir === "asc" ? "ASC" : "DESC"}
          </span>
        )}
      </button>
    </th>
  );
}
