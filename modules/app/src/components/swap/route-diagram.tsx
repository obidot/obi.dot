"use client";

import { cn, formatTokenAmount } from "@/lib/format";
import { useRouteFinder } from "@/hooks/use-swap";
import type { SwapRouteResult, RouteHop } from "@/types";
import { Loader2, Network } from "lucide-react";

// ── Token color map (matching swap-form) ──────────────────────────────────

const TOKEN_COLORS: Record<string, { circle: string; text: string }> = {
  tDOT: { circle: "bg-primary/20 border-primary/30", text: "text-primary" },
  DOT: { circle: "bg-primary/10 border-primary/20", text: "text-primary/60" },
  tUSDC: { circle: "bg-accent/20 border-accent/30", text: "text-accent" },
  USDC: { circle: "bg-accent/20 border-accent/30", text: "text-accent" },
  tETH: {
    circle: "bg-secondary/20 border-secondary/30",
    text: "text-secondary",
  },
};

function tokenColor(symbol: string) {
  return (
    TOKEN_COLORS[symbol] ?? {
      circle: "bg-surface-hover border-border",
      text: "text-text-secondary",
    }
  );
}

// ── Status badge ──────────────────────────────────────────────────────────

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
    <span
      className={cn(
        "font-mono text-[9px] border rounded px-1.5 py-0.5 tracking-wide",
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

// ── Route type badge ──────────────────────────────────────────────────────

function RouteTypeBadge({
  routeType,
}: {
  routeType: SwapRouteResult["routeType"];
}) {
  const styles: Record<SwapRouteResult["routeType"], string> = {
    local: "bg-accent/10 text-accent border-accent/20",
    xcm: "bg-primary/10 text-primary border-primary/20",
    bridge: "bg-warning/10 text-warning border-warning/20",
  };
  const labels: Record<SwapRouteResult["routeType"], string> = {
    local: "V2",
    xcm: "XCM",
    bridge: "BRIDGE",
  };
  return (
    <span
      className={cn(
        "font-mono text-[9px] border rounded px-1.5 py-0.5 tracking-wide",
        styles[routeType],
      )}
    >
      {labels[routeType]}
    </span>
  );
}

// ── Token node ────────────────────────────────────────────────────────────

function TokenNode({
  symbol,
  amount,
  decimals = 18,
}: {
  symbol: string;
  amount?: string; // wei string
  decimals?: number;
}) {
  const c = tokenColor(symbol);
  const displayAmount = amount ? formatTokenAmount(amount, decimals, 4) : null;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold",
          c.circle,
          c.text,
        )}
      >
        {symbol.slice(0, 2)}
      </span>
      <span className={cn("font-mono text-[10px] font-semibold", c.text)}>
        {symbol}
      </span>
      {displayAmount && (
        <span className="font-mono text-[9px] text-text-muted">
          {displayAmount}
        </span>
      )}
    </div>
  );
}

// ── Pool box ──────────────────────────────────────────────────────────────

function PoolBox({ hop }: { hop: RouteHop }) {
  const feePct = (Number(hop.feeBps) / 100).toFixed(2);
  return (
    <div className="flex flex-col items-center shrink-0">
      {/* Connector line left */}
      <div className="flex items-center w-full gap-0">
        <div className="flex-1 h-px bg-border" />
        <div
          className={cn(
            "rounded border px-2 py-1.5 text-center",
            "bg-surface-hover border-border",
          )}
        >
          <p className="font-mono text-[10px] text-text-secondary font-medium whitespace-nowrap">
            {hop.poolLabel}
          </p>
          <p className="font-mono text-[9px] text-text-muted">{feePct}%</p>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}

// ── Connector arrow ───────────────────────────────────────────────────────

function Connector() {
  return <div className="w-6 h-px bg-border shrink-0 self-center mt-[-18px]" />;
}

// ── Single hop row (for multi-hop: intermediate token node between hops) ──

function HopFlow({ hops }: { hops: RouteHop[] }) {
  return (
    <div className="flex items-end gap-0 w-full overflow-x-auto pb-1">
      {hops.map((hop, i) => (
        <div key={i} className="flex items-center gap-0 flex-1 min-w-0">
          {/* Token in node (only for first hop; subsequent hops reuse prev tokenOut) */}
          {i === 0 && (
            <>
              <TokenNode symbol={hop.tokenInSymbol} amount={hop.amountIn} />
              <div className="flex-1 h-px bg-border self-center mt-[-18px] mx-1" />
            </>
          )}

          {/* Pool box */}
          <div className="flex flex-col items-center shrink-0 mx-1">
            <div
              className={cn(
                "rounded border px-2.5 py-1.5 text-center",
                "bg-surface-hover border-border",
              )}
            >
              <p className="font-mono text-[10px] text-text-secondary font-medium whitespace-nowrap">
                {hop.poolLabel}
              </p>
              <p className="font-mono text-[9px] text-text-muted">
                {(Number(hop.feeBps) / 100).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Connector + token out node */}
          <div className="flex-1 h-px bg-border self-center mt-[-18px] mx-1" />
          <TokenNode symbol={hop.tokenOutSymbol} amount={hop.amountOut} />
        </div>
      ))}
    </div>
  );
}

// ── Split percentage bar ──────────────────────────────────────────────────

function SplitBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-primary shrink-0">
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Local (V2 / XCM) route card ───────────────────────────────────────────

function LocalRouteCard({
  route,
  rank,
  selected,
  onSelect,
}: {
  route: SwapRouteResult;
  rank: number;
  selected?: boolean;
  onSelect?: (route: SwapRouteResult) => void;
}) {
  const amountOutDisplay = formatTokenAmount(route.amountOut, 18, 6);
  const impactBps = Number(route.totalPriceImpactBps);
  const impactPct = (impactBps / 100).toFixed(2);
  const feePct = (Number(route.totalFeeBps) / 100).toFixed(2);
  const isBest = rank === 0;

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(route)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(route)}
      className={cn(
        "rounded-lg border p-4 transition-colors",
        onSelect && "cursor-pointer",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : isBest
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-background/40",
        onSelect && !selected && "hover:border-primary/50 hover:bg-primary/5",
      )}
    >
      {/* Top row: badges + output amount */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <RouteTypeBadge routeType={route.routeType} />
          <StatusBadge status={route.status} />
          {isBest && (
            <span className="font-mono text-[9px] text-primary border border-primary/30 bg-primary/10 rounded px-1.5 py-0.5">
              BEST
            </span>
          )}
          {selected && (
            <span className="font-mono text-[9px] text-primary border border-primary bg-primary/20 rounded px-1.5 py-0.5">
              SELECTED
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="font-mono text-[14px] text-text-primary font-bold">
            {amountOutDisplay}
          </span>
        </div>
      </div>

      {/* Horizontal flow diagram */}
      <HopFlow hops={route.hops} />

      {/* Footer: fee + price impact + hops */}
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/50">
        <span className="text-[10px] text-text-muted">
          Fee{" "}
          <span className="font-mono text-text-secondary font-medium">
            {feePct}%
          </span>
        </span>
        <span className="text-[10px] text-text-muted">
          Impact{" "}
          <span
            className={cn(
              "font-mono font-medium",
              impactBps < 50
                ? "text-bull"
                : impactBps < 200
                  ? "text-warning"
                  : "text-danger",
            )}
          >
            {impactPct}%
          </span>
        </span>
        {route.hops.length > 1 && (
          <span className="text-[10px] text-text-muted">
            {route.hops.length} hops
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cross-chain route card ────────────────────────────────────────────────

function CrossChainCard({ route }: { route: SwapRouteResult }) {
  const label = route.hops[0]?.poolLabel ?? route.id;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2",
        route.status === "live"
          ? "border-primary/20 bg-primary/5"
          : route.status === "mainnet_only"
            ? "border-warning/20 bg-warning/5"
            : "border-border bg-background/40 opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <RouteTypeBadge routeType={route.routeType} />
        <span className="text-[11px] text-text-primary font-medium truncate">
          {label}
        </span>
      </div>
      <StatusBadge status={route.status} />
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 rounded-lg bg-surface-hover border border-border"
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface RouteDiagramProps {
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // wei string
  selectedRouteId?: string;
  onSelectRoute?: (route: SwapRouteResult) => void;
}

export function RouteDiagram({
  tokenIn,
  tokenOut,
  amountIn,
  selectedRouteId,
  onSelectRoute,
}: RouteDiagramProps) {
  const { routes, isLoading, error } = useRouteFinder({
    tokenIn,
    tokenOut,
    amountIn,
  });

  const localRoutes = routes.filter((r) => r.routeType === "local");
  const crossChainRoutes = routes.filter((r) => r.routeType !== "local");

  // Empty state
  if (!amountIn || amountIn === "0") {
    return (
      <div className="p-4 text-center text-[11px] text-text-muted">
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
          <h3 className="text-[13px] font-semibold text-text-primary">
            Your trade route
          </h3>
        </div>
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
        )}
      </div>

      {/* Error */}
      {error && !isLoading && (
        <p className="text-[11px] text-danger">
          Failed to load routes: {error}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && <Skeleton />}

      {/* No results */}
      {!isLoading && !error && routes.length === 0 && (
        <p className="text-[11px] text-text-muted text-center py-4">
          No routes found for this pair
        </p>
      )}

      {/* Local V2 / XCM routes */}
      {!isLoading && localRoutes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-text-muted uppercase tracking-wider">
            On-chain routes
          </p>
          {localRoutes.map((r, i) => (
            <LocalRouteCard
              key={r.id}
              route={r}
              rank={i}
              selected={r.id === selectedRouteId}
              onSelect={onSelectRoute}
            />
          ))}
        </div>
      )}

      {/* Cross-chain routes */}
      {!isLoading && crossChainRoutes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-text-muted uppercase tracking-wider">
            Cross-chain routes
          </p>
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
