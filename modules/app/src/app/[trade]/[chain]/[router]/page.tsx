import React from "react";
import { notFound } from "next/navigation";
import { resolveTradeRoute } from "@/shared/trade";
import TradePage from "@/components/trade/trade-page";

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
