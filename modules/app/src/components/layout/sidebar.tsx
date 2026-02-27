"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Crosshair,
  TrendingUp,
  Network,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/format";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Strategies", href: "/strategies", icon: Crosshair },
  { label: "Yields", href: "/yields", icon: TrendingUp },
  { label: "Cross-Chain", href: "/crosschain", icon: Network },
  { label: "Agent Log", href: "/agent", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <span className="font-mono text-lg font-bold text-primary">O</span>
        </div>
        <span className="text-lg font-bold tracking-tight text-text-primary">
          Obidot
        </span>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
          TESTNET
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary glow-green"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive
                    ? "text-primary"
                    : "text-text-muted group-hover:text-text-secondary",
                )}
              />
              {item.label}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Agent Status */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary pulse-dot" />
          <span className="font-mono text-xs text-text-secondary">
            Agent Active
          </span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-text-muted">
          Polkadot Hub Paseo
        </p>
      </div>
    </aside>
  );
}
