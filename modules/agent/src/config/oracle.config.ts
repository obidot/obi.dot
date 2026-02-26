import type { Address } from "viem";
import type { PricePairConfig } from "../types/oracle.types.js";
import { env } from "./env.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Oracle Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** KeeperOracle contract address (from env). */
export const KEEPER_ORACLE_ADDRESS = (env.KEEPER_ORACLE_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** OracleRegistry contract address (from env, optional). */
export const ORACLE_REGISTRY_ADDRESS = (env.ORACLE_REGISTRY_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** Heartbeat monitor interval in milliseconds (default: 30 min). */
export const ORACLE_HEARTBEAT_MS = env.ORACLE_HEARTBEAT_MS ?? 1_800_000;

/** Deviation threshold in basis points (default: 1%). */
export const ORACLE_DEVIATION_BPS = env.ORACLE_DEVIATION_BPS ?? 100;

/** Oracle staleness threshold in seconds (matches vault constant). */
export const ORACLE_STALENESS_THRESHOLD = 3600;

/** Staleness warning threshold as fraction of heartbeat (0.8 = 80%). */
export const STALENESS_WARNING_RATIO = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
//  Price Source URLs
// ─────────────────────────────────────────────────────────────────────────────

/** Pyth Hermes REST API base URL. */
export const PYTH_HERMES_URL =
  env.PYTH_HERMES_URL ?? "https://hermes.pyth.network";

/** CoinGecko API base URL. */
export const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";

/** CoinGecko API key (optional, for higher rate limits). */
export const COINGECKO_API_KEY = env.COINGECKO_API_KEY;

/** Binance API base URL. */
export const BINANCE_API_URL = env.BINANCE_API_URL ?? "https://api.binance.com";

// ─────────────────────────────────────────────────────────────────────────────
//  Price Aggregation Parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum latency for a price source fetch (ms). Sources slower than this are discarded. */
export const MAX_SOURCE_LATENCY_MS = 5_000;

/** Outlier rejection threshold: sources deviating > this % from median are dropped. */
export const OUTLIER_REJECTION_PERCENT = 2.0;

/** Circuit breaker: price jumps > this % from last known good require 2+ sources. */
export const CIRCUIT_BREAKER_PERCENT = 10.0;

/** Minimum sources required when circuit breaker triggers. */
export const CIRCUIT_BREAKER_MIN_SOURCES = 2;

/** Price cache TTL in milliseconds. */
export const PRICE_CACHE_TTL_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
//  Supported Price Pairs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All supported price pairs with their source configurations.
 * Update this registry when adding new assets to the oracle system.
 */
export const PRICE_PAIRS: PricePairConfig[] = [
  {
    pair: "DOT/USD",
    asset: env.ASSET_ADDRESS as Address,
    pythFeedId:
      env.PYTH_DOT_USD_FEED_ID ??
      "0xef2c98c804ba503c6a707e38be4dfbb16683775f195b091252bf24693042fd52",
    coingeckoId: "polkadot",
    binanceSymbol: "DOTUSDT",
    subsquidEndpoint: "https://squid.subsquid.io/polkadot-balances/graphql",
    oracleDecimals: 8,
  },
  // Future feeds can be added here:
  // {
  //   pair: "BNC/USD",
  //   asset: "0x..." as Address,
  //   coingeckoId: "bifrost-native-coin",
  //   binanceSymbol: "BNCUSDT",
  //   subsquidEndpoint: "https://squid.subsquid.io/bifrost-balances/graphql",
  //   oracleDecimals: 8,
  // },
  // {
  //   pair: "KSM/USD",
  //   asset: "0x..." as Address,
  //   coingeckoId: "kusama",
  //   binanceSymbol: "KSMUSDT",
  //   subsquidEndpoint: "https://squid.subsquid.io/kusama-balances/graphql",
  //   oracleDecimals: 8,
  // },
];

// ─────────────────────────────────────────────────────────────────────────────
//  KeeperOracle ABI
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for KeeperOracle read/write via agent. */
export const KEEPER_ORACLE_ABI = [
  // ── Read Functions ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestRoundDataStrict",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoundData",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "description",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "heartbeat",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentRoundId",
    inputs: [],
    outputs: [{ name: "", type: "uint80" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestAnswer",
    inputs: [],
    outputs: [{ name: "", type: "int256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "latestTimestamp",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isStale",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deviationThresholdBps",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxDeviationBps",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "roundUpdater",
    inputs: [{ name: "_roundId", type: "uint80" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "oldestAvailableRound",
    inputs: [],
    outputs: [{ name: "", type: "uint80" }],
    stateMutability: "view",
  },
  // ── Write Functions ────────────────────────────────────────────────────
  {
    type: "function",
    name: "updatePrice",
    inputs: [{ name: "answer", type: "int256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "forceUpdatePrice",
    inputs: [{ name: "answer", type: "int256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Errors ─────────────────────────────────────────────────────────────
  {
    type: "error",
    name: "InvalidPrice",
    inputs: [{ name: "price", type: "int256" }],
  },
  {
    type: "error",
    name: "UpdateNotNeeded",
    inputs: [],
  },
  {
    type: "error",
    name: "DeviationTooLarge",
    inputs: [
      { name: "deviation", type: "uint256" },
      { name: "maxDeviation", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "OracleStale",
    inputs: [],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  OracleRegistry ABI
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for OracleRegistry read via agent. */
export const ORACLE_REGISTRY_ABI = [
  {
    type: "function",
    name: "getPrice",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "price", type: "int256" },
      { name: "oracleDecimals", type: "uint8" },
      { name: "updatedAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isFeedStale",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "stale", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasFeed",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feedCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllRegisteredAssets",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "validateSlippage",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "minReturn", type: "uint256" },
      { name: "maxSlippageBps", type: "uint16" },
    ],
    outputs: [
      { name: "valid", type: "bool" },
      { name: "oracleMinimum", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feeds",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "oracle", type: "address" },
      { name: "heartbeat", type: "uint256" },
      { name: "deviationBps", type: "uint16" },
      { name: "active", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;
