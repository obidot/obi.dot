"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useYields } from "@/hooks/use-yields";
import { cn } from "@/lib/format";

export function Header() {
  const { data: yields } = useYields();

  // Build ticker items from live yield data
  const tickerItems = (yields ?? []).slice(0, 12).map((y) => ({
    name: y.name,
    apy: y.apyPercent,
    protocol: y.protocol,
  }));

  return (
    <header className="sticky top-14 z-40 flex flex-col border-b border-border bg-surface/80 backdrop-blur-md">
      {/* Ticker bar */}
      <div
        className="h-7 overflow-hidden border-b border-border-subtle bg-background/50"
        aria-label="Live yield ticker"
        role="region"
      >
        {tickerItems.length > 0 ? (
          <div className="ticker-track h-full items-center">
            {/* Duplicate items for seamless loop */}
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <div
                key={`${i < tickerItems.length ? "a" : "b"}-${item.name}`}
                className="flex items-center gap-2 px-4 h-full shrink-0"
              >
                <span className="text-[11px] text-text-secondary">{item.name}</span>
                <span className={cn(
                  "font-mono text-[11px] font-semibold",
                  item.apy >= 10 ? "text-primary" : "text-text-primary",
                )}>
                  {item.apy.toFixed(2)}%
                </span>
                <span className="text-[10px] text-text-muted">APY</span>
                <span className="text-border mx-1">|</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full" aria-hidden="true" />
        )}
      </div>

      {/* Main header row */}
      <div className="flex h-11 items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-text-muted">
            Obidot Autonomous CFO
          </span>
          <span className="text-border">·</span>
          <span className="font-mono text-[11px] text-text-muted">
            ERC-4626 Vault
          </span>
          <span className="text-border">·</span>
          <span className="font-mono text-[11px] text-text-secondary">
            {yields?.length ?? 0} yield sources
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ConnectButton
            chainStatus="icon"
            accountStatus="address"
            showBalance={false}
          />
        </div>
      </div>
    </header>
  );
}
