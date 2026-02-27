"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";

type Action = "deposit" | "withdraw";

export function VaultActions() {
  const [action, setAction] = useState<Action>("deposit");
  const [amount, setAmount] = useState("");
  const [loading] = useState(false);

  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
        Vault Actions
      </h3>

      {/* Tab toggle */}
      <div className="flex rounded-lg bg-background p-1">
        <button
          type="button"
          onClick={() => setAction("deposit")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all duration-200",
            action === "deposit"
              ? "bg-primary/10 text-primary"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setAction("withdraw")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-all duration-200",
            action === "withdraw"
              ? "bg-secondary/10 text-secondary"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          Withdraw
        </button>
      </div>

      {/* Amount input */}
      <div className="mt-4">
        <label
          htmlFor="vault-amount"
          className="mb-1.5 block text-xs text-text-muted"
        >
          Amount (tDOT)
        </label>
        <div className="flex items-center rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
          <input
            id="vault-amount"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <span className="ml-2 font-mono text-xs text-text-muted">tDOT</span>
        </div>
      </div>

      {/* Submit button */}
      <button
        type="button"
        disabled={!amount || loading}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-mono text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
          action === "deposit"
            ? "bg-primary/20 text-primary hover:bg-primary/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)]"
            : "bg-secondary/20 text-secondary hover:bg-secondary/30 hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]",
        )}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {action === "deposit" ? "Deposit" : "Withdraw"}
      </button>

      <p className="mt-2 text-center text-[10px] text-text-muted">
        Connect wallet to enable transactions
      </p>
    </div>
  );
}
