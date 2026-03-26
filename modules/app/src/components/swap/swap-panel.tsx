"use client";

import { ArrowLeftRight, Clock3, Info, Link2, Settings2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { SLIPPAGE_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/format";
import { TRADE_ACTIONS } from "@/shared/trade";
import type {
  SplitRouteSelection,
  SwapRouteResult,
  TradeActionType,
} from "@/types";
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
  onSwapInputChange: (p: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    tokenOutSymbol: string;
    tokenOutDecimals: number;
  }) => void;
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
  onSplitRoutesSelect: _onSplitRoutesSelect,
}: SwapPanelProps) {
  const [slippageBps, setSlippageBps] = useState(200);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Track the previous token pair so we only clear the selected route when
  // tokens actually change — not on every amount keystroke.
  const prevTokenPairRef = useRef<{ tokenIn: string; tokenOut: string } | null>(
    null,
  );

  const handleInputChange = useCallback(
    (p: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      tokenOutSymbol: string;
      tokenOutDecimals: number;
    }) => {
      const prev = prevTokenPairRef.current;
      const tokenPairChanged =
        !prev || prev.tokenIn !== p.tokenIn || prev.tokenOut !== p.tokenOut;
      prevTokenPairRef.current = { tokenIn: p.tokenIn, tokenOut: p.tokenOut };
      onSwapInputChange(p);
      if (tokenPairChanged) onRouteSelect(null);
    },
    [onSwapInputChange, onRouteSelect],
  );

  return (
    <div className="panel overflow-hidden flex flex-col">
      <div className="border-b-[3px] border-border bg-surface-alt px-5 pt-4 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {TRADE_ACTIONS.map((action, _i) => (
              <div key={action.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onTabChange(action.id)}
                  className={cn(
                    "retro-label flex items-center gap-1.5 px-3 py-3 text-[1rem] transition-colors",
                    activeTab === action.id
                      ? "border-[3px] border-border bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--border)]"
                      : "border-[3px] border-transparent text-text-muted hover:border-border/30 hover:bg-surface hover:text-text-secondary",
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
              className="btn-ghost min-h-0 px-2 py-2 text-text-muted hover:text-text-secondary"
              aria-label="More info"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="btn-ghost min-h-0 px-2 py-2 text-text-muted hover:text-text-secondary"
              aria-label="Settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="px-5 pt-3 pb-0 text-[13px] text-text-muted">
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
            slippageBps={slippageBps}
            onSlippageChange={setSlippageBps}
          />
        )}
        {activeTab === "limit" && <LimitOrderPanel />}
        {activeTab === "crosschain" && <CrossChainSwapPanel />}
      </div>

      <ResponsiveModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Transaction Settings"
      >
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <span className="retro-label text-[0.9rem] text-text-muted">
              Max Slippage
            </span>
            <div className="flex gap-1">
              {SLIPPAGE_OPTIONS.map(({ label, bps }) => (
                <button
                  key={bps}
                  type="button"
                  onClick={() => setSlippageBps(bps)}
                  className={cn(
                    "retro-label border-[2px] px-2.5 py-1 text-[0.85rem] transition-colors",
                    slippageBps === bps
                      ? "border-border bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--border)]"
                      : "border-transparent bg-surface text-text-secondary hover:border-border/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-text-muted">
            Your transaction will revert if the price moves more than this
            percentage unfavorably.
          </p>
        </div>
      </ResponsiveModal>
    </div>
  );
}
