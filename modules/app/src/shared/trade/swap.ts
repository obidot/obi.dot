import { CONTRACTS } from "@/lib/constants";
import type { SwapToken } from "@/types";

export const TOKENS: SwapToken[] = [
  {
    address: CONTRACTS.TEST_DOT,
    symbol: "tDOT",
    name: "Test DOT",
    decimals: 18,
  },
  {
    address: CONTRACTS.TEST_USDC,
    symbol: "tUSDC",
    name: "Test USDC",
    decimals: 18,
  },
  {
    address: CONTRACTS.TEST_ETH,
    symbol: "tETH",
    name: "Test ETH",
    decimals: 18,
  },
  {
    address: CONTRACTS.TEST_TKA,
    symbol: "TKA",
    name: "Test Token A",
    decimals: 18,
  },
  {
    address: CONTRACTS.TEST_TKB,
    symbol: "TKB",
    name: "Test Token B",
    decimals: 18,
  },
];

export const TOKEN_COLORS: Record<string, { circle: string; text: string }> = {
  tDOT: { circle: "bg-primary/20", text: "text-primary" },
  tUSDC: { circle: "bg-accent/20", text: "text-accent" },
  tETH: { circle: "bg-secondary/20", text: "text-secondary" },
};

export function tokenColor(symbol: string) {
  return (
    TOKEN_COLORS[symbol] ?? {
      circle: "bg-surface-hover",
      text: "text-text-secondary",
    }
  );
}
