"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWebSocket } from "@/hooks/use-websocket";
import { cn } from "@/lib/format";
import { Wifi, WifiOff } from "lucide-react";

export function Header() {
  const { connected } = useWebSocket();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-md">
      {/* Left: Page context (filled by pages) */}
      <div />

      {/* Right: Status + Wallet */}
      <div className="flex items-center gap-4">
        {/* WebSocket status */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs",
            connected
              ? "bg-primary/10 text-primary"
              : "bg-danger/10 text-danger",
          )}
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? "Live" : "Offline"}
        </div>

        {/* Network badge */}
        <div className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-text-secondary">
          Paseo Testnet
        </div>

        {/* Wallet connect */}
        <ConnectButton
          chainStatus="icon"
          accountStatus="address"
          showBalance={false}
        />
      </div>
    </header>
  );
}
