"use client";

import { RouteStatusBadge } from "@/components/ui/route-status-badge";
import { cn } from "@/lib/format";
import type { SwapRouteResult } from "@/types";

export interface XcmRouteStatusItem {
  id: string;
  name: string;
  paraId: number | null;
  type: "xcm" | "bridge";
  icon: string;
  estTime: string;
  status: SwapRouteResult["status"] | "pending" | "unavailable";
  note: string;
  routeId?: string;
  selected: boolean;
  executable: boolean;
}

interface XcmRouteStatusPanelProps {
  items: XcmRouteStatusItem[];
}

export function XcmRouteStatusPanel({ items }: XcmRouteStatusPanelProps) {
  return (
    <div className="overflow-hidden border-[3px] border-border bg-surface-alt shadow-[2px_2px_0_0_var(--border)]">
      <div className="section-strip flex items-center justify-between gap-2 border-t-0 bg-surface-alt">
        <span className="retro-label text-[0.95rem] text-text-secondary">
          Route Reachability
        </span>
        <span className="pill bg-surface text-text-secondary">
          Pair-aware status
        </span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.id}
            className={cn(
              "space-y-3 border-[2px] border-border bg-background/80 p-3 shadow-[2px_2px_0_0_var(--border)]",
              item.selected && "bg-primary/10",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border-[2px] border-border bg-surface font-mono text-[12px] font-bold text-text-primary">
                  {item.icon}
                </span>
                <div className="space-y-1">
                  <p className="font-mono text-[14px] font-semibold text-text-primary">
                    {item.name}
                  </p>
                  <p className="text-[12px] text-text-muted">
                    {item.paraId
                      ? `Parachain ${item.paraId}`
                      : "Relay or external bridge"}
                  </p>
                </div>
              </div>
              {item.status === "pending" || item.status === "unavailable" ? (
                <span
                  className={cn(
                    "pill",
                    item.status === "pending"
                      ? "bg-surface text-text-muted"
                      : "bg-surface-alt text-text-muted",
                  )}
                >
                  {item.status === "pending" ? "Pending" : "Unavailable"}
                </span>
              ) : (
                <RouteStatusBadge status={item.status} />
              )}
            </div>

            <div className="flex items-center justify-between gap-3 text-[12px] text-text-muted">
              <span>{item.type === "xcm" ? "XCM" : "Bridge"}</span>
              <span>{item.executable ? item.estTime : "Preview only"}</span>
            </div>

            <p className="text-[12px] leading-relaxed text-text-secondary">
              {item.note}
            </p>

            {item.routeId && (
              <p className="font-mono text-[11px] text-text-muted">
                {item.routeId}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
