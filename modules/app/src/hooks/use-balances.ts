"use client";

import { useMemo } from "react";
import { type Address, formatUnits } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { ORACLE_REGISTRY_ABI } from "@/lib/abi";
import { CONTRACTS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/format";
import { TOKENS } from "@/shared/trade/swap";
import type { SwapToken } from "@/types";

const FALLBACK_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const USD_SYMBOLS = new Set(["tUSDC", "USDC"]);
const USD_QUOTE_TOKEN =
  TOKENS.find((token) => USD_SYMBOLS.has(token.symbol)) ?? null;
const DOT_PRICE_PROXY = TOKENS.find((token) => token.symbol === "tDOT") ?? null;
const ORACLE_REGISTRY_ADDRESS = CONTRACTS.ORACLE_REGISTRY as Address;

export interface TokenBalanceView {
  token: SwapToken;
  balance: bigint;
  formatted: string;
  numeric: number | null;
  display: string;
  usdUnitPrice: number | null;
  usdValue: number | null;
  usdDisplay: string | null;
  isLoading: boolean;
}

export interface NativeBalanceView {
  symbol: string;
  balance: bigint;
  formatted: string | null;
  numeric: number | null;
  display: string | null;
  usdUnitPrice: number | null;
  usdValue: number | null;
  usdDisplay: string | null;
  isLoading: boolean;
}

function formatUsdDisplay(value: number | null) {
  if (!Number.isFinite(value) || value === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

function toNumericBalance(balance: bigint, decimals: number) {
  const numeric = Number(formatUnits(balance, decimals));
  return Number.isFinite(numeric) ? numeric : null;
}

function toUsdUnitPrice(price: bigint, oracleDecimals: number) {
  const numeric = Number(formatUnits(price, oracleDecimals));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function useSwapBalances(tokenIn: SwapToken, tokenOut: SwapToken) {
  const { address, isConnected } = useAccount();
  const balanceAddress = address ?? FALLBACK_ADDRESS;
  const oraclePriceTargets = useMemo(() => {
    const targets = TOKENS.filter((token) => !USD_SYMBOLS.has(token.symbol));
    if (
      DOT_PRICE_PROXY &&
      !targets.some(
        (token) =>
          token.address.toLowerCase() === DOT_PRICE_PROXY.address.toLowerCase(),
      )
    ) {
      targets.push(DOT_PRICE_PROXY);
    }
    return targets;
  }, []);

  const { data: nativeBalanceData, isLoading: nativeBalanceLoading } =
    useBalance({
      address,
      query: { enabled: isConnected && !!address },
    });

  const { data: tokenBalanceResults, isLoading: tokenBalancesLoading } =
    useReadContracts({
      contracts: TOKENS.map((token) => ({
        address: token.address as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [balanceAddress],
      })),
      query: {
        enabled: isConnected && !!address,
      },
    });

  const { data: oraclePriceResults, isLoading: oraclePricesLoading } =
    useReadContracts({
      allowFailure: true,
      contracts: oraclePriceTargets.map((token) => ({
        address: ORACLE_REGISTRY_ADDRESS,
        abi: ORACLE_REGISTRY_ABI,
        functionName: "getPriceStrict",
        args: [token.address as Address],
      })),
    });

  const oracleUsdByAddress = useMemo(() => {
    const prices = new Map<string, number | null>();

    if (USD_QUOTE_TOKEN) {
      prices.set(USD_QUOTE_TOKEN.address.toLowerCase(), 1);
    }

    oraclePriceTargets.forEach((token, index) => {
      const result = oraclePriceResults?.[index];
      if (result?.status !== "success") {
        prices.set(token.address.toLowerCase(), null);
        return;
      }

      const [price, oracleDecimals] = result.result as readonly [
        bigint,
        number,
        bigint,
      ];
      prices.set(
        token.address.toLowerCase(),
        toUsdUnitPrice(price, oracleDecimals),
      );
    });

    return prices;
  }, [oraclePriceResults, oraclePriceTargets]);

  const tokenBalances = useMemo<TokenBalanceView[]>(() => {
    return TOKENS.map((token, index) => {
      const result = tokenBalanceResults?.[index];
      const balance =
        result?.status === "success" ? (result.result as bigint) : 0n;
      const numeric = toNumericBalance(balance, token.decimals);
      const usdUnitPrice = USD_SYMBOLS.has(token.symbol)
        ? 1
        : (oracleUsdByAddress.get(token.address.toLowerCase()) ?? null);
      const usdValue =
        numeric !== null && usdUnitPrice !== null
          ? numeric * usdUnitPrice
          : null;
      return {
        token,
        balance,
        formatted: formatUnits(balance, token.decimals),
        numeric,
        display: `${formatTokenAmount(balance.toString(), token.decimals, 4)} ${token.symbol}`,
        usdUnitPrice,
        usdValue,
        usdDisplay: formatUsdDisplay(usdValue),
        isLoading: tokenBalancesLoading || oraclePricesLoading,
      };
    });
  }, [
    oraclePricesLoading,
    oracleUsdByAddress,
    tokenBalanceResults,
    tokenBalancesLoading,
  ]);

  const tokenBalanceMap = useMemo(
    () =>
      new Map(
        tokenBalances.map((balance) => [
          balance.token.address.toLowerCase(),
          balance,
        ]),
      ),
    [tokenBalances],
  );
  const inputBalance = tokenBalanceMap.get(tokenIn.address.toLowerCase()) ?? {
    token: tokenIn,
    balance: 0n,
    formatted: "0",
    numeric: 0,
    display: `0 ${tokenIn.symbol}`,
    usdUnitPrice: null,
    usdValue: null,
    usdDisplay: null,
    isLoading: tokenBalancesLoading || oraclePricesLoading,
  };

  const outputBalance = tokenBalanceMap.get(tokenOut.address.toLowerCase()) ?? {
    token: tokenOut,
    balance: 0n,
    formatted: "0",
    numeric: 0,
    display: `0 ${tokenOut.symbol}`,
    usdUnitPrice: null,
    usdValue: null,
    usdDisplay: null,
    isLoading: tokenBalancesLoading || oraclePricesLoading,
  };

  const nativeNumeric =
    nativeBalanceData !== undefined
      ? toNumericBalance(nativeBalanceData.value, nativeBalanceData.decimals)
      : null;
  const nativeUsdUnitPrice =
    (DOT_PRICE_PROXY
      ? oracleUsdByAddress.get(DOT_PRICE_PROXY.address.toLowerCase())
      : null) ?? null;
  const nativeUsdValue =
    nativeNumeric !== null && nativeUsdUnitPrice !== null
      ? nativeNumeric * nativeUsdUnitPrice
      : null;

  const nativeBalance: NativeBalanceView = {
    symbol: nativeBalanceData?.symbol ?? "DOT",
    balance: nativeBalanceData?.value ?? 0n,
    formatted:
      nativeBalanceData !== undefined
        ? formatUnits(nativeBalanceData.value, nativeBalanceData.decimals)
        : null,
    numeric: nativeNumeric,
    display:
      nativeBalanceData !== undefined
        ? `${formatTokenAmount(nativeBalanceData.value.toString(), nativeBalanceData.decimals, 4)} ${nativeBalanceData.symbol}`
        : null,
    usdUnitPrice: nativeUsdUnitPrice,
    usdValue: nativeUsdValue,
    usdDisplay: formatUsdDisplay(nativeUsdValue),
    isLoading: nativeBalanceLoading || oraclePricesLoading,
  };

  return {
    tokenBalances,
    inputBalance,
    outputBalance,
    nativeBalance,
  };
}
