"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { useChainId } from "wagmi";
import { cn, formatTokenAmount } from "@/lib/format";
import { useRouteFinder } from "@/hooks/use-swap";
import { polkadotHubTestnet } from "@/lib/chains";
import type { SwapRouteResult, RouteHop, SplitRouteSelection } from "@/types";
import { Loader2, Network, SplitSquareHorizontal } from "lucide-react";

// ── Token color map ────────────────────────────────────────────────────────

// All token nodes use the same primary palette for consistency and readability
function tokenColor(_symbol: string) {
  return { circle: "bg-primary/25 border-primary/50", text: "text-primary" };
}

// ── Status / route-type badges ─────────────────────────────────────────────

function StatusBadge({ status }: { status: SwapRouteResult["status"] }) {
  const styles: Record<SwapRouteResult["status"], string> = {
    live: "bg-primary/10 text-primary border-primary/20",
    mainnet_only: "bg-warning/10 text-warning border-warning/20",
    coming_soon: "bg-surface-hover text-text-muted border-border",
    no_liquidity: "bg-danger/10 text-danger border-danger/20",
  };
  const labels: Record<SwapRouteResult["status"], string> = {
    live: "LIVE",
    mainnet_only: "MAINNET ONLY",
    coming_soon: "COMING SOON",
    no_liquidity: "NO LIQUIDITY",
  };
  return (
    <span className={cn("font-mono text-[12px] border px-1.5 py-0.5 tracking-wide", styles[status])}>
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
    <span className={cn("font-mono text-[12px] border px-1.5 py-0.5 tracking-wide", styles[routeType])}>
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
      <span className={cn("font-mono text-[13px] font-semibold", c.text)}>{symbol}</span>
      {displayAmount && <span className="font-mono text-[12px] text-text-muted">{displayAmount}</span>}
    </div>
  );
}

// ── Hop flow ──────────────────────────────────────────────────────────────

/**
 * Flat single-row hop flow. All token nodes and pool boxes are siblings in one
 * flex container so the layout can never push the final tokenOut off-screen.
 * Connectors are capped at max-w-[80px] to prevent empty stretching.
 */
function HopFlow({ hops, animated = false }: { hops: RouteHop[]; animated?: boolean }) {
  const connectorStyle = animated
    ? {
        backgroundImage:
          "repeating-linear-gradient(90deg, var(--color-primary) 0, var(--color-primary) 6px, transparent 6px, transparent 10px)",
        backgroundSize: "20px 100%",
        animation: "route-dash-bg 0.6s linear infinite",
      }
    : undefined;

  const connClass = cn(
    "h-px flex-1 min-w-[28px] max-w-[80px] self-center mx-1.5 shrink-0",
    animated ? "opacity-70" : "bg-border",
  );

  if (hops.length === 0) return null;

  return (
    <div className="flex items-center w-full overflow-x-auto py-2">
      {/* Input token — rendered once before the loop */}
      <TokenNode symbol={hops[0].tokenInSymbol} amount={hops[0].amountIn} />

      {hops.map((hop, i) => {
        const isLast = i === hops.length - 1;
        return (
          <Fragment key={i}>
            {/* Connector → pool */}
            <div className={connClass} style={connectorStyle} />

            {/* Pool box */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  "border px-2 py-1.5 text-center",
                  animated ? "bg-primary/15 border-primary/40" : "bg-primary/8 border-primary/25",
                )}
              >
                <p
                  className={cn(
                    "font-mono text-[12px] font-semibold whitespace-nowrap",
                    animated ? "text-primary" : "text-text-primary",
                  )}
                >
                  {hop.poolLabel}
                </p>
                <p className={cn("font-mono text-[11px]", animated ? "text-primary/70" : "text-text-secondary")}>
                  {(Number(hop.feeBps) / 100).toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Connector → token out */}
            <div className={connClass} style={connectorStyle} />

            {/*
             * Show amount only for intermediate tokens — the final tokenOut
             * amount is already displayed prominently in the card header.
             */}
            <TokenNode
              symbol={hop.tokenOutSymbol}
              amount={isLast ? undefined : hop.amountOut}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

// ── All-Quotes comparison table ───────────────────────────────────────────
// Uses single-hop routes from the route finder for accurate amounts.
// On-chain quotes are unreliable on testnet (return placeholder values).

interface AllQuotesTableProps {
  tokenOutDecimals?: number;
  tokenOutSymbol?: string;
  localRoutes: SwapRouteResult[];
}

function AllQuotesTable({ tokenOutDecimals = 18, tokenOutSymbol = "?", localRoutes }: AllQuotesTableProps) {
  // Only show single-hop routes — each represents one adapter's quote
  const items = useMemo(() => {
    const singleHop = localRoutes.filter((r) => r.hops.length === 1);
    if (singleHop.length === 0) return localRoutes; // fall back to all local routes
    return singleHop;
  }, [localRoutes]);

  if (items.length === 0) return null;

  const bestOut = items.reduce((best, r) => {
    const out = BigInt(r.amountOut);
    return out > best ? out : best;
  }, 0n);

  return (
    <div className="space-y-1">
      <p className="text-[13px] text-text-secondary font-semibold uppercase tracking-wider">Adapter quotes</p>
      <div className="border border-border/80 divide-y divide-border/60">
        {items.map((r) => {
          const out = BigInt(r.amountOut);
          const isBest = out === bestOut;
          const savingsBps = bestOut > 0n ? Number(((bestOut - out) * 10000n) / bestOut) : 0;
          const displayOut = formatTokenAmount(r.amountOut, tokenOutDecimals, 6);
          const label = r.hops[0]?.poolLabel ?? r.id;

          return (
            <div key={r.id} className={cn("flex items-center justify-between px-3 py-2", isBest ? "bg-primary/15" : "bg-surface")}>
              <div className="flex items-center gap-2 min-w-0">
                {isBest && (
                  <span className="font-mono text-[11px] text-primary border border-primary/50 bg-primary/20 px-1 py-0.5 shrink-0 font-bold">
                    BEST
                  </span>
                )}
                <span className={cn("text-[13px] font-medium truncate", isBest ? "text-text-primary" : "text-text-secondary")}>{label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={cn("font-mono text-[13px] font-semibold tabular-nums", isBest ? "text-primary" : "text-text-primary")}>
                  {displayOut} {tokenOutSymbol}
                </span>
                {!isBest && savingsBps > 0 && (
                  <span className="font-mono text-[12px] text-danger font-medium">-{(savingsBps / 100).toFixed(2)}%</span>
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
    <span className={cn("font-mono text-[12px] border px-1.5 py-0.5", color)}>
      {prob}% FILL
    </span>
  );
}

// ── Local route card ──────────────────────────────────────────────────────

interface LocalRouteCardProps {
  route: SwapRouteResult;
  rank: number;
  tokenOutDecimals?: number;
  selected?: boolean;
  splitSelected?: boolean;
  splitWeight?: number;
  splitMode?: boolean;
  onSelect?: (route: SwapRouteResult) => void;
  onSplitToggle?: (route: SwapRouteResult) => void;
  onWeightChange?: (route: SwapRouteResult, weight: number) => void;
}

function LocalRouteCard({
  route, rank, tokenOutDecimals = 18, selected, splitSelected, splitWeight, splitMode,
  onSelect, onSplitToggle, onWeightChange,
}: LocalRouteCardProps) {
  const isNoLiquidity = route.status === "no_liquidity";
  const amountOutDisplay = isNoLiquidity ? "—" : formatTokenAmount(route.amountOut, tokenOutDecimals, 6);
  const impactBps = Number(route.totalPriceImpactBps);
  const impactPct = (impactBps / 100).toFixed(2);
  const feePct = (Number(route.totalFeeBps) / 100).toFixed(2);
  const isBest = rank === 0 && !isNoLiquidity;
  // No-liquidity routes cannot be selected
  const canSelect = !isNoLiquidity && !splitMode && !!onSelect;

  return (
    <div
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onClick={() => canSelect && onSelect?.(route)}
      onKeyDown={(e) => canSelect && e.key === "Enter" && onSelect?.(route)}
      className={cn(
        "border p-3 transition-colors",
        canSelect && "cursor-pointer",
        isNoLiquidity && "opacity-60",
        splitSelected || selected
          ? "border-primary bg-primary/15 ring-1 ring-primary/40"
          : isBest
            ? "border-primary/50 bg-primary/10"
            : "border-border/80 bg-surface",
        canSelect && !selected && !splitSelected && "hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      {/* Header: left = status badges, right = fill probability + amount */}
      <div className="flex items-center justify-between gap-2 mb-1">
        {/* Left badges */}
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {splitMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSplitToggle?.(route); }}
              className={cn(
                "w-4 h-4 border flex items-center justify-center shrink-0 transition-colors",
                splitSelected ? "border-primary bg-primary/20" : "border-border hover:border-primary/50",
              )}
            >
              {splitSelected && <span className="text-primary text-[11px] font-bold">✓</span>}
            </button>
          )}
          <StatusBadge status={route.status} />
          {isBest && (
            <span className="font-mono text-[11px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 shrink-0">
              BEST
            </span>
          )}
          {(selected || splitSelected) && !splitMode && (
            <span className="font-mono text-[11px] text-primary border border-primary bg-primary/20 px-1.5 py-0.5 shrink-0">
              ✓ SELECTED
            </span>
          )}
          {splitSelected && splitMode && (
            <span className="font-mono text-[11px] text-primary border border-primary bg-primary/20 px-1.5 py-0.5 shrink-0">
              SPLIT
            </span>
          )}
        </div>

        {/* Right: fill badge + output amount */}
        <div className="flex items-center gap-2 shrink-0">
          {isBest && <FillBadge prob={fillProbability(route)} />}
          <span className="font-mono text-[15px] text-text-primary font-bold tabular-nums tracking-tight">
            {amountOutDisplay}
          </span>
        </div>
      </div>

      {/* Hop flow */}
      <HopFlow hops={route.hops} animated={selected || splitSelected} />

      {/* Split weight slider — only shown when this route is selected in split mode */}
      {splitSelected && splitWeight !== undefined && onWeightChange && (
        <div className="mt-3 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] text-text-muted">Split weight</span>
            <span className="font-mono text-[13px] text-primary font-semibold">{(splitWeight / 100).toFixed(0)}%</span>
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
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/60">
        <span className="text-[13px] text-text-secondary">
          Fee <span className="font-mono text-text-primary font-semibold">{feePct}%</span>
        </span>
        <span className="text-[13px] text-text-secondary">
          Impact{" "}
          <span className={cn("font-mono font-semibold", impactBps < 50 ? "text-bull" : impactBps < 200 ? "text-warning" : "text-danger")}>
            {impactPct}%
          </span>
        </span>
        {route.hops.length > 1 && (
          <span className="text-[13px] text-text-secondary font-mono">{route.hops.length}-hop</span>
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
  const chainId = useChainId();
  const isTestnet = chainId === polkadotHubTestnet.id;
  const [splitMode, setSplitMode] = useState(false);
  const [splitSelections, setSplitSelections] = useState<SplitRouteSelection[]>([]);

  // Routes with actual hops go into on-chain section; stubs (no hops) go into cross-chain section
  // Include "no_liquidity" dry paths in localRoutes so the hop diagram is visible
  const localRoutes = routes.filter((r) => r.routeType === "local" && r.hops.length > 0);
  const liveLocalRoutes = localRoutes.filter((r) => r.status === "live");
  const localStubs = routes.filter((r) => r.routeType === "local" && r.hops.length === 0);
  const crossChainRoutes = [...routes.filter((r) => r.routeType !== "local"), ...localStubs];

  // Auto-select the best live local route when routes load and none is selected.
  // On testnet, skip mainnet_only routes since they aren't functional.
  // Never auto-select a no_liquidity route.
  useEffect(() => {
    if (splitMode || !onSelectRoute) return;
    const best = liveLocalRoutes.find(
      (r) => (!isTestnet || r.status === "live"),
    );
    if (best && !selectedRouteId) {
      onSelectRoute(best);
    }
  }, [routes, splitMode, selectedRouteId, onSelectRoute, isTestnet]);

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
          {liveLocalRoutes.length >= 2 && onSelectSplitRoutes && (
            <button
              type="button"
              onClick={handleSplitModeToggle}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[13px] font-mono border transition-colors",
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
          <p className="text-[13px] text-primary">
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

      {/* All-quotes comparison table — only live routes with actual amounts */}
      {!isLoading && liveLocalRoutes.length > 0 && (
        <AllQuotesTable
          localRoutes={liveLocalRoutes}
          tokenOutDecimals={tokenOutDecimals}
          tokenOutSymbol={tokenOutSymbol}
        />
      )}

      {/* Local V2 routes */}
      {!isLoading && localRoutes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] text-text-secondary font-semibold uppercase tracking-wider">On-chain routes</p>
          {localRoutes.map((r, i) => (
            <LocalRouteCard
              key={r.id}
              route={r}
              rank={i}
              tokenOutDecimals={tokenOutDecimals}
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
          <p className="text-[13px] text-text-secondary font-semibold uppercase tracking-wider">Cross-chain routes</p>
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
