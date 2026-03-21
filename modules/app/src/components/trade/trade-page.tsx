"use client";

import { ClipboardList, History, Network } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import InfoBanners from "@/components/swap/info-banners";
import OrdersPanel from "@/components/swap/orders-panel";
import { RouteDiagram } from "@/components/swap/route-diagram";
import SwapPanel from "@/components/swap/swap-panel";
import { TradeHistory } from "@/components/swap/trade-history";
import { useSwapRoutes } from "@/hooks/use-swap";
import { cn } from "@/lib/format";
import {
  chainToSlug,
  resolveTradeRoute,
  slugToTokenIdx,
  TRADE_ACTIONS,
} from "@/shared/trade";
import type {
  SplitRouteSelection,
  SwapRouteResult,
  SwapRoutesResponse,
  TradeActionType,
} from "@/types";

function RightPanelIdle({
  routes,
}: {
  routes: SwapRoutesResponse | undefined;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="relative">
        <div className="flex h-18 w-18 items-center justify-center border-[3px] border-border bg-primary/10 shadow-[4px_4px_0_0_var(--border)]">
          <Network className="h-8 w-8 text-primary" />
        </div>
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent animate-ping" />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent" />
      </div>

      <div className="space-y-2">
        <p className="retro-label text-[1.1rem] text-text-primary">
          Intelligent routing ready
        </p>
        <p className="text-[13px] text-text-muted max-w-[260px] leading-relaxed">
          Enter an amount to discover the optimal path across all Polkadot
          adapters
        </p>
      </div>

      {routes && routes.adapters.filter((a) => a.deployed).length > 0 && (
        <div className="w-full max-w-[320px] border-[3px] border-border bg-surface px-4 py-3 shadow-[4px_4px_0_0_var(--border)]">
          <p className="retro-label mb-2 text-[0.85rem] text-text-muted">
            Active adapters
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {routes.adapters
              .filter((a) => a.deployed)
              .map((a) => (
                <span
                  key={a.label}
                  className="pill bg-primary/10 text-primary text-[0.85rem]"
                >
                  {a.label}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[12px] text-text-muted">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-bull" />
          Best price
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Split routes
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Multi-hop
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  const params = useParams();
  const router = useRouter();
  const { chain: walletChain } = useAccount();

  const tradeParam = (params.trade as string) ?? "swap";
  const chainParam = (params.chain as string) ?? "polkadot-hub-testnet";
  const routerParam = (params.router as string) ?? "tdot-to-tusdc";

  const activeTab: TradeActionType = (
    TRADE_ACTIONS.some((a) => a.id === tradeParam) ? tradeParam : "swap"
  ) as TradeActionType;

  // Resolve token pair from router slug
  const resolved = resolveTradeRoute({
    trade: tradeParam,
    chain: chainParam,
    router: routerParam,
  });

  const tokenInIdx = resolved ? slugToTokenIdx(resolved.tokenIn) : 0;
  const tokenOutIdx = resolved ? slugToTokenIdx(resolved.tokenOut) : 1;

  useEffect(() => {
    if (!walletChain) return;
    const slug = chainToSlug(walletChain.name);
    if (slug !== chainParam) {
      router.replace(`/${activeTab}/${slug}/${routerParam}`);
    }
  }, [walletChain, chainParam, activeTab, routerParam, router]);

  const [swapInput, setSwapInput] = useState({
    tokenIn: "",
    tokenOut: "",
    amountIn: "",
    tokenOutSymbol: "",
    tokenOutDecimals: 18,
  });

  const [selectedRoute, setSelectedRoute] = useState<SwapRouteResult | null>(
    null,
  );
  const [selectedSplitRoutes, setSelectedSplitRoutes] = useState<
    SplitRouteSelection[]
  >([]);
  const [limitRightTab, setLimitRightTab] = useState<"orders" | "history">(
    "orders",
  );

  const { data: routes } = useSwapRoutes();

  const showDiagram =
    activeTab === "swap" &&
    !!swapInput.amountIn &&
    swapInput.amountIn !== "0" &&
    !!swapInput.tokenIn &&
    !!swapInput.tokenOut;

  const handleTabChange = (tab: TradeActionType) => {
    router.push(`/${tab}/${chainParam}/${routerParam}`);
  };

  const activeDescription =
    TRADE_ACTIONS.find((t) => t.id === activeTab)?.description ?? "";

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="hero-banner px-5 py-5 md:px-7 md:py-6">
        <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <span className="pill bg-primary text-primary-foreground">
                Trade Surface
              </span>
              <span className="pill bg-surface text-text-secondary">
                {chainParam}
              </span>
              <span className="pill bg-secondary text-secondary-foreground">
                {routerParam.replace(/-/g, " ")}
              </span>
            </div>
            <div>
              <p className="retro-label text-[0.9rem] text-text-muted">
                Routed execution
              </p>
              <h1 className="stat-number mt-2 text-text-primary">
                {TRADE_ACTIONS.find((t) => t.id === activeTab)?.label ?? "Swap"}
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] text-text-secondary">
                {activeDescription}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)]">
              <p className="retro-label text-[0.8rem] text-text-muted">Chain</p>
              <p className="mt-2 text-[13px] font-semibold text-text-primary">
                {chainParam}
              </p>
            </div>
            <div className="border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)]">
              <p className="retro-label text-[0.8rem] text-text-muted">Pair</p>
              <p className="mt-2 text-[13px] font-semibold text-text-primary">
                {routerParam}
              </p>
            </div>
            <div className="border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)]">
              <p className="retro-label text-[0.8rem] text-text-muted">
                Routes
              </p>
              <p className="mt-2 text-[13px] font-semibold text-text-primary">
                {routes?.adapters.filter((adapter) => adapter.deployed)
                  .length ?? 0}{" "}
                active
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[500px_minmax(0,1fr)]">
        <SwapPanel
          activeTab={activeTab}
          activeDescription={activeDescription}
          routerParam={routerParam}
          tokenInIdx={tokenInIdx}
          tokenOutIdx={tokenOutIdx}
          selectedRoute={selectedRoute}
          onTabChange={handleTabChange}
          onSwapInputChange={setSwapInput}
          onRouteSelect={setSelectedRoute}
          onSplitRoutesSelect={setSelectedSplitRoutes}
          selectedSplitRoutes={selectedSplitRoutes}
        />

        {/* Route + info area */}
        <div className="panel hidden overflow-hidden lg:flex lg:flex-col">
          {/* InfoBanners only on swap tab */}
          {activeTab === "swap" && (
            <div className="shrink-0 border-b-[3px] border-border p-5">
              <InfoBanners />
            </div>
          )}

          {/* Swap tab: route diagram or idle */}
          {activeTab === "swap" &&
            (showDiagram ? (
              <RouteDiagram
                tokenIn={swapInput.tokenIn}
                tokenOut={swapInput.tokenOut}
                amountIn={swapInput.amountIn}
                tokenOutSymbol={swapInput.tokenOutSymbol}
                tokenOutDecimals={swapInput.tokenOutDecimals}
                selectedRouteId={selectedRoute?.id}
                onSelectRoute={setSelectedRoute}
                onSelectSplitRoutes={setSelectedSplitRoutes}
              />
            ) : (
              <RightPanelIdle routes={routes} />
            ))}

          {/* Limit tab: orders panel + history tab switcher */}
          {activeTab === "limit" && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Tab bar */}
              <div className="flex shrink-0 border-b-[3px] border-border bg-surface-alt">
                <button
                  type="button"
                  onClick={() => setLimitRightTab("orders")}
                  className={cn(
                    "retro-label flex items-center gap-1.5 px-4 py-3 text-[0.95rem] transition-colors",
                    limitRightTab === "orders"
                      ? "bg-primary text-primary-foreground"
                      : "text-text-muted hover:bg-surface hover:text-text-secondary",
                  )}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Open Positions
                </button>
                <button
                  type="button"
                  onClick={() => setLimitRightTab("history")}
                  className={cn(
                    "retro-label flex items-center gap-1.5 px-4 py-3 text-[0.95rem] transition-colors",
                    limitRightTab === "history"
                      ? "bg-primary text-primary-foreground"
                      : "text-text-muted hover:bg-surface hover:text-text-secondary",
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </button>
              </div>
              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {limitRightTab === "orders" ? (
                  <OrdersPanel />
                ) : (
                  <TradeHistory />
                )}
              </div>
            </div>
          )}

          {/* Cross-chain tab: idle */}
          {activeTab === "crosschain" && <RightPanelIdle routes={routes} />}
        </div>
      </div>

      {/* Mobile route diagram */}
      {showDiagram && (
        <div className="panel mt-4 lg:hidden">
          <RouteDiagram
            tokenIn={swapInput.tokenIn}
            tokenOut={swapInput.tokenOut}
            amountIn={swapInput.amountIn}
            tokenOutSymbol={swapInput.tokenOutSymbol}
            tokenOutDecimals={swapInput.tokenOutDecimals}
            selectedRouteId={selectedRoute?.id}
            onSelectRoute={setSelectedRoute}
            onSelectSplitRoutes={setSelectedSplitRoutes}
          />
        </div>
      )}
    </div>
  );
}
