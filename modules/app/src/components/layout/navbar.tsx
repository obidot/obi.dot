"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useYields } from "@/hooks/use-yields";
import { cn } from "@/lib/format";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Swap", href: "/swap" },
  { label: "Strategies", href: "/strategies" },
  { label: "Yields", href: "/yields" },
  { label: "Insights", href: "/insights" },
  { label: "Cross-Chain", href: "/crosschain" },
  { label: "Agent", href: "/agent" },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: yields } = useYields();

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
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="font-mono text-sm font-black text-background">
              O
            </span>
          </div>
          <span className="text-[15px] font-bold tracking-tight text-text-primary">
            Obidot
          </span>
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Nav links */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-colors duration-150",
                  isActive
                    ? "text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-[-1px] left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {/* Live agent pulse */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[11px] text-text-secondary">
              TestNet
            </span>
          </div>

          <div className="hidden h-4 w-px bg-border sm:block" />

          {/* Connect Wallet — styled via CSS overrides in globals.css */}
          <div className="connect-wallet-wrap">
            <ConnectButton
              chainStatus="none"
              accountStatus="address"
              showBalance={false}
            />
          </div>
        </div>
      </nav>

      {/* ── Ticker strip ───────────────────────────────────────────────── */}
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
