import { notFound } from "next/navigation";
import TradePage from "@/components/trade/trade-page";
import { resolveTradeRoute } from "@/shared/trade";

type RouterPageProps = {
  params: Promise<{
    trade: string;
    chain: string;
    router: string;
  }>;
};

export default async function RouterPage({ params }: RouterPageProps) {
  const route = resolveTradeRoute(await params);

  if (!route) {
    notFound();
  }

  return <TradePage />;
}
