"use client";

import { VaultOverview } from "@/components/dashboard/vault-overview";
import { HealthIndicators } from "@/components/dashboard/health-indicators";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { VaultActions } from "@/components/dashboard/vault-actions";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { UserPosition } from "@/components/dashboard/user-position";
import { useQuery } from "@tanstack/react-query";
import {
  getIndexedDeposits,
  getIndexedSwapExecutions,
  type IndexedDeposit,
  type IndexedSwapExecution,
} from "@/lib/graphql";
import { formatUnits } from "viem";

/** Simple relative-time formatter — no external dependency needed */
function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Recent Activity feed ──────────────────────────────────────────────────

function RecentActivity() {
  const { data: deposits, isLoading: depositsLoading } = useQuery({
    queryKey: ["indexed", "recent-deposits"],
    queryFn: () => getIndexedDeposits(5),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: swaps, isLoading: swapsLoading } = useQuery({
    queryKey: ["indexed", "recent-swaps"],
    queryFn: () => getIndexedSwapExecutions(5),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const isLoading = depositsLoading || swapsLoading;
  const hasData =
    (deposits && deposits.length > 0) || (swaps && swaps.length > 0);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-muted mb-3">
          Recent Activity
        </h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 rounded bg-surface-hover animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) return null;

  // Merge and sort by timestamp descending
  type ActivityItem =
    | { kind: "deposit"; item: IndexedDeposit }
    | { kind: "swap"; item: IndexedSwapExecution };

  const activity: ActivityItem[] = [
    ...(deposits ?? []).map(
      (d): ActivityItem => ({ kind: "deposit", item: d }),
    ),
    ...(swaps ?? []).map((s): ActivityItem => ({ kind: "swap", item: s })),
  ].sort(
    (a, b) =>
      new Date(b.item.timestamp).getTime() -
      new Date(a.item.timestamp).getTime(),
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-muted mb-3">
        Recent Activity
      </h3>
      <div className="space-y-1">
        {activity.slice(0, 8).map((entry) => {
          if (entry.kind === "deposit") {
            const d = entry.item;
            const amt = parseFloat(formatUnits(BigInt(d.assets), 18)).toFixed(
              4,
            );
            const when = timeAgo(d.timestamp);
            return (
              <div
                key={`deposit-${d.id}`}
                className="flex items-center justify-between py-1 text-[12px]"
              >
                <span className="font-mono text-primary">+ {amt} tDOT</span>
                <span className="font-mono text-[10px] text-text-muted truncate max-w-[120px]">
                  {d.sender.slice(0, 6)}…{d.sender.slice(-4)}
                </span>
                <span className="text-[10px] text-text-muted">{when}</span>
              </div>
            );
          } else {
            const s = entry.item;
            const amtIn = parseFloat(
              formatUnits(BigInt(s.amountIn), 18),
            ).toFixed(4);
            const amtOut = parseFloat(
              formatUnits(BigInt(s.amountOut), 18),
            ).toFixed(4);
            const when = timeAgo(s.timestamp);
            return (
              <div
                key={`swap-${s.id}`}
                className="flex items-center justify-between py-1 text-[12px]"
              >
                <span className="font-mono text-accent">
                  {amtIn} → {amtOut}
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {s.poolType}
                </span>
                <span className="text-[10px] text-text-muted">{when}</span>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      {/* Hero banner with TVL */}
      <VaultOverview />

      {/* Trading terminal grid: chart left, actions right */}
      <div className="grid grid-cols-1 gap-[1px] overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-[1fr_300px]">
        {/* Left: Chart + stats */}
        <div className="flex flex-col bg-surface">
          {/* Quick stats row inside the chart panel */}
          <QuickStats />
          {/* Candlestick chart */}
          <PnlChart />
        </div>

        {/* Right: Trade form + position + health */}
        <div className="flex flex-col bg-surface">
          <VaultActions />
          <UserPosition />
          <div className="border-t border-border">
            <HealthIndicators />
          </div>
        </div>
      </div>

      {/* Recent on-chain activity from obi.index */}
      <RecentActivity />
    </div>
  );
}
