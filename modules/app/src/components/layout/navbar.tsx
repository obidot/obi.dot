"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { useYields } from "@/hooks/use-yields";
import { cn } from "@/lib/format";
import { NAV_ITEMS } from "@/shared/navbar";
import CustomConnectButton from "./custom-connect-button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { TradeActionType } from "@/types";
import { isTradeActionType } from "@/shared/trade";

function toChainSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { chain } = useAccount();
  const { data: yields } = useYields();
  const chainId = useChainId();

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
      <nav
        aria-label="Main navigation"
        className="flex h-14 items-stretch px-5 gap-0"
      >
        <Link
          href="/swap/polkadot-hub-testnet"
          className={cn(
            "flex items-center gap-2.5 shrink-0",
            "transition duration-200 hover:scale-120 hover:rotate-180",
          )}
        >
          <Image
            src="/images/logo.png"
            width={96}
            height={96}
            alt="Obidot Logo"
            className="rounded-sm"
          />
        </Link>

        <div className="self-center h-5 w-px bg-border shrink-0 mx-2" />

        <NavigationMenu className="self-stretch items-stretch">
          <NavigationMenuList className="h-full gap-0">
            {NAV_ITEMS.filter(
              (item) =>
                item.visibleOnChainId === undefined ||
                item.visibleOnChainId === chainId,
            ).map((item) => {
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

              const linkClass = cn(
                "flex items-center px-3 py-1 text-[14px] transition-colors duration-150 select-none rounded-none",
                isActive
                  ? "bg-text-primary text-white font-semibold border border-text-primary hover:text-primary focus:text-primary"
                  : "text-text-secondary font-medium hover:text-text-primary focus:text-text-primary border border-transparent",
              );

              if (item.children?.length) {
                return (
                  <NavigationMenuItem key={item.label}>
                    <NavigationMenuTrigger
                      onClick={() => router.push(href)}
                      className={cn(linkClass)}
                    >
                      {item.label}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="w-48 p-1.5 bg-popover rounded-none border border-border shadow-md">
                        {item.children.map((child) => (
                          <ListItem
                            key={child.label}
                            href={child.href as string}
                            title={child.label}
                          />
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                );
              }

              return (
                <NavigationMenuItem key={item.label}>
                  <NavigationMenuLink asChild>
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={linkClass}
                    >
                      {item.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

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
          <div className="flex items-center h-full px-4">
            {/* LIVE badge — pinned left, never scrolls */}
            <div className="flex items-center gap-1.5 shrink-0 pr-3 border-r border-border-subtle mr-3">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                Live
              </span>
            </div>
            {/* Clipping wrapper — ticker scrolls inside this, never bleeds left under LIVE */}
            <div className="flex-1 min-w-0 overflow-hidden h-full">
              <div className="ticker-track h-full items-center">
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <div
                    key={`${i < tickerItems.length ? "a" : "b"}-${item.name}`}
                    className="flex items-center gap-2 px-4 h-full shrink-0"
                  >
                    <span className="text-[12px] text-text-secondary">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[12px] font-semibold",
                        item.apy >= 10 ? "text-green-600" : "text-text-primary",
                      )}
                    >
                      {item.apy.toFixed(2)}%
                    </span>
                    <span className="text-[11px] text-text-muted">APY</span>
                    <span className="text-border mx-1.5 text-[11px]">·</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

function ListItem({
  title,
  href,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { href: string; title: string }) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className="block px-3 py-2 text-[13px] font-medium text-text-secondary rounded-none hover:bg-surface-hover hover:text-text-primary transition-colors"
        >
          {title}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
