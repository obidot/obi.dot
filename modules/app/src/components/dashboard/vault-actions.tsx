"use client";

import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { cn, formatTokenAmount } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { CONTRACTS } from "@/lib/constants";

type Action = "deposit" | "withdraw";

const PCT_OPTIONS = [
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1.0 },
];

export function VaultActions() {
  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({
    address,
    token: CONTRACTS.TEST_DOT as `0x${string}`,
    query: { enabled: isConnected && !!address },
  });

  // Formatted balance as a plain number for percentage math
  const balanceFormatted = balanceData
    ? Number(formatTokenAmount(balanceData.value.toString(), balanceData.decimals, 6))
    : 0;

  const handleAmountChange = (raw: string) => {
    // Allow only digits and a single decimal point
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      setAmount(raw);
    }
  };

  const handlePct = (fraction: number) => {
    if (!isConnected || balanceFormatted <= 0) return;
    const val = (balanceFormatted * fraction).toFixed(6).replace(/\.?0+$/, "");
    setAmount(val);
  };

  const handleSubmit = () => {
    if (!amount || loading) return;
    // UI-only: simulate a brief loading flash
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  const displayBalance = isConnected && balanceData
    ? `${formatTokenAmount(balanceData.value.toString(), balanceData.decimals, 4)} tDOT`
    : "—";

  return (
    <div className="p-4">
      {/* Header */}
      <h3 className="text-[13px] font-semibold text-text-primary mb-3">
        Vault Actions
      </h3>

      {/* Buy/Sell style tabs */}
      <div className="flex gap-[1px] rounded-md overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setAction("deposit")}
          className={cn(
            "flex-1 py-2 text-[13px] font-bold font-mono transition-colors",
            action === "deposit"
              ? "bg-primary text-background"
              : "bg-surface-hover text-text-muted hover:text-text-secondary",
          )}
        >
          DEPOSIT
        </button>
        <button
          type="button"
          onClick={() => setAction("withdraw")}
          className={cn(
            "flex-1 py-2 text-[13px] font-bold font-mono transition-colors",
            action === "withdraw"
              ? "bg-danger text-white"
              : "bg-surface-hover text-text-muted hover:text-text-secondary",
          )}
        >
          WITHDRAW
        </button>
      </div>

      {/* Available balance */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-text-muted">Available Balance</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {displayBalance}
        </span>
      </div>

      {/* Amount input */}
      <div className="relative mb-3">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0.00"
          aria-label={`Amount to ${action}`}
          className="input-trading pr-16 text-right text-lg"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-text-muted">
          tDOT
        </span>
      </div>

      {/* Percentage buttons */}
      <div className="flex gap-1.5 mb-4">
        {PCT_OPTIONS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            onClick={() => handlePct(value)}
            className="btn-ghost flex-1 py-1 text-[11px] font-mono"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cost summary */}
      <div className="space-y-1.5 mb-4 pb-4 border-b border-border">
        <div className="flex justify-between">
          <span className="text-[11px] text-text-muted">Cost</span>
          <span className="font-mono text-[12px] text-text-secondary">
            {amount || "0.00"} <span className="text-text-muted">tDOT</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] text-text-muted">Fee</span>
          <span className="font-mono text-[12px] text-text-secondary">
            0.0000
          </span>
        </div>
      </div>

      {/* Submit button */}
      <button
        type="button"
        disabled={!isConnected || !amount || loading}
        onClick={handleSubmit}
        className={cn(
          action === "deposit" ? "btn-primary" : "btn-danger",
        )}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {action === "deposit" ? "DEPOSIT tDOT" : "WITHDRAW tDOT"}
      </button>

      {!isConnected && (
        <p className="mt-2 text-center text-[10px] text-text-muted">
          Connect wallet to enable transactions
        </p>
      )}
    </div>
  );
}
