import { notFound, redirect } from "next/navigation";
import { getDefaultRouterForChain, isTradeActionType } from "@/shared/trade";

const DEFAULT_CHAIN = "polkadot-hub-testnet";

type TradePageProps = {
  params: Promise<{
    trade: string;
  }>;
};

export default async function TradePage({ params }: TradePageProps) {
  const { trade } = await params;
  const normalizedTrade = trade.trim().toLowerCase();

  if (!isTradeActionType(normalizedTrade)) {
    notFound();
  }

  const defaultRouter = getDefaultRouterForChain(DEFAULT_CHAIN);
  redirect(`/${normalizedTrade}/${DEFAULT_CHAIN}/${defaultRouter}`);
}
