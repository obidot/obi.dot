"use client";

import { FaucetPanel } from "@/components/faucet/faucet-panel";
import { PageHero } from "@/components/ui/page-hero";

export default function FaucetPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHero
        eyebrow="Faucet"
        title="Test Token Faucet"
        description="Mint test assets to your connected wallet on Polkadot Hub TestNet. Each mint is a separate on-chain transaction."
      />

      {/* Disclaimer */}
      <div className="panel px-4 py-3">
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
