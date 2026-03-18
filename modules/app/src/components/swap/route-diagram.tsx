"use client";

import { useState } from "react";
import { cn, formatTokenAmount } from "@/lib/format";
import { useRouteFinder, useAllQuotes } from "@/hooks/use-swap";
import type { SwapRouteResult, RouteHop, SplitRouteSelection, SwapQuoteResult } from "@/types";
import { POOL_TYPE_LABELS, PoolType } from "@/types";
import { Loader2, Network, SplitSquareHorizontal } from "lucide-react";
import { formatUnits } from "viem";

// ── Token color map ────────────────────────────────────────────────────────

const TOKEN_COLORS: Record<string, { circle: string; text: string }> = {
  tDOT: { circle: "bg-primary/20 border-primary/30", text: "text-primary" },
  DOT: { circle: "bg-primary/10 border-primary/20", text: "text-primary/60" },
  tUSDC: { circle: "bg-accent/20 border-accent/30", text: "text-accent" },
  USDC: { circle: "bg-accent/20 border-accent/30", text: "text-accent" },
  tETH: { circle: "bg-secondary/20 border-secondary/30", text: "text-secondary" },
};

function tokenColor(symbol: string) {
  return TOKEN_COLORS[symbol] ?? { circle: "bg-surface-hover border-border", text: "text-text-secondary" };
}

// ── Status / route-type badges ─────────────────────────────────────────────

function StatusBadge({ status }: { status: SwapRouteResult["status"] }) {
  const styles: Record<SwapRouteResult["status"], string> = {
    live: "bg-primary/10 text-primary border-primary/20",
    mainnet_only: "bg-warning/10 text-warning border-warning/20",
    coming_soon: "bg-surface-hover text-text-muted border-border",
  };
  const labels: Record<SwapRouteResult["status"], string> = {
    live: "LIVE",
    mainnet_only: "MAINNET ONLY",
    coming_soon: "COMING SOON",
  };
  return (
    <span className={cn("font-mono text-[11px] border px-1.5 py-0.5 tracking-wide", styles[status])}>
      {labels[status]}
    </span>
  );
}

function RouteTypeBadge({ routeType }: { routeType: SwapRouteResult["routeType"] }) {
  const styles: Record<SwapRouteResult["routeType"], string> = {
    local: "bg-accent/10 text-accent border-accent/20",
    xcm: "bg-primary/10 text-primary border-primary/20",
    bridge: "bg-warning/10 text-warning border-warning/20",
  };
  const labels: Record<SwapRouteResult["routeType"], string> = { local: "V2", xcm: "XCM", bridge: "BRIDGE" };
  return (
    <span className={cn("font-mono text-[11px] border px-1.5 py-0.5 tracking-wide", styles[routeType])}>
      {labels[routeType]}
    </span>
  );
}

// ── Token node ────────────────────────────────────────────────────────────

function TokenNode({ symbol, amount, decimals = 18 }: { symbol: string; amount?: string; decimals?: number }) {
  const c = tokenColor(symbol);
  const displayAmount = amount ? formatTokenAmount(amount, decimals, 4) : null;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full border text-[13px] font-bold", c.circle, c.text)}>
        {symbol.slice(0, 2)}
      </span>
      <span className={cn("font-mono text-[12px] font-semibold", c.text)}>{symbol}</span>
      {displayAmount && <span className="font-mono text-[11px] text-text-muted">{displayAmount}</span>}
    </div>
  );
}

// ── Hop flow ──────────────────────────────────────────────────────────────

function HopFlow({ hops, animated = false }: { hops: RouteHop[]; animated?: boolean }) {
  const connectorStyle = animated
    ? {
        backgroundImage:
          "repeating-linear-gradient(90deg, var(--color-primary) 0, var(--color-primary) 6px, transparent 6px, transparent 10px)",
        backgroundSize: "20px 100%",
        animation: "route-dash-bg 0.6s linear infinite",
      }
    : undefined;

  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto pb-1 min-h-[64px]">
      {hops.map((hop, i) => (
        <div key={i} className="flex items-center gap-0 flex-1 min-w-0">
          {i === 0 && (
            <>
              <TokenNode symbol={hop.tokenInSymbol} amount={hop.amountIn} />
              <div
                className={cn(
                  "flex-1 self-center mx-1 min-w-[20px] h-px",
                  animated ? "opacity-70" : "bg-border",
                )}
                style={connectorStyle}
              />
            </>
          )}
          <div className="flex flex-col items-center shrink-0 mx-1">
            <div
              className={cn(
                "border px-2.5 py-1.5 text-center transition-colors",
                animated ? "bg-primary/5 border-primary/20" : "bg-surface-hover border-border",
              )}
            >
              <p
                className={cn(
                  "font-mono text-[12px] font-medium whitespace-nowrap",
                  animated ? "text-primary" : "text-text-secondary",
                )}
              >
                {hop.poolLabel}
              </p>
              <p className="font-mono text-[11px] text-text-muted">
                {(Number(hop.feeBps) / 100).toFixed(2)}%
              </p>
            </div>
          </div>
          <div
            className={cn(
              "flex-1 self-center mx-1 min-w-[20px] h-px",
              animated ? "opacity-70" : "bg-border",
            )}
            style={connectorStyle}
          />
          <TokenNode symbol={hop.tokenOutSymbol} amount={hop.amountOut} />
        </div>
      ))}
    </div>
  );
}

// ── All-Quotes comparison table ───────────────────────────────────────────

interface AllQuotesTableProps {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  tokenOutDecimals?: number;
  tokenOutSymbol?: string;
}

function AllQuotesTable({ tokenIn, tokenOut, amountIn, tokenOutDecimals = 18, tokenOutSymbol = "?" }: AllQuotesTableProps) {
  const { data: quotes, isLoading } = useAllQuotes({ tokenIn, tokenOut, amountIn });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-1">
        {[0, 1, 2].map((i) => <div key={i} className="h-7 bg-surface-hover border border-border" />)}
      </div>
    );
  }

  if (!quotes || quotes.length === 0) return null;

  const bestOut = quotes.reduce((best, q) => {
    const out = BigInt(q.amountOut);
    return out > best ? out : best;
  }, 0n);

  return (
    <div className="space-y-1">
      <p className="text-[13px] text-text-muted uppercase tracking-wider">Adapter quotes</p>
      <div className="border border-border divide-y divide-border">
        {quotes.map((q) => {
          const out = BigInt(q.amountOut);
          const isBest = out === bestOut;
          const savingsBps = bestOut > 0n ? Number(((bestOut - out) * 10000n) / bestOut) : 0;
          const displayOut = formatUnits(out, tokenOutDecimals);
          const label = POOL_TYPE_LABELS[q.source as PoolType] ?? `Pool ${q.source}`;

          return (
            <div key={`${q.source}-${q.pool}`} className={cn("flex items-center justify-between px-3 py-2", isBest && "bg-primary/5")}>
              <div className="flex items-center gap-2 min-w-0">
                {isBest && (
                  <span className="font-mono text-[10px] text-primary border border-primary/30 bg-primary/10 px-1 py-0.5 shrink-0">
                    BEST
                  </span>
                )}
                <span className="text-[13px] text-text-secondary font-medium truncate">{label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-[13px] text-text-primary">
                  {Number(displayOut).toFixed(6)} {tokenOutSymbol}
                </span>
                {!isBest && savingsBps > 0 && (
                  <span className="font-mono text-[11px] text-danger">-{(savingsBps / 100).toFixed(2)}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Fill probability helpers ──────────────────────────────────────────────

/** Estimate fill probability 0–100 from route metadata */
function fillProbability(route: SwapRouteResult): number {
  if (route.status !== "live") return 0;
  const impact = Number(route.totalPriceImpactBps);
  if (impact < 30) return 97;
  if (impact < 100) return 90;
  if (impact < 200) return 78;
  if (impact < 500) return 55;
  return 30;
}

function FillBadge({ prob }: { prob: number }) {
  const color =
    prob >= 90
      ? "text-bull border-bull/30 bg-bull/5"
      : prob >= 70
        ? "text-warning border-warning/30 bg-warning/5"
        : "text-danger border-danger/30 bg-danger/5";
  return (
    <span className={cn("font-mono text-[11px] border px-1.5 py-0.5", color)}>
      {prob}% FILL
    </span>
  );
}

// ── Local route card ──────────────────────────────────────────────────────

interface LocalRouteCardProps {
  route: SwapRouteResult;
  rank: number;
  selected?: boolean;
  splitSelected?: boolean;
  splitWeight?: number;
  splitMode?: boolean;
  onSelect?: (route: SwapRouteResult) => void;
  onSplitToggle?: (route: SwapRouteResult) => void;
  onWeightChange?: (route: SwapRouteResult, weight: number) => void;
}

function LocalRouteCard({
  route, rank, selected, splitSelected, splitWeight, splitMode,
  onSelect, onSplitToggle, onWeightChange,
}: LocalRouteCardProps) {
  const amountOutDisplay = formatTokenAmount(route.amountOut, 18, 6);
  const impactBps = Number(route.totalPriceImpactBps);
  const impactPct = (impactBps / 100).toFixed(2);
  const feePct = (Number(route.totalFeeBps) / 100).toFixed(2);
  const isBest = rank === 0;

  return (
    <div
      role={!splitMode && onSelect ? "button" : undefined}
      tabIndex={!splitMode && onSelect ? 0 : undefined}
      onClick={() => !splitMode && onSelect?.(route)}
      onKeyDown={(e) => !splitMode && e.key === "Enter" && onSelect?.(route)}
      className={cn(
        "border p-4 transition-colors",
        !splitMode && onSelect && "cursor-pointer",
        splitSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : selected
            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
            : isBest
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-background/40",
        !splitMode && !selected && !splitSelected && onSelect && "hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Split checkbox */}
          {splitMode && (
            <button
              type="button"
              onClick={() => onSplitToggle?.(route)}
              className={cn(
                "w-4 h-4 border flex items-center justify-center shrink-0 transition-colors",
                splitSelected ? "border-primary bg-primary/20" : "border-border hover:border-primary/50",
              )}
            >
              {splitSelected && <span className="text-primary text-[10px] font-bold">✓</span>}
            </button>
          )}
          <RouteTypeBadge routeType={route.routeType} />
          <StatusBadge status={route.status} />
          {isBest && (
            <span className="font-mono text-[11px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5">
              BEST
            </span>
          )}
          {isBest && <FillBadge prob={fillProbability(route)} />}
          {selected && !splitMode && (
            <span className="font-mono text-[11px] text-primary border border-primary bg-primary/20 px-1.5 py-0.5">
              SELECTED
            </span>
          )}
          {splitSelected && (
            <span className="font-mono text-[11px] text-primary border border-primary bg-primary/20 px-1.5 py-0.5">
              SPLIT
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="font-mono text-[14px] text-text-primary font-bold">{amountOutDisplay}</span>
        </div>
      </div>

      {/* Hop flow */}
      <HopFlow hops={route.hops} animated={selected || splitSelected} />

      {/* Split weight slider — only shown when this route is selected in split mode */}
      {splitSelected && splitWeight !== undefined && onWeightChange && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-text-muted">Split weight</span>
            <span className="font-mono text-[12px] text-primary font-semibold">{(splitWeight / 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={1000}
            max={9000}
            step={500}
            value={splitWeight}
            onChange={(e) => onWeightChange(route, Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/50">
        <span className="text-[12px] text-text-muted">
          Fee <span className="font-mono text-text-secondary font-medium">{feePct}%</span>
        </span>
        <span className="text-[12px] text-text-muted">
          Impact{" "}
          <span className={cn("font-mono font-medium", impactBps < 50 ? "text-bull" : impactBps < 200 ? "text-warning" : "text-danger")}>
            {impactPct}%
          </span>
        </span>
        {route.hops.length > 1 && (
          <span className="text-[12px] text-text-muted">{route.hops.length} hops</span>
        )}
      </div>
    </div>
  );
}

// ── Cross-chain route card ─────────────────────────────────────────────────

function CrossChainCard({ route }: { route: SwapRouteResult }) {
  const label = route.hops[0]?.poolLabel ?? route.id;
  return (
    <div
      className={cn(
        "border px-3 py-2.5 flex items-center justify-between gap-2",
        route.status === "live"
          ? "border-primary/20 bg-primary/5"
          : route.status === "mainnet_only"
            ? "border-warning/20 bg-warning/5"
            : "border-border bg-background/40 opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <RouteTypeBadge routeType={route.routeType} />
        <span className="text-[13px] text-text-primary font-medium truncate">{label}</span>
      </div>
      <StatusBadge status={route.status} />
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-surface-hover border border-border" />)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface RouteDiagramProps {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  tokenOutSymbol?: string;
  tokenOutDecimals?: number;
  selectedRouteId?: string;
  onSelectRoute?: (route: SwapRouteResult) => void;
  onSelectSplitRoutes?: (selections: SplitRouteSelection[]) => void;
}

export function RouteDiagram({
  tokenIn,
  tokenOut,
  amountIn,
  tokenOutSymbol = "?",
  tokenOutDecimals = 18,
  selectedRouteId,
  onSelectRoute,
  onSelectSplitRoutes,
}: RouteDiagramProps) {
  const { routes, isLoading, error } = useRouteFinder({ tokenIn, tokenOut, amountIn });
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelections, setSplitSelections] = useState<SplitRouteSelection[]>([]);

  const localRoutes = routes.filter((r) => r.routeType === "local");
  const crossChainRoutes = routes.filter((r) => r.routeType !== "local");

  const handleSplitToggle = (route: SwapRouteResult) => {
    setSplitSelections((prev) => {
      const exists = prev.find((s) => s.route.id === route.id);
      if (exists) {
        const next = prev.filter((s) => s.route.id !== route.id);
        // Redistribute weights evenly
        if (next.length === 1) next[0] = { ...next[0], weight: 10000 };
        onSelectSplitRoutes?.(next);
        return next;
      }
      if (prev.length >= 2) return prev; // max 2 for split
      const defaultWeight = prev.length === 0 ? 6000 : 4000;
      // Rebalance existing
      const updated: SplitRouteSelection[] = prev.map((s) => ({ ...s, weight: prev.length === 0 ? 10000 : 6000 }));
      const next = [...updated, { route, weight: defaultWeight }];
      if (next.length === 2) {
        next[0] = { ...next[0], weight: 6000 };
        next[1] = { ...next[1], weight: 4000 };
      }
      onSelectSplitRoutes?.(next);
      return next;
    });
  };

  const handleWeightChange = (route: SwapRouteResult, weight: number) => {
    setSplitSelections((prev) => {
      if (prev.length !== 2) return prev;
      const other = 10000 - weight;
      const next = prev.map((s) =>
        s.route.id === route.id ? { ...s, weight } : { ...s, weight: other },
      );
      onSelectSplitRoutes?.(next);
      return next;
    });
  };

  const handleSplitModeToggle = () => {
    setSplitMode((m) => {
      if (m) {
        setSplitSelections([]);
        onSelectSplitRoutes?.([]);
      }
      return !m;
    });
  };

  if (!amountIn || amountIn === "0") {
    return (
      <div className="p-4 text-center text-[13px] text-text-muted">
        Enter an amount to see routes
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Network className="h-3.5 w-3.5 text-text-muted" />
          <h3 className="text-[15px] font-semibold text-text-primary">Your trade route</h3>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />}
          {localRoutes.length >= 2 && onSelectSplitRoutes && (
            <button
              type="button"
              onClick={handleSplitModeToggle}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[12px] font-mono border transition-colors",
                splitMode
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-text-muted hover:border-primary/50 hover:text-text-secondary",
              )}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              SPLIT
            </button>
          )}
        </div>
      </div>

      {/* Split mode hint */}
      {splitMode && (
        <div className="border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-[12px] text-primary">
            Select up to 2 routes to split your swap. Adjust weights with the sliders.
            {splitSelections.length === 2 && " Weights must sum to 100%."}
          </p>
        </div>
      )}

      {error && !isLoading && (
        <p className="text-[13px] text-danger">Failed to load routes: {error}</p>
      )}

      {isLoading && <Skeleton />}

      {!isLoading && !error && routes.length === 0 && (
        <p className="text-[13px] text-text-muted text-center py-4">No routes found for this pair</p>
      )}

      {/* All-quotes comparison table */}
      {!isLoading && amountIn && amountIn !== "0" && tokenIn && tokenOut && (
        <AllQuotesTable
          tokenIn={tokenIn}
          tokenOut={tokenOut}
          amountIn={amountIn}
          tokenOutDecimals={tokenOutDecimals}
          tokenOutSymbol={tokenOutSymbol}
        />
      )}

      {/* Local V2 routes */}
      {!isLoading && localRoutes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-text-muted uppercase tracking-wider">On-chain routes</p>
          {localRoutes.map((r, i) => (
            <LocalRouteCard
              key={r.id}
              route={r}
              rank={i}
              selected={!splitMode && r.id === selectedRouteId}
              splitSelected={splitMode && splitSelections.some((s) => s.route.id === r.id)}
              splitWeight={splitMode ? splitSelections.find((s) => s.route.id === r.id)?.weight : undefined}
              splitMode={splitMode}
              onSelect={!splitMode ? onSelectRoute : undefined}
              onSplitToggle={splitMode ? handleSplitToggle : undefined}
              onWeightChange={splitMode ? handleWeightChange : undefined}
            />
          ))}
        </div>
      )}

      {/* Cross-chain routes */}
      {!isLoading && crossChainRoutes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-text-muted uppercase tracking-wider">Cross-chain routes</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {crossChainRoutes.map((r) => (
              <CrossChainCard key={r.id} route={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
