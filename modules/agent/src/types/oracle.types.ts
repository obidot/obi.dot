import type { Address } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
//  Oracle Price Data Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw price data returned from an oracle read.
 */
export interface PriceData {
  /** The price value (scaled by oracle decimals). */
  price: bigint;
  /** Number of decimals in the price (e.g. 8 for USD feeds). */
  decimals: number;
  /** Timestamp when the price was last updated (unix seconds). */
  updatedAt: number;
  /** Whether the price is considered stale (beyond heartbeat). */
  isStale: boolean;
}

/**
 * Aggregated price from multiple sources.
 */
export interface AggregatedPrice {
  /** The median price across sources. */
  price: bigint;
  /** Number of decimals in the price. */
  decimals: number;
  /** Confidence score (0-100) based on source agreement. */
  confidence: number;
  /** Individual source prices used in aggregation. */
  sources: SourcePrice[];
  /** Timestamp when this aggregation was computed. */
  timestamp: number;
}

/**
 * Price from a single data source.
 */
export interface SourcePrice {
  /** Source identifier (e.g. "pyth", "coingecko", "binance"). */
  source: PriceSourceId;
  /** The raw price value (human-readable, e.g. 7.0). */
  price: number;
  /** Timestamp when this source last updated. */
  updatedAt: number;
  /** Whether this source was reachable. */
  available: boolean;
  /** Latency in milliseconds for the fetch. */
  latencyMs: number;
}

/**
 * Supported price source identifiers.
 */
export type PriceSourceId = "pyth" | "coingecko" | "binance" | "subsquid";

// ─────────────────────────────────────────────────────────────────────────────
//  Oracle Feed Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status of a single on-chain oracle feed.
 */
export interface FeedStatus {
  /** The ERC-20 asset address. */
  asset: Address;
  /** The oracle contract address. */
  oracle: Address;
  /** Human-readable asset description (e.g. "DOT / USD"). */
  description: string;
  /** Current on-chain price. */
  price: bigint;
  /** Number of decimals. */
  decimals: number;
  /** Timestamp of last update. */
  updatedAt: number;
  /** Configured heartbeat in seconds. */
  heartbeat: number;
  /** Whether the feed is currently stale. */
  isStale: boolean;
  /** Whether the feed is active. */
  active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Price Update Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A price update to push on-chain.
 */
export interface PriceUpdate {
  /** The asset whose oracle should be updated. */
  asset: Address;
  /** The new price (scaled by oracle decimals). */
  price: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Price Pair Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a supported price pair.
 */
export interface PricePairConfig {
  /** Pair identifier (e.g. "DOT/USD"). */
  pair: string;
  /** The ERC-20 asset address (on Polkadot Hub). */
  asset: Address;
  /** Pyth price feed ID (hex string). */
  pythFeedId?: string;
  /** CoinGecko token ID (e.g. "polkadot"). */
  coingeckoId?: string;
  /** Binance trading symbol (e.g. "DOTUSDT"). */
  binanceSymbol?: string;
  /** Subsquid/SubQuery GraphQL endpoint for Polkadot-native price data. */
  subsquidEndpoint?: string;
  /** Number of decimals for the on-chain oracle (e.g. 8). */
  oracleDecimals: number;
}

/**
 * Oracle health check result.
 */
export interface OracleHealthStatus {
  /** Whether all critical feeds are healthy. */
  healthy: boolean;
  /** Individual feed statuses. */
  feeds: FeedStatus[];
  /** Timestamp of this health check. */
  checkedAt: number;
  /** Warning messages (e.g. feeds approaching staleness). */
  warnings: string[];
}
