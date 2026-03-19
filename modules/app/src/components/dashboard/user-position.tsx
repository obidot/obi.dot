"use client";

import { useAccount } from "wagmi";
import { Loader2 } from "lucide-react";
import { useUserVaultPosition } from "@/hooks/use-user-vault-position";
import { formatTokenAmount } from "@/lib/format";

export function UserPosition() {
  const { isConnected } = useAccount();
  const { data: position, isLoading } = useUserVaultPosition();

  if (!isConnected) {
    return (
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">My Position</p>
        <p className="text-[12px] text-text-muted">Connect wallet to view your position.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
        <span className="text-[12px] text-text-muted">Loading position…</span>
      </div>
    );
  }

  if (!position || position.sharesBalance === 0n) {
    return (
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted uppercase tracking-widest mb-1">My Position</p>
        <p className="text-[12px] text-text-muted">No vault shares. Deposit tDOT above to start.</p>
      </div>
    );
  }

  const sharesFormatted = formatTokenAmount(position.sharesBalance.toString(), 18, 6);
  const valueFormatted = formatTokenAmount(position.assetsValue.toString(), 18, 6);

  return (
    <div className="px-4 py-3 border-t border-border">
      <p className="text-[11px] text-text-muted uppercase tracking-widest mb-2">My Position</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Vault Shares</span>
          <span className="font-mono text-[12px] text-text-secondary">{sharesFormatted}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Redemption Value</span>
          <span className="font-mono text-[12px] text-primary font-semibold">{valueFormatted} tDOT</span>
        </div>
      </div>
    </div>
  );
}
