"use client";

import { Eye, Loader2 } from "lucide-react";
import { formatUnits } from "viem";
import { AssetIcon } from "@/components/ui/asset-icon";
import { HeroIllustration } from "@/components/ui/hero-illustration";
import { useVaultState, useVaultStats } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";

export function VaultOverview() {
  const { data: vault, isLoading, error } = useVaultState();
  const { data: stats } = useVaultStats();

  if (isLoading) {
    return (
      <div className="hero-banner flex h-[150px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !vault) {
    return (
      <div className="hero-banner p-6 text-center">
        <p className="text-sm text-danger">Failed to load vault state</p>
      </div>
    );
  }

  const { totalAssets, totalRemoteAssets } = vault;
  const idle = totalAssets - totalRemoteAssets;
  const utilization =
    totalAssets > 0n ? Number((totalRemoteAssets * 100n) / totalAssets) : 0;
  const heroBadges = [
    "token.dot",
    "protocol.xcm",
    "chain.bifrost",
    "chain.moonbeam",
  ] as const;

  return (
    <div className="hero-banner relative px-5 py-5 md:px-7 md:py-6 fade-up">
      <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] xl:items-end">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="pill bg-primary text-primary-foreground">
              Vault Board
            </span>
            <span className="pill gap-2 bg-surface-alt text-text-secondary">
              <AssetIcon assetId="chain.polkadot" size="xs" variant="bare" />
              Polkadot Hub TestNet
            </span>
          </div>
          <div>
            <p className="retro-label text-[0.95rem] text-text-muted">
              Obidot Yield Vault
            </p>
            <div className="mt-2 flex items-center gap-3">
              <AssetIcon
                assetId="token.dot"
                size="lg"
                variant="tile"
                className="hidden sm:flex"
              />
              <h2 className="stat-number text-text-primary">
                ${parseFloat(formatUnits(totalAssets, 18)).toFixed(2)}
              </h2>
              <Eye className="h-4 w-4 text-text-muted" />
            </div>
            <p className="mt-2 max-w-2xl text-[13px] text-text-secondary">
              Autonomous allocation across Polkadot Hub liquidity surfaces with
              on-chain vault accounting and live operational telemetry.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="pill gap-2 bg-surface text-text-secondary">
              <AssetIcon assetId="token.dot" size="xs" variant="bare" />
              Native DOT vault
            </span>
            <span className="pill gap-2 bg-surface text-text-secondary">
              <AssetIcon assetId="protocol.xcm" size="xs" variant="bare" />
              XCM-linked allocations
            </span>
            <span className="pill gap-2 bg-surface text-text-secondary">
              <AssetIcon assetId="chain.bifrost" size="xs" variant="bare" />
              Yield adapters online
            </span>
          </div>

          {/* Utilization bar */}
          <div className="max-w-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="retro-label text-[0.8rem] text-text-muted">
                Capital Utilization
              </span>
              <span className="retro-label text-[0.8rem] text-primary">
                {utilization}%
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${utilization}%` }}
                role="progressbar"
                aria-valuenow={utilization}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <HeroIllustration
            title="Cross-chain capital orchestrated from one Polkadot-native vault."
            badgeAssetIds={[...heroBadges]}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-2">
            <MetricItem
              label="Idle"
              value={formatTokenAmount(idle.toString())}
              suffix="DOT"
            />
            <MetricItem
              label="Deployed"
              value={formatTokenAmount(totalRemoteAssets.toString())}
              suffix="DOT"
              highlight
            />
            <MetricItem
              label="Utilization"
              value={`${utilization}%`}
              highlight={utilization > 50}
            />
            <MetricItem
              label="Strategies"
              value={stats ? String(stats.totalStrategies) : "—"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="min-w-[118px] border-[3px] border-border bg-surface px-3 py-2.5 shadow-[3px_3px_0_0_var(--border)]"
      style={highlight ? { borderTop: "3px solid var(--primary)" } : undefined}
    >
      <p className="retro-label text-[0.82rem] text-text-muted">{label}</p>
      <p className="mt-1.5 retro-label text-[1.4rem] leading-none text-text-primary">
        {highlight ? <span className="text-primary">{value}</span> : value}
        {suffix && (
          <span className="ml-1 text-[0.75rem] text-text-muted">{suffix}</span>
        )}
      </p>
    </div>
  );
}
