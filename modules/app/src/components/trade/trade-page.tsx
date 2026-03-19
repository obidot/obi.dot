"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { cn } from "@/lib/format";
import {
  TRADE_ACTIONS,
  chainToSlug,
  resolveTradeRoute,
  slugToTokenIdx,
} from "@/shared/trade";
import SwapPanel from "@/components/swap/swap-panel";
import { RouteDiagram } from "@/components/swap/route-diagram";
import InfoBanners from "@/components/swap/info-banners";
import OrdersPanel from "@/components/swap/orders-panel";
import { TradeHistory } from "@/components/swap/trade-history";
import { useSwapRoutes } from "@/hooks/use-swap";
import type { SwapRouteResult, SplitRouteSelection, TradeActionType, SwapRoutesResponse } from "@/types";
import { Network, ClipboardList, History } from "lucide-react";

function RightPanelIdle({ routes }: { routes: SwapRoutesResponse | undefined }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      {/* Animated network icon */}
      <div className="relative">
        <div className="h-16 w-16 border border-primary/20 bg-primary/5 flex items-center justify-center">
          <Network className="h-8 w-8 text-primary/60" />
        </div>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary/40 animate-ping" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
      </div>

      <div className="space-y-2">
        <p className="text-[16px] font-semibold text-text-secondary">
          Intelligent routing ready
        </p>
        <p className="text-[13px] text-text-muted max-w-[260px] leading-relaxed">
          Enter an amount to discover the optimal path across all Polkadot adapters
        </p>
      </div>

      {routes && routes.adapters.filter((a) => a.deployed).length > 0 && (
        <div className="w-full max-w-[280px]">
          <p className="text-[11px] text-text-muted uppercase tracking-wider mb-2">
            Active adapters
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {routes.adapters
              .filter((a) => a.deployed)
              .map((a) => (
                <span
                  key={a.label}
                  className="pill bg-primary/5 text-primary border border-primary/20 text-[12px]"
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

  const [selectedRoute, setSelectedRoute] = useState<SwapRouteResult | null>(null);
  const [selectedSplitRoutes, setSelectedSplitRoutes] = useState<SplitRouteSelection[]>([]);
  const [limitRightTab, setLimitRightTab] = useState<"orders" | "history">("orders");

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
    <div className="w-full px-4 py-6 md:px-8 md:py-8 max-w-[1440px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] border border-border bg-surface">
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
        <div className="hidden lg:flex flex-col border-l border-border bg-background/40">
          {/* InfoBanners only on swap tab */}
          {activeTab === "swap" && (
            <div className="p-6 border-b border-border shrink-0">
              <InfoBanners />
            </div>
          )}

          {/* Swap tab: route diagram or idle */}
          {activeTab === "swap" && (
            showDiagram ? (
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
            )
          )}

          {/* Limit tab: orders panel + history tab switcher */}
          {activeTab === "limit" && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setLimitRightTab("orders")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                    limitRightTab === "orders"
                      ? "border-primary text-text-primary"
                      : "border-transparent text-text-muted hover:text-text-secondary",
                  )}
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Open Positions
                </button>
                <button
                  type="button"
                  onClick={() => setLimitRightTab("history")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                    limitRightTab === "history"
                      ? "border-primary text-text-primary"
                      : "border-transparent text-text-muted hover:text-text-secondary",
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  History
                </button>
              </div>
              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {limitRightTab === "orders" ? <OrdersPanel /> : <TradeHistory />}
              </div>
            </div>
          )}

          {/* Cross-chain tab: idle */}
          {activeTab === "crosschain" && <RightPanelIdle routes={routes} />}
        </div>
      </div>

      {/* Mobile route diagram */}
      {showDiagram && (
        <div className="lg:hidden mt-4 border border-border bg-surface">
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
