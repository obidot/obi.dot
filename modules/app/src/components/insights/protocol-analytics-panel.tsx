"use client";

import {
  ArrowRightLeft,
  Coins,
  DollarSign,
  Loader2,
  Network,
  Route,
  Users,
} from "lucide-react";
import { useProtocolAnalytics } from "@/hooks/use-protocol-analytics";
import { cn, formatRelativeTime } from "@/lib/format";

function usd(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function integer(value: number) {
  return value.toLocaleString();
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="metric-cell flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center border-[3px] border-border",
          tone,
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

export function ProtocolAnalyticsPanel() {
  const { data, isLoading, error, isFetching } = useProtocolAnalytics();

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
          Indexed analytics are unavailable right now.
        </p>
      </div>
    );
  }

  const { stats, topRoutes } = data;

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-warning">
            <Route className="h-4 w-4 text-foreground" />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Aggregate Analytics</span>
            <h3 className="panel-title">Protocol Overview</h3>
            <p className="panel-subtitle">
              Estimated traction metrics and the most-used indexed routes,
              derived from live swap history in `obi.index`.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "pill",
            isFetching
              ? "bg-warning/10 text-warning"
              : "bg-accent text-accent-foreground",
          )}
        >
          {isFetching ? "Refreshing" : "Live"}
        </span>
      </div>

      <div className="metric-grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="24h Volume"
          value={usd(stats.volume24h)}
          tone="bg-primary/10"
        />
        <StatCard
          icon={<Coins className="h-4 w-4 text-warning" />}
          label="Est. Fees"
          value={usd(stats.feeRevenue24h)}
          tone="bg-warning/10"
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-accent" />}
          label="Unique Traders"
          value={integer(stats.uniqueTraders7d)}
          tone="bg-accent/10"
        />
        <StatCard
          icon={<Network className="h-4 w-4 text-secondary" />}
          label="Est. TVL"
          value={usd(stats.tvl)}
          tone="bg-secondary/10"
        />
        <StatCard
          icon={<ArrowRightLeft className="h-4 w-4 text-primary" />}
          label="Total Swaps"
          value={integer(stats.totalSwaps)}
          tone="bg-primary/10"
        />
        <StatCard
          icon={<Route className="h-4 w-4 text-accent" />}
          label="Active Adapters"
          value={integer(stats.activeAdapters)}
          tone="bg-accent/10"
        />
      </div>

      <div className="section-strip">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-muted">
              Top Routes
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Ranked by indexed usage, with USD estimates when pricing coverage
              exists.
            </p>
          </div>
          <div className="rounded-full border border-border-subtle bg-background px-3 py-1 font-mono text-[11px] text-text-muted">
            Priced swaps (24h): {integer(stats.pricedSwapCoverage24h)}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border-subtle">
          <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-3 border-b border-border-subtle bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            <span>Route</span>
            <span>Volume</span>
            <span>Last seen</span>
          </div>
          {topRoutes.map((route) => (
            <div
              key={route.routeKey}
              className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-3 border-b border-border-subtle px-3 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-text-primary">
                  {route.tokenInSymbol} → {route.tokenOutSymbol}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {route.poolType} · {route.swapCount} swaps · {route.hops} hop
                  {route.hops === 1 ? "" : "s"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm text-text-primary">
                  {route.priced ? usd(route.estimatedVolumeUsd) : "Unpriced"}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {route.amountInTotal} in · {route.amountOutTotal} out
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm text-text-primary">
                  {formatRelativeTime(route.lastSwapAt)}
                </p>
                <p className="mt-1 text-xs text-text-muted">indexed route</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-text-muted">{stats.estimationNote}</p>
      </div>
    </div>
  );
}
