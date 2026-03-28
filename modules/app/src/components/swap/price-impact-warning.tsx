"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/format";

interface PriceImpactWarningProps {
  /** Price impact in basis points (e.g. 150 = 1.5%) */
  priceImpactBps: number;
  /** Whether the user has checked the high-impact confirmation */
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  className?: string;
}

export function PriceImpactWarning({
  priceImpactBps,
  confirmed,
  onConfirmChange,
  className,
}: PriceImpactWarningProps) {
  // < 100 bps (1%) — render nothing
  if (priceImpactBps < 100) return null;

  const isBlocking = priceImpactBps >= 500;
  const isHigh = priceImpactBps >= 300;
  const pct = (priceImpactBps / 100).toFixed(2);

  if (isBlocking) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 border-[2px] border-danger/60 bg-danger/8 px-3 py-2",
          className,
        )}
        role="alert"
      >
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="retro-label text-[11px] font-semibold text-danger">
            Price Impact Too High — {pct}%
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Split your trade into smaller amounts to reduce impact.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-[2px] px-3 py-2",
        isHigh
          ? "border-danger/50 bg-danger/6"
          : "border-amber-500/40 bg-amber-500/6",
        className,
      )}
      role="alert"
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          isHigh ? "text-danger" : "text-amber-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "retro-label text-[11px] font-semibold",
            isHigh ? "text-danger" : "text-amber-600",
          )}
        >
          {isHigh ? "Very High" : "High"} Price Impact — {pct}%
        </p>
        {isHigh && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onConfirmChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-danger"
            />
            <span className="text-[11px] text-text-muted">
              I understand the risk and want to proceed
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
