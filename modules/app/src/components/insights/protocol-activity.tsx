"use client";

import { formatUnits } from "viem";
import { cn } from "@/lib/format";
import type { ProtocolActivityData } from "@/hooks/use-protocol-activity";
import type { IndexedSwapExecution } from "@/lib/graphql";
import {
  ArrowRightLeft,
  Landmark,
  ArrowUpFromLine,
  Compass,
  Globe,
  BarChart3,
  Loader2,
  ExternalLink,
  Activity,
} from "lucide-react";
import { CHAIN } from "@/lib/constants";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 border border-border bg-surface p-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-md", color)}>
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
        <p className="font-mono text-lg font-bold text-text-primary">{value}</p>
      </div>
    </div>
  );
}

function SwapFeedRow({ swap }: { swap: IndexedSwapExecution }) {
  const amtIn = parseFloat(formatUnits(BigInt(swap.amountIn), 18)).toFixed(4);
  const amtOut = parseFloat(formatUnits(BigInt(swap.amountOut), 18)).toFixed(4);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <p className="font-mono text-sm text-text-primary">
          {amtIn} → {amtOut}
        </p>
        <p className="text-xs text-text-muted">
          {swap.poolType} · {timeAgo(swap.timestamp)}
        </p>
      </div>
      <a
        href={`${CHAIN.blockExplorer}/tx/${swap.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 font-mono text-xs text-text-muted hover:text-primary transition-colors shrink-0 ml-3"
      >
        {swap.txHash.slice(0, 6)}…{swap.txHash.slice(-4)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

interface ProtocolActivityProps {
  data: ProtocolActivityData | null;
  isLoading: boolean;
  error: Error | null;
  connected: boolean;
}

export function ProtocolActivity({ data, isLoading, error, connected }: ProtocolActivityProps) {
  if (isLoading) {
    return (
      <div className="panel rounded-lg flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel rounded-lg p-8 text-center">
        <p className="font-mono text-sm text-danger">
          Indexer unavailable — on-chain stats could not be loaded
        </p>
      </div>
    );
  }

  const { stats, recentSwaps, recentVolume } = data;

  return (
    <div className="panel overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Protocol Activity
            </h3>
            <p className="font-mono text-xs text-text-muted">
              On-chain stats from obi.index
            </p>
          </div>
        </div>
        {!connected && (
          <span className="font-mono text-xs text-text-muted animate-pulse">
            Live updates paused
          </span>
        )}
        {connected && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-xs text-text-muted">Live</span>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
          label="Total Swaps"
          value={stats.totalSwaps.toLocaleString()}
          color="bg-primary/10"
        />
        <StatCard
          icon={<Landmark className="h-4 w-4 text-accent" />}
          label="Total Deposits"
          value={stats.totalDeposits.toLocaleString()}
          color="bg-accent/10"
        />
        <StatCard
          icon={<ArrowUpFromLine className="h-4 w-4 text-secondary" />}
          label="Withdrawals"
          value={stats.totalWithdrawals.toLocaleString()}
          color="bg-secondary/10"
        />
        <StatCard
          icon={<Compass className="h-4 w-4 text-warning" />}
          label="Strategies"
          value={stats.totalStrategies.toLocaleString()}
          color="bg-warning/10"
        />
        <StatCard
          icon={<Globe className="h-4 w-4 text-accent" />}
          label="Cross-chain"
          value={stats.totalCrossChainMessages.toLocaleString()}
          color="bg-accent/10"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          label="Recent Volume"
          value={`${recentVolume} tDOT`}
          color="bg-primary/10"
        />
      </div>

      {/* Recent Activity Feed */}
      {recentSwaps.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-xs uppercase tracking-wider text-text-muted mb-2">
            Recent Swaps
          </p>
          {recentSwaps.slice(0, 5).map((s) => (
            <SwapFeedRow key={s.id} swap={s} />
          ))}
        </div>
      )}
    </div>
  );
}
