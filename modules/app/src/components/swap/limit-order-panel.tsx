"use client";

import { ArrowRight, Clock3, TrendingDown, TrendingUp } from "lucide-react";
import { useId, useState } from "react";
import { useMarketPrice } from "@/hooks/use-market-price";
import { cn } from "@/lib/format";
import { TOKENS } from "@/shared/trade/swap";
import type { PendingOrder } from "@/types";
import TokenPicker from "./token-picker";

const EXPIRY_OPTIONS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

function saveOrders(orders: PendingOrder[]) {
  localStorage.setItem("obidot_limit_orders", JSON.stringify(orders));
}

function priceDeltaPct(target: string, market: string): number {
  const targetValue = Number(target);
  const marketValue = Number(market);
  if (!marketValue || !targetValue) return 0;
  return ((targetValue - marketValue) / marketValue) * 100;
}

export default function LimitOrderPanel() {
  const [tokenInIdx, setTokenInIdx] = useState(0);
  const [tokenOutIdx, setTokenOutIdx] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const amountId = useId();
  const targetId = useId();

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];
  const { price: marketPriceDisplay } = useMarketPrice(tokenIn, tokenOut);

  const delta = marketPriceDisplay
    ? priceDeltaPct(targetPrice, marketPriceDisplay)
    : 0;
  const isAboveMarket = delta > 0;

  const canPlace =
    !!amountIn &&
    Number(amountIn) > 0 &&
    !!targetPrice &&
    Number(targetPrice) > 0;

  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmountIn(raw);
  };

  const handleTargetChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setTargetPrice(raw);
  };

  const handlePlaceOrder = () => {
    if (!canPlace) return;

    const order: PendingOrder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tokenInSymbol: tokenIn.symbol,
      tokenOutSymbol: tokenOut.symbol,
      tokenInAddress: tokenIn.address,
      tokenOutAddress: tokenOut.address,
      amountIn,
      targetPrice,
      expiry: Date.now() + EXPIRY_OPTIONS[expiryIdx].ms,
      marketPriceAtOrder: marketPriceDisplay ?? "—",
      createdAt: Date.now(),
    };

    const existing: PendingOrder[] = (() => {
      try {
        return JSON.parse(localStorage.getItem("obidot_limit_orders") ?? "[]");
      } catch {
        return [];
      }
    })();

    saveOrders([order, ...existing]);
    window.dispatchEvent(new CustomEvent("obidot:order-placed"));
    setAmountIn("");
    setTargetPrice(
      marketPriceDisplay ? Number(marketPriceDisplay).toFixed(6) : "",
    );
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="space-y-5 p-5">
      <section className="overflow-hidden border-[3px] border-border bg-surface shadow-[3px_3px_0_0_var(--border)]">
        <header className="panel-header">
          <div className="panel-header-block">
            <div className="panel-header-icon">
              <Clock3 className="h-5 w-5 text-text-primary" />
            </div>
            <div className="panel-heading">
              <p className="panel-kicker">Intent Solver</p>
              <h3 className="panel-title">Limit Order Desk</h3>
              <p className="panel-subtitle">
                Park a target price and let the Obidot agent monitor execution.
              </p>
            </div>
          </div>
          {marketPriceDisplay && (
            <div className="pill bg-secondary text-secondary-foreground">
              1 {tokenIn.symbol} = {Number(marketPriceDisplay).toFixed(6)}{" "}
              {tokenOut.symbol}
            </div>
          )}
        </header>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <TokenPicker
              selectedIdx={tokenInIdx}
              onSelect={setTokenInIdx}
              disabledIdx={tokenOutIdx}
              label="Sell token"
            />
            <div className="flex h-11 w-11 items-center justify-center border-[3px] border-border bg-primary/20 shadow-[2px_2px_0_0_var(--border)]">
              <ArrowRight className="h-4 w-4 text-text-primary" />
            </div>
            <TokenPicker
              selectedIdx={tokenOutIdx}
              onSelect={setTokenOutIdx}
              disabledIdx={tokenInIdx}
              label="Receive token"
            />
            <span className="pill bg-accent text-accent-foreground">
              Agent watched
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label
              htmlFor={amountId}
              className="block space-y-2 border-[3px] border-border bg-background/80 p-4 shadow-[2px_2px_0_0_var(--border)]"
            >
              <span className="retro-label text-[0.95rem] text-text-secondary">
                Amount To Sell
              </span>
              <div className="flex items-center gap-3">
                <input
                  id={amountId}
                  type="text"
                  inputMode="decimal"
                  value={amountIn}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="input-trading flex-1 border-0 bg-transparent p-0 text-2xl font-semibold shadow-none focus:shadow-none"
                />
                <span className="pill bg-surface-alt text-text-secondary">
                  {tokenIn.symbol}
                </span>
              </div>
            </label>

            <label
              htmlFor={targetId}
              className="block space-y-2 border-[3px] border-border bg-background/80 p-4 shadow-[2px_2px_0_0_var(--border)]"
            >
              <span className="retro-label text-[0.95rem] text-text-secondary">
                Target Price
              </span>
              <div className="flex items-center gap-3">
                <input
                  id={targetId}
                  type="text"
                  inputMode="decimal"
                  value={targetPrice}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  placeholder="0.00"
                  className="input-trading flex-1 border-0 bg-transparent p-0 text-2xl font-semibold shadow-none focus:shadow-none"
                />
                <span className="pill bg-surface-alt text-text-secondary">
                  {tokenOut.symbol}
                </span>
              </div>
              <p className="text-[12px] text-text-muted">
                1 {tokenIn.symbol} should clear at this {tokenOut.symbol} quote.
              </p>
            </label>
          </div>

          <div className="section-strip space-y-3 border-[3px] border-border bg-surface-alt">
            <div className="flex flex-wrap items-center gap-2">
              <span className="retro-label text-[0.95rem] text-text-secondary">
                Market Ladder
              </span>
              {targetPrice && marketPriceDisplay && Math.abs(delta) > 0.01 && (
                <div
                  className={cn(
                    "pill",
                    isAboveMarket
                      ? "bg-accent text-accent-foreground"
                      : "bg-destructive text-white",
                  )}
                >
                  {isAboveMarket ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {isAboveMarket ? "+" : ""}
                  {delta.toFixed(2)}% {isAboveMarket ? "above" : "below"}
                </div>
              )}
            </div>
            {marketPriceDisplay && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {[-5, -2, 0, 2, 5].map((pct) => {
                  const price = Number(marketPriceDisplay) * (1 + pct / 100);
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTargetPrice(price.toFixed(6))}
                      className={cn(
                        "h-11 border-[3px] border-border font-mono text-[12px] shadow-[2px_2px_0_0_var(--border)] transition",
                        pct === 0
                          ? "bg-primary text-text-primary"
                          : pct > 0
                            ? "bg-accent/30 text-text-primary hover:bg-accent/45"
                            : "bg-secondary/20 text-text-primary hover:bg-secondary/35",
                      )}
                    >
                      {pct === 0 ? "MARKET" : `${pct > 0 ? "+" : ""}${pct}%`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="retro-label text-[0.95rem] text-text-secondary">
              Order Expires In
            </legend>
            <div className="tab-group">
              {EXPIRY_OPTIONS.map((option, idx) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setExpiryIdx(idx)}
                  className={cn(
                    "tab-item flex-1",
                    expiryIdx === idx && "active",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {submitted && (
        <div className="border-[3px] border-border bg-accent/25 px-4 py-3 shadow-[3px_3px_0_0_var(--border)]">
          <p className="retro-label text-[0.95rem] text-text-primary">
            Order queued for monitoring
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            The Obidot agent will watch the market and submit the intent when
            your target price is reached.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!canPlace}
        onClick={handlePlaceOrder}
        className="btn-primary"
      >
        {!amountIn
          ? "Enter Amount"
          : !targetPrice
            ? "Set Target Price"
            : `Place Order For ${amountIn} ${tokenIn.symbol}`}
      </button>

      <p className="text-center text-[12px] leading-relaxed text-text-muted">
        Orders are monitored by the Obidot AI agent and executed via
        UniversalIntent when price is reached.
      </p>
    </div>
  );
}
