"use client";

import { useState } from "react";
import { useDepositSubscription, useSwapSubscription } from "@/hooks/use-graphql-subscription";
import type { DepositEvent, SwapEvent } from "@/hooks/use-graphql-subscription";
import { cn } from "@/lib/format";
import { ArrowLeftRight, TrendingDown } from "lucide-react";

type LiveEvent =
  | { kind: "deposit"; data: DepositEvent; ts: number }
  | { kind: "swap"; data: SwapEvent; ts: number };

const MAX_EVENTS = 20;

// ── Pool type labels (poolType is a String from obi.index) ────────────────
const POOL_LABELS: Record<string, string> = {
  "0": "Hydration",
  "1": "AssetHub",
  "2": "Bifrost DEX",
  "3": "Custom",
  "4": "Bridge",
  "5": "Relay Teleport",
  "6": "Karura",
  "7": "Moonbeam",
  "8": "Interlay",
};

// ── Component ─────────────────────────────────────────────

export function LiveEvents() {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  const { connected: depositConnected } = useDepositSubscription((d) => {
    const ev: LiveEvent = { kind: "deposit", data: d, ts: Date.now() };
    setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
  });

  const { connected: swapConnected } = useSwapSubscription((s) => {
    const ev: LiveEvent = { kind: "swap", data: s, ts: Date.now() };
    setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
  });

  const connected = depositConnected || swapConnected;

  return (
    <div className="panel rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-medium text-text-primary">
          Live Events
        </h3>
        <span
          className={cn(
            "flex items-center gap-1.5 font-mono text-xs",
            connected ? "text-primary" : "text-text-muted",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "animate-pulse bg-primary" : "bg-text-muted",
            )}
          />
          {connected ? "Live" : "Connecting..."}
        </span>
      </div>

      {/* Event list */}
      <div className="divide-y divide-border">
        {events.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center p-6">
            <p className="font-mono text-xs text-text-muted">
              Waiting for on-chain events…
            </p>
          </div>
        ) : (
          events.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="px-4 py-3">
              {e.kind === "deposit" && <DepositRow event={e.data} />}
              {e.kind === "swap" && <SwapRow event={e.data} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Row components ────────────────────────────────────────

function DepositRow({ event }: { event: DepositEvent }) {
  const assets = formatTokenAmount(event.assets, 18);
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md bg-primary/10 p-1.5">
        <TrendingDown className="h-3 w-3 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-medium text-text-primary">
            Deposit
          </span>
          <span className="font-mono text-xs text-text-muted">
            #{event.blockNumber}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-text-secondary">
          {assets} DOT from {shortenAddress(event.owner)}
        </p>
      </div>
    </div>
  );
}

function SwapRow({ event }: { event: SwapEvent }) {
  const amountIn = formatTokenAmount(event.amountIn, 18);
  const amountOut = formatTokenAmount(event.amountOut, 18);
  const poolLabel = POOL_LABELS[event.poolType] ?? `Pool ${event.poolType}`;
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md bg-accent/10 p-1.5">
        <ArrowLeftRight className="h-3 w-3 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-medium text-text-primary">
            Swap · {poolLabel}
          </span>
          <span className="font-mono text-xs text-text-muted">
            #{event.blockNumber}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-text-secondary">
          {amountIn} → {amountOut} via {shortenAddress(event.recipient)}
        </p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function formatTokenAmount(raw: string, decimals: number): string {
  try {
    const n = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = n / divisor;
    const frac = ((n % divisor) * 1000n) / divisor;
    return `${whole}.${frac.toString().padStart(3, "0")}`;
  } catch {
    return raw;
  }
}

function shortenAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

