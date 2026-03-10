"use client";

import { SwapForm } from "@/components/swap/swap-form";
import { RouteInfo } from "@/components/swap/route-info";
import { PageHero, HeroStat } from "@/components/ui/page-hero";
import { useSwapRoutes } from "@/hooks/use-swap";
import { ArrowLeftRight, Layers, Activity } from "lucide-react";

export default function SwapPage() {
  const { data: routes } = useSwapRoutes();

  const activeAdapters = routes?.adapters.filter((a) => a.deployed).length ?? 0;
  const totalAdapters = routes?.adapters.length ?? 0;

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="DEX Aggregator"
        title="Swap"
        description="Route trades across Polkadot Hub pool adapters for best execution"
        stats={
          <>
            <HeroStat
              label="Adapters"
              icon={<Layers className="h-3.5 w-3.5 text-accent" />}
              value={
                <span className="text-text-primary">
                  {activeAdapters}/{totalAdapters}
                </span>
              }
            />
            <HeroStat
              label="Router"
              icon={<Activity className="h-3.5 w-3.5 text-primary" />}
              value={
                <span
                  className={
                    routes?.routerDeployed ? "text-primary" : "text-text-muted"
                  }
                >
                  {routes?.routerDeployed
                    ? routes?.routerPaused
                      ? "Paused"
                      : "Live"
                    : "Pending"}
                </span>
              }
            />
          </>
        }
      />

      {/* Trading terminal grid: swap form left, route info right */}
      <div className="grid grid-cols-1 gap-[1px] overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-[1fr_300px]">
        {/* Left: Swap form */}
        <div className="bg-surface">
          <SwapForm />
        </div>

        {/* Right: Route info */}
        <div className="bg-surface">
          <RouteInfo />
        </div>
      </div>
    </div>
  );
}
