import React from "react";
import { notFound, redirect } from "next/navigation";
import { resolveTradeRoute, getDefaultRouterForChain } from "@/shared/trade";

type ChainPageProps = {
  params: Promise<{
    trade: string;
    chain: string;
  }>;
};

export default async function ChainPage({ params }: ChainPageProps) {
  const { trade, chain } = await params;
  const route = resolveTradeRoute({ trade, chain });

  if (!route) {
    notFound();
  }

  const defaultRouter = getDefaultRouterForChain(chain);
  redirect(`/${route.trade}/${route.chain}/${defaultRouter}`);
}
