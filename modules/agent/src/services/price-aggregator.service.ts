import { logger } from "../utils/logger.js";
import type {
  AggregatedPrice,
  SourcePrice,
  PricePairConfig,
} from "../types/oracle.types.js";
import {
  PYTH_HERMES_URL,
  COINGECKO_API_URL,
  COINGECKO_API_KEY,
  BINANCE_API_URL,
  MAX_SOURCE_LATENCY_MS,
  OUTLIER_REJECTION_PERCENT,
  CIRCUIT_BREAKER_PERCENT,
  CIRCUIT_BREAKER_MIN_SOURCES,
  PRICE_CACHE_TTL_MS,
  PRICE_PAIRS,
} from "../config/oracle.config.js";

const aggregatorLog = logger.child({ module: "price-aggregator" });

// ─────────────────────────────────────────────────────────────────────────────
//  Price Cache
// ─────────────────────────────────────────────────────────────────────────────

interface CachedPrice {
  aggregated: AggregatedPrice;
  cachedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PriceAggregator — Multi-Source Price Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches prices from multiple off-chain sources (Pyth Hermes, CoinGecko,
 * Binance), aggregates via median, rejects outliers, and enforces a
 * circuit breaker for large price jumps.
 *
 * Algorithm:
 *   1. Fetch from all sources in parallel
 *   2. Discard sources with > MAX_SOURCE_LATENCY_MS latency
 *   3. Discard outliers (> OUTLIER_REJECTION_PERCENT from median)
 *   4. Take median of remaining sources
 *   5. Validate against last known good price (circuit breaker)
 *   6. Cache result with timestamp
 */
export class PriceAggregator {
  /** Cache of last known good prices per pair. */
  private cache = new Map<string, CachedPrice>();

  /** Last known good prices (for circuit breaker). */
  private lastKnownGood = new Map<string, number>();

  // ─────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get the aggregated price for a given pair.
   * Returns cached value if within TTL.
   *
   * @param pair - The pair identifier (e.g. "DOT/USD").
   * @returns Aggregated price data.
   * @throws If no sources are available and no cache exists.
   */
  async getPrice(pair: string): Promise<AggregatedPrice> {
    // Check cache
    const cached = this.cache.get(pair);
    if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) {
      return cached.aggregated;
    }

    const config = PRICE_PAIRS.find((p) => p.pair === pair);
    if (!config) {
      throw new Error(`Unknown price pair: ${pair}`);
    }

    // Fetch from all sources in parallel
    const sources = await this.fetchAllSources(config);

    // Filter available sources with acceptable latency
    const validSources = sources.filter(
      (s) => s.available && s.latencyMs <= MAX_SOURCE_LATENCY_MS,
    );

    if (validSources.length === 0) {
      // Try to return stale cache if available
      if (cached) {
        aggregatorLog.warn(
          { pair },
          "All sources failed, returning stale cache",
        );
        return cached.aggregated;
      }
      throw new Error(`No price sources available for ${pair}`);
    }

    // Compute median
    const prices = validSources.map((s) => s.price);
    const median = this.computeMedian(prices);

    // Reject outliers
    const filtered = validSources.filter((s) => {
      const deviation = Math.abs((s.price - median) / median) * 100;
      if (deviation > OUTLIER_REJECTION_PERCENT) {
        aggregatorLog.warn(
          { source: s.source, price: s.price, median, deviation },
          "Rejecting outlier price source",
        );
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      throw new Error(
        `All sources were outliers for ${pair} (median: ${median})`,
      );
    }

    // Recompute median from filtered sources
    const finalMedian = this.computeMedian(filtered.map((s) => s.price));

    // Circuit breaker: check against last known good
    const lastGood = this.lastKnownGood.get(pair);
    let confidence = Math.min(filtered.length * 33, 100);

    if (lastGood !== undefined) {
      const jumpPercent = Math.abs((finalMedian - lastGood) / lastGood) * 100;
      if (jumpPercent > CIRCUIT_BREAKER_PERCENT) {
        if (filtered.length < CIRCUIT_BREAKER_MIN_SOURCES) {
          aggregatorLog.error(
            {
              pair,
              jump: jumpPercent.toFixed(2),
              sources: filtered.length,
              required: CIRCUIT_BREAKER_MIN_SOURCES,
            },
            "Circuit breaker: large price jump with insufficient sources",
          );
          // Return last known good from cache
          if (cached) return cached.aggregated;
          throw new Error(
            `Circuit breaker triggered for ${pair}: ${jumpPercent.toFixed(1)}% jump with only ${filtered.length} source(s)`,
          );
        }
        aggregatorLog.warn(
          { pair, jump: jumpPercent.toFixed(2), sources: filtered.length },
          "Large price jump accepted (sufficient sources agree)",
        );
        // Reduce confidence for large jumps
        confidence = Math.max(confidence - 20, 10);
      }
    }

    // Convert median to on-chain representation
    const scaledPrice = BigInt(
      Math.round(finalMedian * 10 ** config.oracleDecimals),
    );

    const result: AggregatedPrice = {
      price: scaledPrice,
      decimals: config.oracleDecimals,
      confidence,
      sources,
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Update cache and last known good
    this.cache.set(pair, { aggregated: result, cachedAt: Date.now() });
    this.lastKnownGood.set(pair, finalMedian);

    aggregatorLog.debug(
      {
        pair,
        price: finalMedian,
        scaledPrice: scaledPrice.toString(),
        confidence,
        sources: filtered.map((s) => s.source),
      },
      "Price aggregated",
    );

    return result;
  }

  /**
   * Get prices for all configured pairs.
   */
  async getAllPrices(): Promise<Map<string, AggregatedPrice>> {
    const results = new Map<string, AggregatedPrice>();

    for (const config of PRICE_PAIRS) {
      try {
        const price = await this.getPrice(config.pair);
        results.set(config.pair, price);
      } catch (err) {
        aggregatorLog.error(
          { pair: config.pair, err },
          "Failed to fetch price",
        );
      }
    }

    return results;
  }

  /**
   * Clear the price cache (useful for testing or forced refresh).
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Source Fetchers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch from all configured sources in parallel.
   */
  private async fetchAllSources(
    config: PricePairConfig,
  ): Promise<SourcePrice[]> {
    const fetchers: Promise<SourcePrice>[] = [];

    if (config.pythFeedId) {
      fetchers.push(this.fetchPyth(config.pythFeedId));
    }
    if (config.coingeckoId) {
      fetchers.push(this.fetchCoinGecko(config.coingeckoId));
    }
    if (config.binanceSymbol) {
      fetchers.push(this.fetchBinance(config.binanceSymbol));
    }
    if (config.subsquidEndpoint) {
      fetchers.push(this.fetchSubsquid(config.subsquidEndpoint, config.pair));
    }

    return Promise.all(fetchers);
  }

  /**
   * Fetch price from Pyth Hermes API.
   */
  private async fetchPyth(feedId: string): Promise<SourcePrice> {
    const start = Date.now();
    try {
      const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(MAX_SOURCE_LATENCY_MS),
      });

      if (!response.ok) {
        throw new Error(`Pyth HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        parsed: Array<{
          price: { price: string; expo: number; conf: string };
        }>;
      };

      const priceEntry = data.parsed?.[0]?.price;
      if (!priceEntry) throw new Error("No price data in Pyth response");

      const price = Number(priceEntry.price) * Math.pow(10, priceEntry.expo);

      return {
        source: "pyth",
        price,
        updatedAt: Math.floor(Date.now() / 1000),
        available: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      aggregatorLog.debug({ feedId, err }, "Pyth fetch failed");
      return {
        source: "pyth",
        price: 0,
        updatedAt: 0,
        available: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Fetch price from CoinGecko API.
   */
  private async fetchCoinGecko(tokenId: string): Promise<SourcePrice> {
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (COINGECKO_API_KEY) {
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY;
      }

      const url = `${COINGECKO_API_URL}/simple/price?ids=${tokenId}&vs_currencies=usd&precision=8`;
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(MAX_SOURCE_LATENCY_MS),
      });

      if (!response.ok) {
        throw new Error(`CoinGecko HTTP ${response.status}`);
      }

      const data = (await response.json()) as Record<string, { usd: number }>;
      const price = data[tokenId]?.usd;

      if (price === undefined) {
        throw new Error(`No price data for ${tokenId}`);
      }

      return {
        source: "coingecko",
        price,
        updatedAt: Math.floor(Date.now() / 1000),
        available: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      aggregatorLog.debug({ tokenId, err }, "CoinGecko fetch failed");
      return {
        source: "coingecko",
        price: 0,
        updatedAt: 0,
        available: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Fetch price from Binance API.
   */
  private async fetchBinance(symbol: string): Promise<SourcePrice> {
    const start = Date.now();
    try {
      const url = `${BINANCE_API_URL}/api/v3/ticker/price?symbol=${symbol}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(MAX_SOURCE_LATENCY_MS),
      });

      if (!response.ok) {
        throw new Error(`Binance HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        symbol: string;
        price: string;
      };
      const price = parseFloat(data.price);

      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price from Binance: ${data.price}`);
      }

      return {
        source: "binance",
        price,
        updatedAt: Math.floor(Date.now() / 1000),
        available: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      aggregatorLog.debug({ symbol, err }, "Binance fetch failed");
      return {
        source: "binance",
        price: 0,
        updatedAt: 0,
        available: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Fetch price from Subsquid/SubQuery — Polkadot-native price source.
   *
   * Queries the Subsquid GraphQL API for the latest price data indexed
   * directly from Polkadot/Substrate chain events. This provides a
   * decentralized, Polkadot-native price feed that does not depend on
   * centralized exchange APIs.
   *
   * Falls back gracefully if the Subsquid endpoint is unavailable.
   */
  private async fetchSubsquid(
    endpoint: string,
    pair: string,
  ): Promise<SourcePrice> {
    const start = Date.now();
    try {
      // Extract token name from pair (e.g., "DOT/USD" → "DOT")
      const token = pair.split("/")[0].toLowerCase();

      // Subsquid GraphQL query for latest price data
      // This query works with common Subsquid price indexers
      const query = `{
        prices(limit: 1, orderBy: timestamp_DESC, where: {symbol_eq: "${token.toUpperCase()}"}) {
          price
          timestamp
          symbol
        }
      }`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(MAX_SOURCE_LATENCY_MS),
      });

      if (!response.ok) {
        throw new Error(`Subsquid HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        data?: {
          prices?: Array<{
            price: string;
            timestamp: string;
            symbol: string;
          }>;
        };
      };

      const priceEntry = data.data?.prices?.[0];
      if (!priceEntry) {
        throw new Error("No price data from Subsquid");
      }

      const price = parseFloat(priceEntry.price);
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid Subsquid price: ${priceEntry.price}`);
      }

      const updatedAt = priceEntry.timestamp
        ? Math.floor(new Date(priceEntry.timestamp).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      return {
        source: "subsquid",
        price,
        updatedAt,
        available: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      aggregatorLog.debug({ endpoint, pair, err }, "Subsquid fetch failed");
      return {
        source: "subsquid",
        price: 0,
        updatedAt: 0,
        available: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Math Utilities
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Compute the median of a number array.
   */
  private computeMedian(values: number[]): number {
    if (values.length === 0) {
      throw new Error("Cannot compute median of empty array");
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }
}
