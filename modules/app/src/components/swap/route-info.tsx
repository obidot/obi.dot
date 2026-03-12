"use client";

import { useSwapRoutes } from "@/hooks/use-swap";
import { cn } from "@/lib/format";
import { PoolType, POOL_TYPE_LABELS } from "@/types";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

/** Shows available pool adapters and SwapRouter status */
export function RouteInfo() {
  const { data: routes, isLoading, error, refetch } = useSwapRoutes();

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-hover mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 animate-pulse rounded bg-surface-hover"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-[11px] text-danger mb-2">
          Failed to load route info
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-ghost inline-flex items-center gap-1.5 text-[11px]"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  const adapters = routes?.adapters ?? [];
  const routerDeployed = routes?.routerDeployed ?? false;
  const routerPaused = routes?.routerPaused ?? false;

  return (
    <div className="p-4">
      {/* Router status */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-text-primary">
          DEX Routing
        </h3>
        <div className="flex items-center gap-1.5">
          {routerDeployed ? (
            routerPaused ? (
              <>
                <AlertTriangle className="h-3 w-3 text-warning" />
                <span className="font-mono text-[10px] text-warning">
                  PAUSED
                </span>
              </>
            ) : (
              <>
                <Activity className="h-3 w-3 text-primary" />
                <span className="font-mono text-[10px] text-primary">LIVE</span>
              </>
            )
          ) : (
            <>
              <XCircle className="h-3 w-3 text-text-muted" />
              <span className="font-mono text-[10px] text-text-muted">
                NOT DEPLOYED
              </span>
            </>
          )}
        </div>
      </div>

      {/* Adapter list */}
      <div className="space-y-1">
        {adapters.length === 0 ? (
          <p className="text-[11px] text-text-muted text-center py-2">
            No adapters registered
          </p>
        ) : (
          adapters.map((adapter) => {
            const label =
              POOL_TYPE_LABELS[adapter.poolType as PoolType] ?? adapter.label;

            return (
              <div
                key={adapter.poolType}
                className="flex items-center justify-between rounded-md px-3 py-2 bg-background/40"
              >
                <div className="flex items-center gap-2">
                  {adapter.deployed ? (
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  ) : (
                    <XCircle className="h-3 w-3 text-text-muted" />
                  )}
                  <span
                    className={cn(
                      "text-[12px] font-medium",
                      adapter.deployed
                        ? "text-text-primary"
                        : "text-text-muted",
                    )}
                  >
                    {label}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    adapter.deployed ? "text-primary" : "text-text-muted",
                  )}
                >
                  {adapter.deployed ? "ACTIVE" : "PENDING"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Info footer */}
      {!routerDeployed && (
        <p className="mt-3 text-[10px] text-text-muted text-center">
          Pool adapters will activate once SwapRouter is deployed on Polkadot
          Hub TestNet
        </p>
      )}
    </div>
  );
}
