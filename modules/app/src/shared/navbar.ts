import { TradeActionType } from "@/types";

export type NavHrefContext = {
  tradeAction: TradeActionType;
  currentChain: string;
};

export type NavItem = {
  label: string;
  href: string | ((context: NavHrefContext) => string);
  children?: NavItem[];
  visibleOnChainId?: number;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Trade",
    href: ({ tradeAction, currentChain }) => `/${tradeAction}/${currentChain}`,
    children: [
      { label: "Swap", href: "/swap" },
      { label: "Limit Orders", href: "/limit" },
      { label: "Cross-Chain", href: "/cross-chain" },
    ],
  },
  { label: "Yields", href: "/yields" },
  { label: "Strategies", href: "/strategies" },
  { label: "Cross-Chain", href: "/crosschain" },
  { label: "Insights", href: "/insights" },
  { label: "Agent", href: "/agent" },
  { label: "Faucet", href: "/faucet", visibleOnChainId: 420420417 },
  { label: "Dashboard", href: "/" },
];
