"use client";

import {
  Activity,
  ArrowRightLeft,
  ArrowUpFromLine,
  BarChart3,
  Compass,
  ExternalLink,
  Globe,
  Landmark,
  Loader2,
} from "lucide-react";
import { formatUnits } from "viem";
import type { ProtocolActivityData } from "@/hooks/use-protocol-activity";
import { CHAIN } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { IndexedSwapExecution } from "@/lib/graphql";

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
    <div className="metric-cell flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center border-[3px] border-border",
          color,
        )}
      >
        {icon}
      </div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value mt-3 text-[1.35rem]">{value}</p>
      </div>
    </div>
  );
}

function SwapFeedRow({ swap }: { swap: IndexedSwapExecution }) {
  const amtIn = (() => {
    try {
      return parseFloat(formatUnits(BigInt(swap.amountIn), 18)).toFixed(4);
    } catch {
      return "—";
    }
  })();
  const amtOut = (() => {
    try {
      return parseFloat(formatUnits(BigInt(swap.amountOut), 18)).toFixed(4);
    } catch {
      return "—";
    }
  })();
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

export function ProtocolActivity({
  data,
  isLoading,
  error,
  connected,
}: ProtocolActivityProps) {
  if (isLoading) {
    return (
      <div className="panel retro-empty min-h-[220px]">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="panel retro-empty">
        <p className="font-mono text-sm text-danger">
          Indexer unavailable — on-chain stats could not be loaded
        </p>
      </div>
    );
  }

  const { stats, recentSwaps, recentVolume } = data;

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-primary">
            <Activity className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Indexer Feed</span>
            <h3 className="panel-title">Protocol Activity</h3>
            <p className="panel-subtitle">
              On-chain volume, deposits, and recent swap executions streamed
              from `obi.index`.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "pill",
            connected
              ? "bg-accent text-accent-foreground"
              : "bg-surface-alt text-text-secondary",
          )}
        >
          {connected ? "Live" : "Updates paused"}
        </span>
      </div>

      <div className="metric-grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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

      {recentSwaps.length > 0 && (
        <div className="section-strip">
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
