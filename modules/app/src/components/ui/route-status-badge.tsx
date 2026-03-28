"use client";

import { cn } from "@/lib/format";

type RouteStatus =
  | "live"
  | "mainnet_only"
  | "simulated"
  | "coming_soon"
  | "no_liquidity";

interface RouteStatusBadgeProps {
  status: RouteStatus;
  className?: string;
  showDot?: boolean;
}

const STATUS_CONFIG: Record<
  RouteStatus,
  { dot: string; bg: string; text: string; label: string }
> = {
  live: {
    dot: "bg-bull",
    bg: "bg-bull/10 border-bull/30",
    text: "text-bull",
    label: "Live",
  },
  mainnet_only: {
    dot: "bg-text-muted",
    bg: "bg-surface border-border-subtle",
    text: "text-text-muted",
    label: "Mainnet",
  },
  simulated: {
    dot: "bg-primary",
    bg: "bg-primary/10 border-primary/30",
    text: "text-primary",
    label: "Simulated",
  },
  coming_soon: {
    dot: "bg-text-muted",
    bg: "bg-surface border-border-subtle",
    text: "text-text-muted",
    label: "Soon",
  },
  no_liquidity: {
    dot: "bg-amber-500",
    bg: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    label: "No Liquidity",
  },
};

export function RouteStatusBadge({
  status,
  className,
  showDot = true,
}: RouteStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5",
        "retro-label text-[10px] font-medium",
        config.bg,
        config.text,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)}
          aria-hidden="true"
        />
      )}
      {config.label}
    </span>
  );
}
