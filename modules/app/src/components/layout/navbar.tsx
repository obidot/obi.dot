"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useYields } from "@/hooks/use-yields";
import { cn } from "@/lib/format";
import { NAV_ITEMS } from "@/shared/navbar";
import { isTradeActionType, type TradeActionType } from "@/shared/trade";
import CustomConnectButton from "./custom-connect-button";

function toChainSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function Navbar() {
  const pathname = usePathname();
  const { chain } = useAccount();
  const { data: yields } = useYields();

  const pathSegments = pathname.split("/").filter(Boolean);
  const tradeFromPath = pathSegments[0];
  const isTradeRoute = isTradeActionType(tradeFromPath ?? "");
  const currentTradeAction: TradeActionType =
    tradeFromPath && isTradeActionType(tradeFromPath) ? tradeFromPath : "swap";
  const currentChain = chain?.name
    ? toChainSlug(chain.name)
    : isTradeRoute && pathSegments[1]
      ? pathSegments[1]
      : "polkadot-hub-testnet";

  const tickerItems = (yields ?? []).slice(0, 12).map((y) => ({
    name: y.name,
    apy: y.apyPercent,
  }));

  return (
    <header className="sticky top-0 z-50 flex flex-col border-b border-border bg-surface/90 backdrop-blur-xl">
      {/* ── Main nav bar ───────────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="flex h-14 items-center gap-6 px-5"
      >
        <Link
          href="/swap/polkadot-hub-testnet"
          className="flex items-center gap-2.5 shrink-0"
        >
          <Image
            src="/images/logo.png"
            width={32}
            height={32}
            alt="Obidot Logo"
            className="rounded-sm"
          />
          <span className="text-[15px] font-semibold tracking-tight text-text-primary">
            Obidot
          </span>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Nav links — bordered tab group */}
        <div className="flex items-center rounded-md border border-border p-0.5 gap-0.5">
          {NAV_ITEMS.map((item) => {
            const href =
              typeof item.href === "function"
                ? item.href({
                    tradeAction: currentTradeAction,
                    currentChain,
                  })
                : item.href;
            const isTradeItem = item.label === "Trade";
            const isActive = isTradeItem
              ? isTradeRoute
              : pathname === href ||
                (href !== "/" && pathname.startsWith(href));

            return (
              <Link
                key={item.label}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "px-3 py-1 text-[13px] font-medium rounded-[5px] transition-colors duration-150 select-none",
                  isActive
                    ? "bg-text-primary text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <CustomConnectButton />
        </div>
      </nav>

      <div
        className="h-7 overflow-hidden border-t border-border-subtle bg-background/60"
        aria-label="Live yield ticker"
        role="region"
      >
        {tickerItems.length > 0 ? (
          <div className="ticker-track h-full items-center">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <div
                key={`${i < tickerItems.length ? "a" : "b"}-${item.name}`}
                className="flex items-center gap-2 px-4 h-full shrink-0"
              >
                <span className="text-[11px] text-text-secondary">
                  {item.name}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] font-semibold",
                    item.apy >= 10 ? "text-primary" : "text-text-primary",
                  )}
                >
                  {item.apy.toFixed(2)}%
                </span>
                <span className="text-[10px] text-text-muted">APY</span>
                <span className="text-border mx-1.5 text-[10px]">·</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
