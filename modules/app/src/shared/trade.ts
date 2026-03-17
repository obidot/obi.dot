export type TradeActionType = "swap" | "limit" | "crosschain";

export const TRADE_ACTIONS: {
  id: TradeActionType;
  label: string;
  description: string;
}[] = [
    {
      id: "swap",
      label: "Swap",
      description: "Instantly buy or sell tokens at superior prices",
    },
    {
      id: "limit",
      label: "Limit Order",
      description: "Buy or sell tokens at customized prices",
    },
    {
      id: "crosschain",
      label: "Cross-Chain",
      description: "Swap between tokens on different chains",
    },
  ];

const DEFAULT_ROUTER_BY_CHAIN: Record<string, string> = {
  "polkadot-hub-testnet": "tdot-to-tusdc",
  "polkadot-hub": "tdot-to-tusdc",
  bnb: "bnb-to-usdt",
  ethereum: "eth-to-usdt",
};

export type ResolvedTradeRoute = {
  trade: TradeActionType;
  chain: string;
  router: string;
  tokenIn: string;
  tokenOut: string;
};

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase();
}

function splitRouter(
  router: string,
): { tokenIn: string; tokenOut: string } | null {
  const [tokenIn, tokenOut] = router.split("-to-");

  if (!tokenIn || !tokenOut) {
    return null;
  }

  return {
    tokenIn: normalizeSegment(tokenIn),
    tokenOut: normalizeSegment(tokenOut),
  };
}

export function isTradeActionType(value: string): value is TradeActionType {
  return TRADE_ACTIONS.some((action) => action.id === value);
}

export function getDefaultRouterForChain(chain: string): string {
  const normalizedChain = normalizeSegment(chain);

  return (
    DEFAULT_ROUTER_BY_CHAIN[normalizedChain] ?? `${normalizedChain}-to-usdt`
  );
}

export function resolveTradeRoute(params: {
  trade: string;
  chain: string;
  router?: string;
}): ResolvedTradeRoute | null {
  const trade = normalizeSegment(params.trade);
  const chain = normalizeSegment(params.chain);

  if (!isTradeActionType(trade) || !chain) {
    return null;
  }

  const router = normalizeSegment(
    params.router ?? getDefaultRouterForChain(chain),
  );
  const pair = splitRouter(router);

  if (!pair) {
    return null;
  }

  return {
    trade,
    chain,
    router,
    tokenIn: pair.tokenIn,
    tokenOut: pair.tokenOut,
  };
}
