"use client";

import type { ProtocolYield, BifrostYield } from "@/types";
import {
  formatApy,
  formatUsdNumber,
  truncateAddress,
  formatRelativeTime,
  cn,
} from "@/lib/format";
import { TrendingUp, Droplets, Pickaxe, Landmark, ExternalLink } from "lucide-react";

const CATEGORY_CONFIG = {
  SLP: { icon: Droplets, color: "text-primary", label: "Liquid Staking" },
  DEX: { icon: TrendingUp, color: "text-accent", label: "DEX" },
  Farming: { icon: Pickaxe, color: "text-warning", label: "Farming" },
  SALP: { icon: Landmark, color: "text-secondary", label: "SALP" },
} as const;

function getRiskLevel(apy: number): { label: string; className: string } {
  if (apy < 5) return { label: "Low", className: "bg-primary/10 text-primary" };
  if (apy < 15) return { label: "Med", className: "bg-warning/10 text-warning" };
  return { label: "High", className: "bg-danger/10 text-danger" };
}

interface ProtocolCardProps {
  yield_: ProtocolYield | BifrostYield;
  isBifrost?: boolean;
  category?: "SLP" | "DEX" | "Farming" | "SALP";
}

export function ProtocolCard({ yield_, isBifrost, category }: ProtocolCardProps) {
  const risk = getRiskLevel(yield_.apyPercent);
  const catConfig = category ? CATEGORY_CONFIG[category] : null;
  const CatIcon = catConfig?.icon;

  return (
    <div className="group bg-surface p-4 transition-colors hover:bg-surface-hover">
      {/* Top row: name + risk badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {CatIcon && (
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-hover",
                catConfig?.color,
              )}
            >
              <CatIcon className="h-3.5 w-3.5" />
            </div>
          )}
          {!CatIcon && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {yield_.name}
            </p>
            <div className="flex items-center gap-1.5">
              {isBifrost && category && (
                <span className="font-mono text-[9px] text-secondary">
                  {catConfig?.label}
                </span>
              )}
              {isBifrost && category && (
                <span className="text-text-muted">|</span>
              )}
              <span className="font-mono text-[9px] text-text-muted">
                {truncateAddress(yield_.protocol)}
              </span>
            </div>
          </div>
        </div>
        <span className={cn("pill text-[10px]", risk.className)}>
          {risk.label}
        </span>
      </div>

      {/* Middle: APY big number + TVL */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-text-muted">
            APY
          </p>
          <p className="stat-number text-xl text-primary">
            {formatApy(yield_.apyPercent)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-text-muted">
            TVL
          </p>
          <p className="font-mono text-sm text-text-secondary">
            {formatUsdNumber(yield_.tvlUsd, true)}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
        <span className="text-[9px] text-text-muted">
          {formatRelativeTime(yield_.fetchedAt)}
        </span>
        {isBifrost && (
          <span className="pill text-[9px] bg-secondary/10 text-secondary">
            Bifrost
          </span>
        )}
      </div>
    </div>
  );
}
