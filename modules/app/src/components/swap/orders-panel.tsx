"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/format";
import { Clock3, Trash2, ClipboardList } from "lucide-react";
import type { PendingOrder } from "@/types";

const LS_KEY = "obidot_limit_orders";

function loadOrders(): PendingOrder[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveOrders(orders: PendingOrder[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

function formatExpiry(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function priceDelta(target: string, market: string): number {
  const t = Number(target);
  const m = Number(market);
  if (!m || !t) return 0;
  return ((t - m) / m) * 100;
}

function OrderRow({
  order,
  onCancel,
}: {
  order: PendingOrder;
  onCancel: (id: string) => void;
}) {
  const delta = priceDelta(order.targetPrice, order.marketPriceAtOrder);
  const showDelta = Math.abs(delta) >= 0.01;

  return (
    <div className="border border-border bg-surface p-3 flex items-start justify-between gap-2">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[13px] text-text-primary font-semibold">
            {order.amountIn} {order.tokenInSymbol} → {order.tokenOutSymbol}
          </span>
          <span className="font-mono text-[11px] text-primary border border-primary/20 px-1 py-0.5">
            PENDING
          </span>
        </div>

        <p className="text-[12px] text-text-muted font-mono">
          At: {Number(order.targetPrice).toFixed(6)} {order.tokenOutSymbol} /{" "}
          {order.tokenInSymbol}
          {showDelta && (
            <span
              className={cn(
                "ml-2",
                delta > 0 ? "text-bull" : "text-danger",
              )}
            >
              ({delta > 0 ? "+" : ""}
              {delta.toFixed(1)}% vs placed)
            </span>
          )}
        </p>

        <div className="flex items-center gap-1 text-[11px] text-text-muted">
          <Clock3 className="h-3 w-3" />
          <span>Expires in {formatExpiry(order.expiry)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCancel(order.id)}
        className="text-text-muted hover:text-danger transition-colors shrink-0 p-1"
        aria-label="Cancel order"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function OrdersPanel() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);

  const reload = useCallback(() => {
    setOrders(loadOrders());
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("obidot:order-placed", reload as EventListener);
    return () => window.removeEventListener("obidot:order-placed", reload as EventListener);
  }, [reload]);

  const handleCancel = useCallback((id: string) => {
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== id);
      saveOrders(next);
      return next;
    });
  }, []);

  const handleClearExpired = useCallback(() => {
    setOrders((prev) => {
      const next = prev.filter((o) => o.expiry > Date.now());
      saveOrders(next);
      return next;
    });
  }, []);

  const activeOrders = orders.filter((o) => o.expiry > Date.now());
  const expiredOrders = orders.filter((o) => o.expiry <= Date.now());

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-text-muted" />
          <span className="text-[15px] font-semibold text-text-primary">
            Open Positions
          </span>
          {activeOrders.length > 0 && (
            <span className="font-mono text-[11px] bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5">
              {activeOrders.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-full py-16 text-center">
            <div className="h-12 w-12 border border-border bg-surface-hover flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-text-muted" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-text-secondary">
                No open orders
              </p>
              <p className="text-[12px] text-text-muted mt-1 max-w-[200px]">
                Place a limit order to get started
              </p>
            </div>
          </div>
        )}

        {activeOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-muted uppercase tracking-wider">
              Active ({activeOrders.length})
            </p>
            {activeOrders.map((o) => (
              <OrderRow key={o.id} order={o} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {expiredOrders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-text-muted uppercase tracking-wider">
                Expired ({expiredOrders.length})
              </p>
              <button
                type="button"
                onClick={handleClearExpired}
                className="text-[11px] text-text-muted hover:text-danger transition-colors font-mono"
              >
                Clear all
              </button>
            </div>
            {expiredOrders.map((o) => (
              <div key={o.id} className="opacity-50">
                <OrderRow order={o} onCancel={handleCancel} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted text-center">
          Orders monitored by Obidot Agent · executed via UniversalIntent
        </p>
      </div>
    </div>
  );
}
