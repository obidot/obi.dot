"use client";

import { ChevronDownIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { AssetIcon } from "@/components/ui/asset-icon";
import { useYields } from "@/hooks/use-yields";
import { resolveChainAssetId } from "@/lib/asset-registry";
import { cn } from "@/lib/format";
import { NAV_ITEMS, type NavItem } from "@/shared/navbar";
import { isTradeActionType } from "@/shared/trade";
import type { TradeActionType } from "@/types";

const CustomConnectButton = dynamic(() => import("./custom-connect-button"), {
  ssr: false,
});

function toChainSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export default function Navbar() {
  const pathname = usePathname();
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
  const activeChainAssetId = resolveChainAssetId(chain?.name ?? currentChain);

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
    <header className="sticky top-0 z-50 border-b-[3px] border-border bg-background shadow-[0_3px_0_0_var(--border)]">
      {/* Primary accent stripe */}
      <div className="h-[3px] bg-primary w-full" aria-hidden="true" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 lg:px-6">
        <nav
          aria-label="Main navigation"
          className="relative z-30 flex min-h-14 items-center gap-3"
        >
          <Link
            href="/swap/polkadot-hub-testnet"
            className={cn(
              "flex shrink-0 items-center gap-3",
              "transition-transform duration-150 hover:-translate-y-0.5",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center border-[3px] border-border bg-primary shadow-[3px_3px_0_0_var(--border)]">
              <AssetIcon
                assetId="brand.obidot.light"
                size="lg"
                variant="bare"
                decorative={false}
                alt="Obidot Logo"
                className="rounded-none"
                imageClassName="scale-[1.14]"
                priority
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

          <ul className="relative z-40 hidden min-h-10 items-center gap-1 lg:flex">
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
                  <li key={item.label} className="group/trade relative">
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(linkClass, "gap-1.5 pr-2")}
                    >
                      <span>{item.label}</span>
                      <ChevronDownIcon
                        className="size-3 transition-transform duration-150 group-hover/trade:rotate-180 group-focus-within/trade:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>

                    <div
                      className={cn(
                        "pointer-events-none invisible absolute left-0 top-full z-[120] mt-2 w-[230px] opacity-0 transition-all duration-150",
                        "group-hover/trade:pointer-events-auto group-hover/trade:visible group-hover/trade:opacity-100",
                        "group-focus-within/trade:pointer-events-auto group-focus-within/trade:visible group-focus-within/trade:opacity-100",
                      )}
                    >
                      <div
                        className="isolate border-[3px] border-border p-2 shadow-[4px_4px_0_0_var(--border)]"
                        style={{ backgroundColor: "var(--popover)" }}
                      >
                        <ul className="space-y-1">
                          {item.children.map((child) => (
                            <li key={child.label}>
                              <Link
                                href={resolveHref(child)}
                                className="retro-label block border-[2px] border-transparent px-3 py-2 text-[0.95rem] text-text-secondary rounded-none transition-colors hover:border-border/35 hover:bg-surface-hover hover:text-text-primary"
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={linkClass}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <span className="pill bg-primary text-primary-foreground">
                Live
              </span>
              <span className="pill gap-2 bg-surface-alt text-text-secondary">
                <AssetIcon
                  assetId={activeChainAssetId}
                  size="xs"
                  variant="bare"
                  className="rounded-full"
                />
                {chain?.name ?? "Polkadot Hub TestNet"}
              </span>
            </div>
            <CustomConnectButton />
          </div>
        </nav>

        <section
          className="panel relative z-10 flex h-10 items-center overflow-hidden border-[3px] border-border bg-surface px-0"
          aria-label="Live yield ticker"
        >
          {tickerItems.length > 0 ? (
            <div className="flex h-full items-center px-4">
              <div className="retro-label mr-3 flex shrink-0 items-center gap-2 border-r-2 border-border pr-3 text-[0.95rem] text-text-secondary">
                <AssetIcon assetId="protocol.xcm" size="xs" variant="bare" />
                <span>Yield Tape</span>
              </div>
              <div className="ticker-fade flex h-full min-w-0 flex-1 overflow-hidden">
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
