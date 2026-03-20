"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { X, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/format";
import { CHAIN, SLIPPAGE_OPTIONS } from "@/lib/constants";
import type { LiquidityPairMeta } from "@/types";
import {
  useAddLiquidity,
  useRemoveLiquidity,
  usePoolShare,
} from "@/hooks/use-liquidity";

interface LiquidityPanelProps {
  pair: LiquidityPairMeta | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "add" | "remove";

const EXPLORER_URL = CHAIN.blockExplorer;

export function LiquidityPanel({ pair, open, onClose }: LiquidityPanelProps) {
  const [tab, setTab] = useState<Tab>("add");

  if (!pair) return null;

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-[360px] border-l border-border bg-surface shadow-xl",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            UniswapV2 Pool
          </p>
          <p className="text-[15px] font-semibold text-text-primary">
            {pair.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["add", "remove"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-[13px] font-medium transition-colors",
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t === "add" ? "+ Add Liquidity" : "− Remove"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="h-[calc(100%-105px)] overflow-y-auto p-4">
        {tab === "add" ? <AddTab pair={pair} /> : <RemoveTab pair={pair} />}
      </div>
    </div>
  );
}

// ── Add Tab ───────────────────────────────────────────────────────────────────

function AddTab({ pair }: { pair: LiquidityPairMeta }) {
  const { isConnected } = useAccount();
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);

  const { reserve0, reserve1, totalSupply } = usePoolShare(
    pair.address as Address,
  );
  const { step, execute, reset, txHash, error } = useAddLiquidity(pair);

  // Auto-compute amount1 when amount0 changes
  useEffect(() => {
    if (!amount0 || reserve0 === 0n) return;
    try {
      const a0 = parseUnits(amount0, 18);
      const a1 = (a0 * reserve1) / reserve0;
      setAmount1(formatUnits(a1, 18).slice(0, 12));
    } catch {
      // invalid input — ignore
    }
  }, [amount0, reserve0, reserve1]);

  // LP estimate
  const lpEstimate = (() => {
    if (!amount0 || reserve0 === 0n || totalSupply === 0n) return null;
    try {
      const a0 = parseUnits(amount0, 18);
      return (a0 * totalSupply) / reserve0;
    } catch {
      return null;
    }
  })();

  if (!isConnected) {
    return (
      <p className="py-8 text-center text-[13px] text-text-muted">
        Connect wallet to add liquidity
      </p>
    );
  }

  const busy =
    step !== "idle" && step !== "done" && step !== "error";

  const stepLabel =
    step === "idle" || step === "error"
      ? "Add Liquidity"
      : step === "approving-token0" || step === "confirming-approve-0"
        ? `Approving ${pair.token0Symbol}…`
        : step === "approving-token1" || step === "confirming-approve-1"
          ? `Approving ${pair.token1Symbol}…`
          : step === "adding" || step === "confirming-add"
            ? "Adding Liquidity…"
            : "Done!";

  const handleAdd = () => {
    if (!amount0 || !amount1) return;
    execute(amount0, amount1, slippageBps);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <AmountInput
          label={pair.token0Symbol}
          value={amount0}
          onChange={(v) => {
            setAmount0(v);
            if (step === "done" || step === "error") reset();
          }}
        />
        <AmountInput
          label={pair.token1Symbol}
          value={amount1}
          onChange={(v) => {
            setAmount1(v);
            if (step === "done" || step === "error") reset();
          }}
        />
      </div>

      {lpEstimate !== null && (
        <div className="rounded border border-border bg-surface-alt px-3 py-2 text-[12px]">
          <span className="text-text-muted">LP tokens you&apos;ll receive: </span>
          <span className="font-mono text-text-primary">
            {formatUnits(lpEstimate, 18).slice(0, 10)}
          </span>
        </div>
      )}

      <SlippageSelector value={slippageBps} onChange={setSlippageBps} />

      {error && (
        <p className="rounded border border-bear/30 bg-bear/10 px-3 py-2 text-[11px] text-bear">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !amount0 || !amount1}
        onClick={step === "idle" || step === "error" ? handleAdd : undefined}
        className={cn(
          "w-full rounded py-2.5 text-[13px] font-semibold transition-colors",
          busy
            ? "cursor-wait bg-primary/50 text-white"
            : step === "done"
              ? "border border-bull/30 bg-bull/20 text-bull"
              : "bg-primary text-white hover:bg-primary/90",
        )}
      >
        {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
        {stepLabel}
      </button>

      {txHash && (
        <a
          href={`${EXPLORER_URL}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          View on Blockscout
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── Remove Tab ────────────────────────────────────────────────────────────────

function RemoveTab({ pair }: { pair: LiquidityPairMeta }) {
  const { isConnected } = useAccount();
  const [lpInput, setLpInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);

  const { balance, sharePercent, amount0, amount1, totalSupply, reserve0, reserve1 } =
    usePoolShare(pair.address as Address);
  const { step, execute, reset, txHash, error } = useRemoveLiquidity(pair);

  const lpAmount = (() => {
    try {
      return lpInput ? parseUnits(lpInput, 18) : 0n;
    } catch {
      return 0n;
    }
  })();

  const out0 = totalSupply > 0n ? (lpAmount * reserve0) / totalSupply : 0n;
  const out1 = totalSupply > 0n ? (lpAmount * reserve1) / totalSupply : 0n;

  if (!isConnected) {
    return (
      <p className="py-8 text-center text-[13px] text-text-muted">
        Connect wallet to remove liquidity
      </p>
    );
  }

  if (balance === 0n) {
    return (
      <p className="py-8 text-center text-[13px] text-text-muted">
        No position in this pool
      </p>
    );
  }

  const busy =
    step !== "idle" && step !== "done" && step !== "error";

  const stepLabel =
    step === "idle" || step === "error"
      ? "Remove Liquidity"
      : step === "approving-lp" || step === "confirming-approve-lp"
        ? "Approving LP…"
        : step === "removing" || step === "confirming-remove"
          ? "Removing…"
          : "Done!";

  const handleRemove = () => {
    if (lpAmount === 0n) return;
    execute(lpAmount, slippageBps, reserve0, reserve1, totalSupply);
  };

  return (
    <div className="space-y-4">
      {/* Position card */}
      <div className="space-y-1 rounded border border-border bg-surface-alt px-3 py-2.5 text-[12px]">
        <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Your Position
        </p>
        <div className="flex justify-between">
          <span className="text-text-secondary">LP Balance</span>
          <span className="font-mono text-text-primary">
            {formatUnits(balance, 18).slice(0, 12)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Pool Share</span>
          <span className="font-mono text-text-primary">
            {sharePercent.toFixed(4)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">{pair.token0Symbol}</span>
          <span className="font-mono text-text-primary">
            {formatUnits(amount0, 18).slice(0, 10)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">{pair.token1Symbol}</span>
          <span className="font-mono text-text-primary">
            {formatUnits(amount1, 18).slice(0, 10)}
          </span>
        </div>
      </div>

      {/* LP input + % buttons */}
      <div className="space-y-2">
        <AmountInput
          label="LP tokens"
          value={lpInput}
          onChange={(v) => {
            setLpInput(v);
            if (step === "done" || step === "error") reset();
          }}
        />
        <div className="flex gap-2">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setLpInput(
                  formatUnits(
                    (balance * BigInt(Math.round(pct * 100))) / 100n,
                    18,
                  ),
                );
                if (step === "done" || step === "error") reset();
              }}
              className="flex-1 rounded border border-border py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
            >
              {pct === 1 ? "Max" : `${pct * 100}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Expected output */}
      {lpAmount > 0n && (
        <div className="space-y-1 rounded border border-border bg-surface-alt px-3 py-2 text-[12px]">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">
            Expected Output
          </p>
          <div className="flex justify-between">
            <span className="text-text-secondary">{pair.token0Symbol}</span>
            <span className="font-mono">{formatUnits(out0, 18).slice(0, 10)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">{pair.token1Symbol}</span>
            <span className="font-mono">{formatUnits(out1, 18).slice(0, 10)}</span>
          </div>
        </div>
      )}

      <SlippageSelector value={slippageBps} onChange={setSlippageBps} />

      {error && (
        <p className="rounded border border-bear/30 bg-bear/10 px-3 py-2 text-[11px] text-bear">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || lpAmount === 0n}
        onClick={step === "idle" || step === "error" ? handleRemove : undefined}
        className={cn(
          "w-full rounded py-2.5 text-[13px] font-semibold transition-colors",
          busy
            ? "cursor-wait bg-primary/50 text-white"
            : step === "done"
              ? "border border-bull/30 bg-bull/20 text-bull"
              : "bg-primary text-white hover:bg-primary/90",
        )}
      >
        {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
        {stepLabel}
      </button>

      {txHash && (
        <a
          href={`${EXPLORER_URL}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          View on Blockscout
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative rounded border border-border bg-surface-alt">
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.0"
        className="w-full bg-transparent px-3 py-2.5 pr-16 font-mono text-[14px] text-text-primary outline-none"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-text-muted">
        {label}
      </span>
    </div>
  );
}

function SlippageSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        Slippage
      </p>
      <div className="flex gap-2">
        {SLIPPAGE_OPTIONS.map((opt) => (
          <button
            key={opt.bps}
            type="button"
            onClick={() => onChange(opt.bps)}
            className={cn(
              "flex-1 rounded border py-1 font-mono text-[11px] transition-colors",
              value === opt.bps
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-text-secondary hover:bg-surface-hover",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
