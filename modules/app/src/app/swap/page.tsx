"use client";

import { useState, useCallback, useRef } from "react";
import SwapForm from "@/components/swap/swap-form";
import { RouteDiagram } from "@/components/swap/route-diagram";
import { cn } from "@/lib/format";
import { useSwapRoutes } from "@/hooks/use-swap";
import type { SwapRouteResult } from "@/types";
import { TRADE_ACTIONS } from "@/shared/trade";
import type { TradeActionType } from "@/types";
import InfoBanners from "@/components/swap/info-banners";
import LimitOrderPanel from "@/components/swap/limit-order-panel";
import CrossChainSwapPanel from "@/components/swap/cross-chain-panel";

export default function SwapPage() {
  const [activeTab, setActiveTab] = useState<TradeActionType>("swap");
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

  const { data: routes } = useSwapRoutes();

  // Stable ref tracks the token pair so we only clear the selected route when
  // tokens change — not on every amount keystroke.
  const prevTokenPairRef = useRef<{ tokenIn: string; tokenOut: string } | null>(null);

  const handleInputChange = useCallback(
    (params: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      tokenOutSymbol: string;
      tokenOutDecimals: number;
    }) => {
      const prev = prevTokenPairRef.current;
      const tokenPairChanged =
        !prev || prev.tokenIn !== params.tokenIn || prev.tokenOut !== params.tokenOut;
      prevTokenPairRef.current = { tokenIn: params.tokenIn, tokenOut: params.tokenOut };
      setSwapInput(params);
      if (tokenPairChanged) setSelectedRoute(null);
    },
    [], // setSwapInput and setSelectedRoute are stable React setState dispatchers
  );

  const showDiagram =
    activeTab === "swap" &&
    !!swapInput.amountIn &&
    swapInput.amountIn !== "0" &&
    !!swapInput.tokenIn &&
    !!swapInput.tokenOut;

  const activeDescription =
    TRADE_ACTIONS.find((t: { id: string }) => t.id === activeTab)?.description ?? "";

  return (
    <div className="space-y-0">
      <InfoBanners />

      {/* Main trading area: form left, route diagram right */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[420px_1fr]">
        {/* ── Left panel: tab bar + form ───────────────────────────── */}
        <div className="rounded-l-xl border border-border bg-surface overflow-hidden flex flex-col lg:rounded-r-none rounded-xl">
          {/* Tab bar */}
          <div className="border-b border-border px-4 pt-4 pb-3">
            <div className="tab-group">
              {TRADE_ACTIONS.map((action: { id: TradeActionType; label: string }) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setActiveTab(action.id)}
                  className={cn(
                    "tab-item",
                    activeTab === action.id && "active",
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <p className="px-4 pt-2 pb-0 text-[13px] leading-relaxed text-text-muted">
            {activeDescription}
          </p>

          {/* Panel content */}
          <div className="flex-1">
            {activeTab === "swap" && (
              <SwapForm
                onInputChange={handleInputChange}
                selectedRoute={selectedRoute}
              />
            )}
            {activeTab === "limit" && <LimitOrderPanel />}
            {activeTab === "crosschain" && <CrossChainSwapPanel />}
          </div>
        </div>

        {/* ── Right panel: route diagram ───────────────────────────── */}
        <div
          className={cn(
            "border border-l-0 border-border bg-surface overflow-hidden",
            "hidden lg:flex flex-col rounded-r-xl",
          )}
        >
          {showDiagram ? (
            <RouteDiagram
              tokenIn={swapInput.tokenIn}
              tokenOut={swapInput.tokenOut}
              amountIn={swapInput.amountIn}
              tokenOutSymbol={swapInput.tokenOutSymbol}
              tokenOutDecimals={swapInput.tokenOutDecimals}
              selectedRouteId={selectedRoute?.id}
              onSelectRoute={setSelectedRoute}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              {/* KyberSwap-style empty state */}
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <span className="font-mono text-[14px] font-bold text-primary">
                    →
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-text-primary">
                  Your trade route
                </p>
                <p className="mt-1 max-w-[240px] text-[13px] leading-relaxed text-text-muted text-pretty">
                  Enter an amount to see the best routing path across Polkadot
                  adapters
                </p>
              </div>
              {routes && (
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {routes.adapters
                    .filter((a) => a.deployed)
                    .map((a) => (
                      <span
                        key={a.label}
                        className="pill border border-border bg-surface-hover text-[11px] text-text-muted"
                      >
                        {a.label}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Route diagram on mobile: full width below form */}
      {showDiagram && (
        <div className="lg:hidden mt-3 rounded-xl border border-border bg-surface overflow-hidden">
          <RouteDiagram
            tokenIn={swapInput.tokenIn}
            tokenOut={swapInput.tokenOut}
            amountIn={swapInput.amountIn}
            tokenOutSymbol={swapInput.tokenOutSymbol}
            tokenOutDecimals={swapInput.tokenOutDecimals}
            selectedRouteId={selectedRoute?.id}
            onSelectRoute={setSelectedRoute}
          />
        </div>
      )}
    </div>
  );
}
