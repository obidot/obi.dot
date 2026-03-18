import { useMemo } from "react";
import { parseUnits, formatUnits } from "viem";
import { useRouteFinder } from "./use-swap";
import type { SwapToken } from "@/types";

export function useMarketPrice(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
): { price: string | null; isLoading: boolean } {
  const amountIn = useMemo(
    () => parseUnits("1", tokenIn.decimals).toString(),
    [tokenIn.decimals],
  );

  const { routes, isLoading } = useRouteFinder({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn,
  });

  const price = useMemo(() => {
    const locals = routes.filter(
      (r) => r.routeType === "local" && r.amountOut !== "0" && /^\d+$/.test(r.amountOut),
    );
    if (locals.length === 0) return null;
    try {
      const best = locals.reduce((a, b) =>
        BigInt(a.amountOut) >= BigInt(b.amountOut) ? a : b,
      );
      return formatUnits(BigInt(best.amountOut), tokenOut.decimals);
    } catch {
      return null;
    }
  }, [routes, tokenOut.decimals]);

  return { price, isLoading };
}
