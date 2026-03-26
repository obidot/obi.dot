"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { formatUnits } from "viem";
import { HealthIndicators } from "@/components/dashboard/health-indicators";
import { PnlChart } from "@/components/dashboard/pnl-chart";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { VaultOverview } from "@/components/dashboard/vault-overview";
import { YieldGrid } from "@/components/yields/yield-grid";
import {
  useBifrostYields,
  useUniswapV2Yields,
  useYields,
} from "@/hooks/use-yields";
import {
  getIndexedDeposits,
  getIndexedSwapExecutions,
  type IndexedDeposit,
  type IndexedSwapExecution,
} from "@/lib/graphql";
import type { LiquidityPairMeta } from "@/types";

const VaultActions = dynamic(
  () =>
    import("@/components/dashboard/vault-actions").then(
      (mod) => mod.VaultActions,
    ),
  { ssr: false },
);

const UserPosition = dynamic(
  () =>
    import("@/components/dashboard/user-position").then(
      (mod) => mod.UserPosition,
    ),
  { ssr: false },
);

const LiquidityPanel = dynamic(
  () =>
    import("@/components/liquidity/liquidity-panel").then(
      (mod) => mod.LiquidityPanel,
    ),
  { ssr: false },
);

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
      <div className="panel p-4">
        <h3 className="retro-label mb-3 text-[0.85rem] text-text-muted">
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
    <div className="panel p-4">
      <h3 className="retro-label mb-3 text-[0.85rem] text-text-muted">
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
                className="flex items-center justify-between border-b border-dashed border-border-subtle py-2 text-[12px] last:border-b-0"
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
                className="flex items-center justify-between border-b border-dashed border-border-subtle py-2 text-[12px] last:border-b-0"
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

// ── Yields Page ─────────────────────────────────────────────────────────────

export default function YieldsPage() {
  const {
    data: yields,
    isLoading: yLoading,
    error: yError,
    refetch: yRefetch,
  } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();
  const { data: uniswap, isLoading: uLoading } = useUniswapV2Yields();

  const isLoading = yLoading || bLoading || uLoading;

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [earnHint, setEarnHint] = useState<{
    name: string;
    apy: number;
  } | null>(null);
  const [selectedLpPair, setSelectedLpPair] =
    useState<LiquidityPairMeta | null>(null);

  function handleEarn(name: string, apy: number, pairMeta?: LiquidityPairMeta) {
    if (pairMeta) {
      setSelectedLpPair(pairMeta);
    } else {
      setSelectedLpPair(null);
      setEarnHint({ name, apy });
      sidebarRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Vault hero banner */}
      <VaultOverview />

      {/* Main grid: chart + yield table left, vault actions right */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] fade-up fade-up-1">
        {/* Left column */}
        <div className="space-y-6">
          <div className="panel overflow-hidden">
            <div className="flex flex-col bg-surface">
              <QuickStats />
              <PnlChart />
            </div>
          </div>

          {isLoading ? (
            <div className="panel p-8">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded bg-surface-hover animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : yError ? (
            <div className="panel p-8 text-center">
              <p className="font-mono text-sm text-danger">
                Failed to load yields
              </p>
              <button
                type="button"
                onClick={() => yRefetch()}
                className="btn-ghost mx-auto mt-4 inline-flex w-auto items-center gap-2 px-4 py-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <YieldGrid
              yields={yields ?? []}
              bifrostYields={bifrost ?? []}
              uniswapV2Yields={uniswap ?? []}
              onEarn={handleEarn}
            />
          )}
        </div>

        {/* Right sidebar */}
        <div
          ref={sidebarRef}
          className="panel flex flex-col overflow-hidden self-start"
        >
          {earnHint && (
            <div className="flex items-start justify-between gap-2 border-b-[3px] border-border bg-primary/10 px-4 py-3">
              <div>
                <p className="retro-label mb-0.5 text-[0.85rem] text-primary">
                  Earn with {earnHint.name}
                </p>
                <p className="text-[11px] text-text-secondary">
                  Deposit tDOT below — the agent allocates toward{" "}
                  <span className="text-primary font-semibold">
                    {earnHint.apy.toFixed(1)}% APY
                  </span>{" "}
                  protocols automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEarnHint(null)}
                aria-label="Dismiss"
                className="mt-0.5 shrink-0 border-2 border-border bg-surface px-2 py-0.5 text-text-muted shadow-[2px_2px_0_0_var(--border)] hover:text-text-primary"
              >
                ✕
              </button>
            </div>
          )}
          <div className="bg-surface">
            <VaultActions />
          </div>
          <div className="bg-surface">
            <UserPosition />
          </div>
          <div className="border-t-[3px] border-border bg-surface">
            <HealthIndicators />
          </div>
        </div>
      </div>

      {/* Recent on-chain activity */}
      <RecentActivity />

      <LiquidityPanel
        pair={selectedLpPair}
        open={!!selectedLpPair}
        onClose={() => setSelectedLpPair(null)}
      />
    </div>
  );
}
