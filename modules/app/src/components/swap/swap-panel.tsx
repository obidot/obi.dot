"use client";

import { cn } from "@/lib/format";
import { TRADE_ACTIONS } from "@/shared/trade";
import { Info, Settings2, ArrowLeftRight, Clock3, Link2 } from "lucide-react";
import type { SwapRouteResult, SplitRouteSelection, TradeActionType } from "@/types";
import CrossChainSwapPanel from "./cross-chain-panel";
import LimitOrderPanel from "./limit-order-panel";
import SwapForm from "./swap-form";

const TAB_ICONS: Record<TradeActionType, React.ReactNode> = {
  swap: <ArrowLeftRight className="h-4 w-4" />,
  limit: <Clock3 className="h-4 w-4" />,
  crosschain: <Link2 className="h-4 w-4" />,
};

interface SwapPanelProps {
  activeTab: TradeActionType;
  activeDescription: string;
  routerParam: string;
  tokenInIdx: number;
  tokenOutIdx: number;
  selectedRoute: SwapRouteResult | null;
  selectedSplitRoutes?: SplitRouteSelection[];
  onTabChange: (tab: TradeActionType) => void;
  onSwapInputChange: (p: { tokenIn: string; tokenOut: string; amountIn: string; tokenOutSymbol: string; tokenOutDecimals: number }) => void;
  onRouteSelect: (route: SwapRouteResult | null) => void;
  onSplitRoutesSelect?: (selections: SplitRouteSelection[]) => void;
}

export default function SwapPanel({
  activeTab,
  activeDescription,
  routerParam,
  tokenInIdx,
  tokenOutIdx,
  selectedRoute,
  selectedSplitRoutes,
  onTabChange,
  onSwapInputChange,
  onRouteSelect,
  onSplitRoutesSelect,
}: SwapPanelProps) {
  const handleInputChange = (p: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
  }) => {
    onSwapInputChange(p);
    onRouteSelect(null);
  };

  return (
    <div className="border-r border-border bg-surface overflow-hidden flex flex-col">
      <div className="border-b border-border px-5 pt-4 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {TRADE_ACTIONS.map((action, i) => (
              <div key={action.id} className="flex items-center">
                {i > 0 && (
                  <span className="mx-1 text-border text-[16px] font-light select-none">
                    |
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onTabChange(action.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 pb-3.5 text-[16px] font-medium transition-colors",
                    "border-b-2 -mb-px",
                    activeTab === action.id
                      ? "border-primary text-primary"
                      : "border-transparent text-text-muted hover:text-text-secondary",
                  )}
                >
                  {TAB_ICONS[action.id]}
                  {action.label}
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1 pb-3">
            <button
              type="button"
              className="btn-ghost p-1.5 rounded-none text-text-muted hover:text-text-secondary"
              aria-label="More info"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost p-1.5 rounded-none text-text-muted hover:text-text-secondary"
              aria-label="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="px-5 pt-2.5 pb-0 text-[14px] text-text-muted">
        {activeDescription}
      </p>

      <div className="flex-1">
        {activeTab === "swap" && (
          <SwapForm
            key={routerParam}
            initialTokenInIdx={tokenInIdx}
            initialTokenOutIdx={tokenOutIdx}
            onInputChange={handleInputChange}
            selectedRoute={selectedRoute}
            selectedSplitRoutes={selectedSplitRoutes}
          />
        )}
        {activeTab === "limit" && <LimitOrderPanel />}
        {activeTab === "crosschain" && <CrossChainSwapPanel />}
      </div>
    </div>
  );
}
