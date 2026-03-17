"use client";

// ── TradePage ─────────────────────────────────────────────────────────────
// KyberSwap-inspired client component for the dynamic trade route:
//   /[trade]/[chain]/[router]  (e.g. /swap/polkadot-hub-testnet/tdot-to-tusdc)
//
// • Reads URL params via useParams()
// • Monitors wallet chain via useAccount() and auto-navigates on switch
// • Tab bar with pipe separators + ℹ/⚙ icons on right (KyberSwap style)
// • Pre-selects tokens in SwapForm via initialTokenInIdx/Out
// • Navigates URL on tab switch

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { cn } from "@/lib/format";
import { TRADE_ACTIONS, TradeActionType, resolveTradeRoute } from "@/shared/trade";
import { SwapForm } from "@/components/swap/swap-form";
import { RouteDiagram } from "@/components/swap/route-diagram";
import InfoBanners from "@/components/swap/info-banners";
import LimitOrderPanel from "@/components/swap/limit-order-panel";
import CrossChainSwapPanel from "@/components/swap/cross-chain-panel";
import { useSwapRoutes } from "@/hooks/use-swap";
import type { SwapRouteResult } from "@/types";
import {
  ArrowLeftRight,
  Clock3,
  Link2,
  Info,
  Settings2,
  Network,
} from "lucide-react";

// ── Token symbol → index map ──────────────────────────────────────────────

const TOKEN_SLUG_TO_IDX: Record<string, number> = {
  tdot: 0,
  dot: 0,
  tusdc: 1,
  usdc: 1,
  teth: 2,
  eth: 2,
};

function slugToTokenIdx(slug: string): number {
  return TOKEN_SLUG_TO_IDX[slug.toLowerCase()] ?? 0;
}

// ── Chain slug → URL slug normalisation ──────────────────────────────────
// wagmi/viem chain names use spaces; URL params use hyphens.

function chainToSlug(chainName: string): string {
  return chainName.toLowerCase().replace(/\s+/g, "-");
}

// ── Tab icon map ──────────────────────────────────────────────────────────

const TAB_ICONS: Record<TradeActionType, React.ReactNode> = {
  swap: <ArrowLeftRight className="h-3.5 w-3.5" />,
  limit: <Clock3 className="h-3.5 w-3.5" />,
  crosschain: <Link2 className="h-3.5 w-3.5" />,
};

// ── Component ─────────────────────────────────────────────────────────────

export default function TradePage() {
  const params = useParams();
  const router = useRouter();
  const { chain: walletChain } = useAccount();

  // Parse URL segments
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

  // ── Wallet chain monitoring ───────────────────────────────────────────
  // When the connected wallet switches chain, update the URL to match.
  useEffect(() => {
    if (!walletChain) return;
    const slug = chainToSlug(walletChain.name);
    if (slug !== chainParam) {
      router.replace(`/${activeTab}/${slug}/${routerParam}`);
    }
  }, [walletChain, chainParam, activeTab, routerParam, router]);

  // ── Swap state (for route diagram) ───────────────────────────────────
  const [swapInput, setSwapInput] = useState({
    tokenIn: "",
    tokenOut: "",
    amountIn: "",
  });
  const [selectedRoute, setSelectedRoute] = useState<SwapRouteResult | null>(null);
  const { data: routes } = useSwapRoutes();

  const handleInputChange = (p: { tokenIn: string; tokenOut: string; amountIn: string }) => {
    setSwapInput(p);
    setSelectedRoute(null);
  };

  const showDiagram =
    activeTab === "swap" &&
    !!swapInput.amountIn &&
    swapInput.amountIn !== "0" &&
    !!swapInput.tokenIn &&
    !!swapInput.tokenOut;

  // ── Tab switch → navigate ─────────────────────────────────────────────
  const handleTabChange = (tab: TradeActionType) => {
    router.push(`/${tab}/${chainParam}/${routerParam}`);
  };

  const activeDescription =
    TRADE_ACTIONS.find((t) => t.id === activeTab)?.description ?? "";

  return (
    <div className="space-y-0">
      <InfoBanners />

      {/* Main trading area */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[420px_1fr]">
        {/* ── Left panel ───────────────────────────────────────────────── */}
        <div className="rounded-l-xl border border-border bg-surface overflow-hidden flex flex-col lg:rounded-r-none rounded-xl">
          {/* KyberSwap-style tab bar */}
          <div className="border-b border-border px-4 pt-3.5 pb-0">
            <div className="flex items-center justify-between">
              {/* Tabs with pipe separators */}
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
                      onClick={() => handleTabChange(action.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 pb-3 text-[13px] font-medium transition-colors",
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

              {/* Action icons: info + settings */}
              <div className="flex items-center gap-1 pb-3">
                <button
                  type="button"
                  className="btn-ghost p-1.5 rounded-md text-text-muted hover:text-text-secondary"
                  aria-label="More info"
                >
                  <Info className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-ghost p-1.5 rounded-md text-text-muted hover:text-text-secondary"
                  aria-label="Settings"
                >
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="px-4 pt-2 pb-0 text-[11px] text-text-muted">
            {activeDescription}
          </p>

          {/* Panel content */}
          <div className="flex-1">
            {activeTab === "swap" && (
              <SwapForm
                key={routerParam}
                initialTokenInIdx={tokenInIdx}
                initialTokenOutIdx={tokenOutIdx}
                onInputChange={handleInputChange}
                selectedRoute={selectedRoute}
              />
            )}
            {activeTab === "limit" && <LimitOrderPanel />}
            {activeTab === "crosschain" && <CrossChainSwapPanel />}
          </div>
        </div>

        {/* ── Right panel: route diagram ───────────────────────────────── */}
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
              selectedRouteId={selectedRoute?.id}
              onSelectRoute={setSelectedRoute}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Network className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-text-secondary">
                  Your trade route
                </p>
                <p className="mt-1 text-[11px] text-text-muted max-w-[200px]">
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
                        className="pill bg-surface-hover text-text-muted border border-border text-[10px]"
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
            selectedRouteId={selectedRoute?.id}
            onSelectRoute={setSelectedRoute}
          />
        </div>
      )}
    </div>
  );
}
