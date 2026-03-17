import type { TradeActionType } from "./trade";

export type NavHrefContext = {
  tradeAction: TradeActionType;
  currentChain: string;
};

export type NavItem = {
  label: string;
  href: string | ((context: NavHrefContext) => string);
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Trade",
    href: ({ tradeAction, currentChain }) => `/${tradeAction}/${currentChain}`,
  },
  { label: "Yields", href: "/yields" },
  { label: "Strategies", href: "/strategies" },
  { label: "Cross-Chain", href: "/crosschain" },
  { label: "Insights", href: "/insights" },
  { label: "Agent", href: "/agent" },
  { label: "Dashboard", href: "/" },
];
