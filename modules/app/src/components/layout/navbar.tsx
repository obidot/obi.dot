"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { useYields } from "@/hooks/use-yields";
import { cn } from "@/lib/format";
import { NAV_ITEMS, type NavItem } from "@/shared/navbar";
import { isTradeActionType } from "@/shared/trade";
import type { TradeActionType } from "@/types";
import CustomConnectButton from "./custom-connect-button";

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

  const resolveHref = (item: NavItem): string =>
    typeof item.href === "function"
      ? item.href({
          tradeAction: currentTradeAction,
          currentChain,
        })
      : item.href;

  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
        <nav
          aria-label="Main navigation"
          className="flex min-h-14 items-center gap-3"
        >
          <Link
            href="/swap/polkadot-hub-testnet"
            className={cn(
              "flex shrink-0 items-center gap-3",
              "transition-transform duration-150 hover:-translate-y-0.5",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center border-[3px] border-border bg-primary shadow-[3px_3px_0_0_var(--border)]">
              <Image
                src="/images/logo.png"
                width={28}
                height={28}
                alt="Obidot Logo"
                className="h-7 w-7 object-contain"
              />
            </span>
            <span className="flex flex-col">
              <span className="retro-display text-[2rem] leading-none text-text-primary">
                Obidot
              </span>
              <span className="retro-label text-[0.8rem] leading-none text-text-muted">
                Polkadot Hub TestNet
              </span>
            </span>
          </Link>

          <div className="hidden h-10 w-px shrink-0 bg-border/30 lg:block" />

          <NavigationMenu className="hidden self-stretch items-stretch lg:flex">
            <NavigationMenuList className="h-full gap-0">
              {NAV_ITEMS.filter(
                (item) =>
                  item.visibleOnChainId === undefined ||
                  item.visibleOnChainId === chainId,
              ).map((item) => {
                const href = resolveHref(item);
                const isTradeItem = item.label === "Trade";
                const isActive = isTradeItem
                  ? isTradeRoute
                  : pathname === href ||
                    (href !== "/" && pathname.startsWith(href));

                const linkClass = cn(
                  "retro-label flex min-h-10 items-center px-3 py-1.5 text-[1rem] transition-colors duration-150 select-none rounded-none",
                  isActive
                    ? "border-[3px] border-border bg-primary text-text-primary shadow-[2px_2px_0_0_var(--border)]"
                    : "border-[3px] border-transparent bg-transparent text-text-secondary hover:border-border/35 hover:bg-surface hover:text-text-primary",
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
                        <ul className="w-56 space-y-1 border-[3px] border-border bg-popover p-2 shadow-[4px_4px_0_0_var(--border)]">
                          {item.children.map((child) => (
                            <ListItem
                              key={child.label}
                              href={resolveHref(child)}
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

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <div className="hidden items-center gap-2 md:flex">
              <span className="pill bg-accent text-accent-foreground">
                Live
              </span>
              <span className="pill bg-surface text-text-secondary">
                {chain?.name ?? "Polkadot Hub TestNet"}
              </span>
            </div>
            <CustomConnectButton />
          </div>
        </nav>

        <section
          className="panel flex h-10 items-center overflow-hidden border-[3px] border-border bg-surface/90 px-0"
          aria-label="Live yield ticker"
        >
          {tickerItems.length > 0 ? (
            <div className="flex h-full items-center px-4">
              <div className="retro-label mr-3 flex shrink-0 items-center gap-2 border-r-2 border-border pr-3 text-[0.95rem] text-text-secondary">
                <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
                <span>Yield Tape</span>
              </div>
              <div className="flex h-full min-w-0 flex-1 overflow-hidden">
                <div className="ticker-track h-full items-center">
                  {[...tickerItems, ...tickerItems].map((item, i) => (
                    <div
                      key={`${i < tickerItems.length ? "a" : "b"}-${item.name}`}
                      className="flex h-full shrink-0 items-center gap-2 px-4"
                    >
                      <span className="retro-label text-[0.9rem] text-text-secondary">
                        {item.name}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-semibold",
                          item.apy >= 10 ? "text-bull" : "text-text-primary",
                        )}
                      >
                        {item.apy.toFixed(2)}%
                      </span>
                      <span className="retro-label text-[0.8rem] text-text-muted">
                        APY
                      </span>
                      <span className="text-border mx-1.5 text-[11px]">·</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full" aria-hidden="true" />
          )}
        </section>
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
          className="retro-label block border-[2px] border-transparent px-3 py-2 text-[0.95rem] text-text-secondary rounded-none transition-colors hover:border-border/35 hover:bg-surface-hover hover:text-text-primary"
        >
          {title}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
