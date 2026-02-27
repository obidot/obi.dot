"use client";

import type { ProtocolYield } from "@/types";
import {
  formatApy,
  formatUsdNumber,
  truncateAddress,
  formatRelativeTime,
  cn,
} from "@/lib/format";
import { TrendingUp, Droplets, Pickaxe, Landmark } from "lucide-react";

const CATEGORY_CONFIG = {
  SLP: { icon: Droplets, color: "text-primary", label: "Liquid Staking" },
  DEX: { icon: TrendingUp, color: "text-accent", label: "DEX" },
  Farming: { icon: Pickaxe, color: "text-warning", label: "Farming" },
  SALP: { icon: Landmark, color: "text-secondary", label: "SALP" },
} as const;

function getRiskLevel(apy: number): { label: string; color: string } {
  if (apy < 5) return { label: "Low", color: "text-primary" };
  if (apy < 15) return { label: "Medium", color: "text-warning" };
  return { label: "High", color: "text-danger" };
}

interface ProtocolCardProps {
  yield_: ProtocolYield;
  isBifrost?: boolean;
  category?: "SLP" | "DEX" | "Farming" | "SALP";
}

export function ProtocolCard({ yield_, isBifrost, category }: ProtocolCardProps) {
  const risk = getRiskLevel(yield_.apyPercent);
  const catConfig = category ? CATEGORY_CONFIG[category] : null;
  const CatIcon = catConfig?.icon;

  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {CatIcon && (
            <div className={cn("rounded-lg bg-surface-hover p-1.5", catConfig?.color)}>
              <CatIcon className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {yield_.name}
            </p>
            {isBifrost && category && (
              <span className="text-[10px] text-text-muted">
                {catConfig?.label}
              </span>
            )}
          </div>
        </div>
        <span className={cn("font-mono text-xs", risk.color)}>
          {risk.label}
        </span>
      </div>

      {/* APY + TVL */}
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            APY
          </p>
          <p className="font-mono text-xl font-bold text-primary">
            {formatApy(yield_.apyPercent)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            TVL
          </p>
          <p className="font-mono text-sm text-text-secondary">
            {formatUsdNumber(yield_.tvlUsd, true)}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="font-mono text-[10px] text-text-muted">
          {truncateAddress(yield_.protocol)}
        </span>
        <span className="text-[10px] text-text-muted">
          {formatRelativeTime(yield_.fetchedAt)}
        </span>
      </div>
    </div>
  );
}
