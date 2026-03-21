"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Strategies", href: "/strategies" },
  { label: "Yields", href: "/yields" },
  { label: "Cross-Chain", href: "/crosschain" },
  { label: "Agent", href: "/agent" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-50 flex h-14 items-center border-b border-border bg-surface/90 backdrop-blur-xl"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-5 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <span className="font-mono text-sm font-black text-background">
            O
          </span>
        </div>
        <span className="text-[15px] font-bold tracking-tight text-text-primary">
          Obidot
        </span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-0.5 border-l border-border pl-4">
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
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
              )}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[11px] h-[2px] w-5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Right side: network + status */}
      <div className="ml-auto flex items-center gap-3 px-5">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="font-mono text-[11px] text-text-secondary">
            Agent Active
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="font-mono text-[11px] text-text-muted">
          Paseo Testnet
        </span>
      </div>
    </nav>
  );
}
