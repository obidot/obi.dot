"use client";

import { useState } from "react";
import type { StrategyRecord } from "@/types";
import { formatUsd, truncateAddress, formatRelativeTime, cn } from "@/lib/format";
import { StrategyDetail } from "@/components/strategies/strategy-detail";
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
} from "lucide-react";

type SortKey = "timestamp" | "amount" | "status";
type SortDir = "asc" | "desc";

const STATUS_CONFIG = {
  executed: { label: "Executed", icon: CheckCircle2, className: "bg-primary/10 text-primary" },
  pending: { label: "Pending", icon: Clock, className: "bg-warning/10 text-warning" },
  failed: { label: "Failed", icon: XCircle, className: "bg-danger/10 text-danger" },
} as const;

export function StrategyTable({ strategies }: { strategies: StrategyRecord[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<StrategyRecord | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...strategies].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "timestamp":
        return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case "amount":
        return dir * (Number(BigInt(a.amount) - BigInt(b.amount)));
      case "status": {
        const order = { executed: 0, pending: 1, failed: 2 };
        return dir * (order[a.status] - order[b.status]);
      }
      default:
        return 0;
    }
  });

  if (strategies.length === 0) {
    return (
      <div className="card flex min-h-[400px] items-center justify-center p-8">
        <div className="text-center">
          <p className="font-mono text-lg text-text-muted">No strategies yet</p>
          <p className="mt-2 text-sm text-text-muted">
            The AI agent will begin executing strategies once conditions are met
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <SortableHeader label="Time" sortKey="timestamp" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Action</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Protocol</th>
              <SortableHeader label="Amount" sortKey="amount" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Status" sortKey="status" currentKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((strategy) => {
              const status = STATUS_CONFIG[strategy.status];
              const StatusIcon = status.icon;

              return (
                <tr
                  key={strategy.id}
                  onClick={() => setSelected(strategy)}
                  className="cursor-pointer transition-colors hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {formatRelativeTime(strategy.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">
                    {strategy.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {truncateAddress(strategy.targetProtocol)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-primary">
                    {formatUsd(strategy.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
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
            })}
          </tbody>
        </table>
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
    <th className="px-4 py-3">
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
