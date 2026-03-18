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

const components: { title: string; href: string; description: string }[] = [
  {
    title: "Alert Dialog",
    href: "/docs/primitives/alert-dialog",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
  {
    title: "Hover Card",
    href: "/docs/primitives/hover-card",
    description:
      "For sighted users to preview content available behind a link.",
  },
  {
    title: "Progress",
    href: "/docs/primitives/progress",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
  {
    title: "Scroll-area",
    href: "/docs/primitives/scroll-area",
    description: "Visually or semantically separates content.",
  },
  {
    title: "Tabs",
    href: "/docs/primitives/tabs",
    description:
      "A set of layered sections of content—known as tab panels—that are displayed one at a time.",
  },
  {
    title: "Tooltip",
    href: "/docs/primitives/tooltip",
    description:
      "A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.",
  },
]
