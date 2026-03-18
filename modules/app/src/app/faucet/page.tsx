"use client";

import { FaucetPanel } from "@/components/faucet/faucet-panel";

export default function FaucetPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-[22px] font-bold text-text-primary">
          Test Token Faucet
        </h1>
        <p className="text-[14px] text-text-secondary">
          Mint test tokens to your connected wallet. You pay your own gas.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded border border-border-subtle bg-surface px-4 py-3">
        <p className="text-[12px] text-text-muted">
          ⚠️ These tokens have no real value. For Polkadot Hub TestNet use only.
          Each mint is a separate on-chain transaction.
        </p>
      </div>

      {/* Cards */}
      <FaucetPanel />
    </div>
  );
}
