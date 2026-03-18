"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { useMarketPrice } from "@/hooks/use-market-price";
import { TOKENS } from "@/shared/trade/swap";
import { Clock3, TrendingUp, TrendingDown } from "lucide-react";
import TokenPicker from "./token-picker";

// ── Types ─────────────────────────────────────────────────────────────────

interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountIn: string;
  targetPrice: string;
  expiry: number;
  marketPriceAtOrder: string;
  createdAt: number;
}

// ── Expiry options ─────────────────────────────────────────────────────────

const EXPIRY_OPTIONS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function saveOrders(orders: PendingOrder[]) {
  localStorage.setItem("obidot_limit_orders", JSON.stringify(orders));
}

function priceDeltaPct(target: string, market: string): number {
  const t = Number(target);
  const m = Number(market);
  if (!m || !t) return 0;
  return ((t - m) / m) * 100;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function LimitOrderPanel() {
  const [tokenInIdx, setTokenInIdx] = useState(0);
  const [tokenOutIdx, setTokenOutIdx] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(1); // 24h default
  const [submitted, setSubmitted] = useState(false);

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];

  // ── Current market price ──────────────────────────────────────────────
  const { price: marketPriceDisplay } = useMarketPrice(tokenIn, tokenOut);

  const delta = marketPriceDisplay ? priceDeltaPct(targetPrice, marketPriceDisplay) : 0;
  const isAboveMarket = delta > 0;
  const isBelowMarket = delta < 0;

  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmountIn(raw);
  };
  const handleTargetChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setTargetPrice(raw);
  };

  const canPlace =
    !!amountIn && Number(amountIn) > 0 &&
    !!targetPrice && Number(targetPrice) > 0;

  const handlePlaceOrder = () => {
    if (!canPlace) return;
    const order: PendingOrder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tokenInSymbol: tokenIn.symbol,
      tokenOutSymbol: tokenOut.symbol,
      amountIn,
      targetPrice,
      expiry: Date.now() + EXPIRY_OPTIONS[expiryIdx].ms,
      marketPriceAtOrder: marketPriceDisplay ?? "—",
      createdAt: Date.now(),
    };
    const existing: PendingOrder[] = (() => {
      try {
        return JSON.parse(localStorage.getItem("obidot_limit_orders") ?? "[]");
      } catch { return []; }
    })();
    const next = [order, ...existing];
    saveOrders(next);
    window.dispatchEvent(new CustomEvent("obidot:order-placed"));
    setAmountIn("");
    setTargetPrice(marketPriceDisplay?.slice(0, 10) ?? "");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-primary" />
        <span className="text-[13px] text-text-secondary font-medium">Place limit order via Obidot Intent Solver</span>
      </div>

      {/* Token pair row */}
      <div className="flex items-center gap-2">
        <TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />
        <span className="text-text-muted">→</span>
        <TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />
        {marketPriceDisplay && (
          <span className="ml-auto font-mono text-[12px] text-text-muted">
            Market: 1 {tokenIn.symbol} = {Number(marketPriceDisplay).toFixed(6)} {tokenOut.symbol}
          </span>
        )}
      </div>

      {/* Amount input */}
      <div className="border border-border bg-background/60 p-4 space-y-2">
        <p className="text-[12px] text-text-muted uppercase tracking-wider">Amount to Sell</p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={amountIn}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.00"
            className="input-trading text-xl font-semibold flex-1 bg-transparent border-0 focus:ring-0 p-0"
          />
          <span className="font-mono text-[13px] text-text-secondary">{tokenIn.symbol}</span>
        </div>
      </div>

      {/* Target price */}
      <div className="border border-border bg-background/60 p-4 space-y-2">
        <p className="text-[12px] text-text-muted uppercase tracking-wider">
          Target Price (1 {tokenIn.symbol} = ? {tokenOut.symbol})
        </p>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={targetPrice}
            onChange={(e) => handleTargetChange(e.target.value)}
            placeholder="0.00"
            className="input-trading text-xl font-semibold flex-1 bg-transparent border-0 focus:ring-0 p-0"
          />
          <span className="font-mono text-[13px] text-text-secondary">{tokenOut.symbol}</span>
        </div>

        {/* Delta indicator */}
        {targetPrice && marketPriceDisplay && Math.abs(delta) > 0.01 && (
          <div className={cn("flex items-center gap-1.5 text-[12px] font-mono", isAboveMarket ? "text-bull" : "text-danger")}>
            {isAboveMarket ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span>
              {isAboveMarket ? "+" : ""}{delta.toFixed(2)}% {isAboveMarket ? "above" : "below"} market
            </span>
          </div>
        )}

        {/* Market price buttons */}
        {marketPriceDisplay && (
          <div className="flex gap-1 mt-1">
            {[-5, -2, 0, 2, 5].map((pct) => {
              const price = Number(marketPriceDisplay) * (1 + pct / 100);
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setTargetPrice(price.toFixed(6))}
                  className={cn(
                    "flex-1 py-1 text-[11px] font-mono border transition-colors",
                    pct === 0
                      ? "border-border text-text-muted hover:border-primary/40"
                      : pct > 0
                        ? "border-bull/20 text-bull hover:border-bull/50"
                        : "border-danger/20 text-danger hover:border-danger/50",
                  )}
                >
                  {pct === 0 ? "MKT" : `${pct > 0 ? "+" : ""}${pct}%`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Expiry */}
      <div className="space-y-2">
        <p className="text-[12px] text-text-muted uppercase tracking-wider">Order Expires In</p>
        <div className="flex gap-1">
          {EXPIRY_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setExpiryIdx(i)}
              className={cn(
                "flex-1 py-1.5 text-[12px] font-mono border transition-colors",
                expiryIdx === i
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-text-muted hover:border-primary/40",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Place order button */}
      {submitted && (
        <div className="rounded-none border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[13px] text-primary">✓ Order placed — monitored by the Obidot Agent</p>
        </div>
      )}

      <button
        type="button"
        disabled={!canPlace}
        onClick={handlePlaceOrder}
        className="btn-primary"
      >
        {!amountIn
          ? "ENTER AMOUNT"
          : !targetPrice
            ? "SET TARGET PRICE"
            : `PLACE LIMIT ORDER: SELL ${amountIn} ${tokenIn.symbol} AT ${Number(targetPrice).toFixed(4)} ${tokenOut.symbol}`}
      </button>

      <p className="text-[11px] text-text-muted text-center">
        Orders are monitored by the Obidot AI agent and executed via UniversalIntent when price is reached.
      </p>
    </div>
  );
}
