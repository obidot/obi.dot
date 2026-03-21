import { type Chain, createPublicClient, http } from "viem";
import {
  BIFROST_PROTOCOLS,
  CHAIN_ID,
  KNOWN_PARACHAINS,
  RPC_URL,
  UV2_PAIR_ABI,
  UV2_PAIRS,
} from "../config/constants.js";
import type {
  BifrostYield,
  ProtocolYield,
  UniswapV2Yield,
} from "../types/index.js";
import { BifrostCurrencyId } from "../types/index.js";
import { yieldLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Constants for UniswapV2 yield fetching
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed DOT price estimate used for UV2 TVL calculation (clearly labeled as est. in UI). */
const DOT_PRICE_USD = 8.0;

const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

// ─────────────────────────────────────────────────────────────────────────────
//  YieldService — Market Data Aggregator (Real + Fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches DeFi yield data from real external sources with graceful
 * fallback to simulated data when APIs are unreachable.
 *
 * Data sources:
 *   - DeFiLlama TVL API: per-protocol TVL via `api.llama.fi/tvl/{slug}` (~700ms)
 *   - Simulation fallback: sine-wave mock APYs when live sources fail
 *
 * Note: DeFiLlama's bulk `/pools` endpoint (~12 MB) is intentionally not used —
 * it has no server-side filtering and times out reliably. The per-slug TVL
 * endpoint is fast, small, and returns exactly what we need.
 */
export class YieldService {
  // ── API Endpoints ──────────────────────────────────────────────────────
  private static readonly DEFILLAMA_TVL_URL = "https://api.llama.fi/tvl";
  private static readonly FETCH_TIMEOUT_MS = 8_000;

  // ── Cache ──────────────────────────────────────────────────────────────
  private static readonly CACHE_TTL_MS = 300_000; // 5 minutes — TVL changes slowly
  private cachedTvlData: {
    hydration: number | null;
    bifrost: number | null;
    fetchedAt: number;
  } | null = null;

  /** Fallback APY ranges for simulation when APIs fail. */
  private static readonly APY_RANGES: Record<string, [number, number]> = {
    Hydration: [4.0, 12.0],
    Bifrost: [6.0, 9.5],
    "Bifrost-SLP-vDOT": [7.0, 11.0],
    "Bifrost-SLP-vKSM": [5.5, 8.5],
    "Bifrost-DEX-DOT-vDOT": [8.0, 18.0],
    "Bifrost-DEX-BNC-DOT": [12.0, 25.0],
    "Bifrost-Farm-DOT-vDOT": [15.0, 35.0],
    "Bifrost-Farm-BNC-DOT": [20.0, 45.0],
    "Bifrost-SALP": [3.0, 6.0],
    UniswapV2: [3.0, 15.0],
  };

  // ─────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch current APY data for all tracked protocols.
   *
   * TVL is sourced from DeFiLlama's fast per-slug endpoint. APY always
   * uses simulation (no reliable Polkadot APY feed available).
   *
   * @returns Array of protocol yield data points.
   */
  async fetchYields(): Promise<ProtocolYield[]> {
    yieldLog.info("Fetching yield data for tracked protocols");

    const now = new Date();
    const tvl = await this.fetchProtocolTvls();

    const yields: ProtocolYield[] = [
      {
        name: KNOWN_PARACHAINS.HYDRATION.name,
        paraId: KNOWN_PARACHAINS.HYDRATION.paraId,
        protocol: KNOWN_PARACHAINS.HYDRATION.protocol,
        protocolLabel: "Hydration Omnipool",
        apyPercent: this.simulateApy("Hydration"),
        tvlUsd: tvl.hydration ?? this.simulateTvl(15_000_000, 25_000_000),
        fetchedAt: now,
      },
      {
        name: KNOWN_PARACHAINS.BIFROST.name,
        paraId: KNOWN_PARACHAINS.BIFROST.paraId,
        protocol: KNOWN_PARACHAINS.BIFROST.protocol,
        protocolLabel: "Bifrost",
        apyPercent: this.simulateApy("Bifrost"),
        tvlUsd: tvl.bifrost ?? this.simulateTvl(30_000_000, 50_000_000),
        fetchedAt: now,
      },
    ];

    for (const y of yields) {
      yieldLog.info(
        {
          protocol: y.name,
          paraId: y.paraId,
          apyPercent: y.apyPercent.toFixed(2),
          tvlUsd: y.tvlUsd.toLocaleString(),
          tvlSource:
            tvl.hydration !== null || tvl.bifrost !== null
              ? "defillama-tvl"
              : "simulation",
          apySource: "simulation",
        },
        "Yield data fetched",
      );
    }

    return yields;
  }

  /**
   * Fetch Bifrost-specific yield data for all DeFi products.
   *
   * TVL for liquid staking products is sourced from DeFiLlama's fast
   * per-slug endpoint. All APYs use simulation.
   *
   * @returns Array of Bifrost-specific yield data points.
   */
  async fetchBifrostYields(): Promise<BifrostYield[]> {
    yieldLog.info("Fetching Bifrost-specific yield data");

    const now = new Date();
    const bifrostParaId = KNOWN_PARACHAINS.BIFROST.paraId;
    const tvl = await this.fetchProtocolTvls();

    // Split the total Bifrost TVL heuristically across products
    const bifrostTotalTvl = tvl.bifrost;
    const vDotTvl = bifrostTotalTvl
      ? Math.round(bifrostTotalTvl * 0.6) // ~60% in vDOT SLP
      : this.simulateTvl(80_000_000, 120_000_000);
    const vKsmTvl = bifrostTotalTvl
      ? Math.round(bifrostTotalTvl * 0.2) // ~20% in vKSM SLP
      : this.simulateTvl(20_000_000, 40_000_000);

    const tvlSource = bifrostTotalTvl !== null ? "defillama-tvl" : "simulation";

    yieldLog.info(
      { tvlSource, bifrostTotalTvl, vDotTvl, vKsmTvl },
      "Bifrost TVL resolved",
    );

    const bifrostYields: BifrostYield[] = [
      // ── SLP: Liquid Staking Products ────────────────────────────────
      {
        name: "Bifrost vDOT (Liquid Staking)",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.SLP.protocol,
        protocolLabel: "Bifrost SLP",
        apyPercent: this.simulateApy("Bifrost-SLP-vDOT"),
        tvlUsd: vDotTvl,
        fetchedAt: now,
        category: "SLP",
        currencyIn: BifrostCurrencyId.DOT,
        currencyOut: BifrostCurrencyId.vDOT,
        isActive: true,
      },
      {
        name: "Bifrost vKSM (Liquid Staking)",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.SLP.protocol,
        protocolLabel: "Bifrost SLP",
        apyPercent: this.simulateApy("Bifrost-SLP-vKSM"),
        tvlUsd: vKsmTvl,
        fetchedAt: now,
        category: "SLP",
        currencyIn: BifrostCurrencyId.KSM,
        currencyOut: BifrostCurrencyId.vKSM,
        isActive: true,
      },

      // ── DEX: Zenlink Liquidity Pools ────────────────────────────────
      {
        name: "Bifrost DOT/vDOT Pool",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.DEX.protocol,
        protocolLabel: "Bifrost DEX",
        apyPercent: this.simulateApy("Bifrost-DEX-DOT-vDOT"),
        tvlUsd: this.simulateTvl(5_000_000, 15_000_000),
        fetchedAt: now,
        category: "DEX",
        currencyIn: BifrostCurrencyId.DOT,
        currencyOut: BifrostCurrencyId.vDOT,
        isActive: true,
      },
      {
        name: "Bifrost BNC/DOT Pool",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.DEX.protocol,
        protocolLabel: "Bifrost DEX",
        apyPercent: this.simulateApy("Bifrost-DEX-BNC-DOT"),
        tvlUsd: this.simulateTvl(3_000_000, 8_000_000),
        fetchedAt: now,
        category: "DEX",
        currencyIn: BifrostCurrencyId.BNC,
        currencyOut: BifrostCurrencyId.DOT,
        isActive: true,
      },

      // ── Farming: Yield Farming Pools ────────────────────────────────
      {
        name: "Bifrost DOT/vDOT Farm",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.FARMING.protocol,
        protocolLabel: "Bifrost Farming",
        apyPercent: this.simulateApy("Bifrost-Farm-DOT-vDOT"),
        tvlUsd: this.simulateTvl(2_000_000, 6_000_000),
        fetchedAt: now,
        category: "Farming",
        currencyIn: BifrostCurrencyId.DOT,
        currencyOut: BifrostCurrencyId.vDOT,
        poolId: 0,
        isActive: true,
      },
      {
        name: "Bifrost BNC/DOT Farm",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.FARMING.protocol,
        protocolLabel: "Bifrost Farming",
        apyPercent: this.simulateApy("Bifrost-Farm-BNC-DOT"),
        tvlUsd: this.simulateTvl(1_000_000, 4_000_000),
        fetchedAt: now,
        category: "Farming",
        currencyIn: BifrostCurrencyId.BNC,
        currencyOut: BifrostCurrencyId.DOT,
        poolId: 1,
        isActive: true,
      },

      // ── SALP: Crowdloan Derivatives ─────────────────────────────────
      {
        name: "Bifrost SALP (Crowdloan DOT)",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.SALP.protocol,
        protocolLabel: "Bifrost SALP",
        apyPercent: this.simulateApy("Bifrost-SALP"),
        tvlUsd: this.simulateTvl(10_000_000, 25_000_000),
        fetchedAt: now,
        category: "SALP",
        currencyIn: BifrostCurrencyId.DOT,
        isActive: true,
      },
    ];

    for (const y of bifrostYields) {
      yieldLog.info(
        {
          protocol: y.name,
          category: y.category,
          apyPercent: y.apyPercent.toFixed(2),
          tvlUsd: y.tvlUsd.toLocaleString(),
          isActive: y.isActive,
          apySource: "simulation",
        },
        "Bifrost yield data fetched",
      );
    }

    return bifrostYields;
  }

  /**
   * Fetch yield data for all known UniswapV2 pairs on Polkadot Hub TestNet.
   *
   * Reads on-chain reserves via `getReserves()` and estimates TVL using a
   * fixed DOT price. Falls back to simulated TVL if the RPC call fails.
   *
   * @returns Array of UniswapV2 pair yield data points.
   */
  async fetchUniswapV2Yields(): Promise<UniswapV2Yield[]> {
    yieldLog.info("Fetching Uniswap V2 pair yields");
    const now = new Date();

    const client = createPublicClient({
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    const results = await Promise.allSettled(
      UV2_PAIRS.map(async (pair): Promise<UniswapV2Yield> => {
        try {
          const [reserve0, reserve1] = await client.readContract({
            address: pair.address,
            abi: UV2_PAIR_ABI,
            functionName: "getReserves",
          });
          const totalReserveWei = reserve0 + reserve1;
          // Divide in BigInt first to preserve precision, then convert
          const tvlUsd =
            (Number(totalReserveWei / BigInt(1e15)) / 1e3) * DOT_PRICE_USD;
          return {
            name: pair.label,
            protocolLabel: "UniswapV2",
            protocol: pair.address,
            address: pair.address,
            token0: pair.token0,
            token1: pair.token1,
            reserve0: reserve0.toString(),
            reserve1: reserve1.toString(),
            apyPercent: this.simulateApy("UniswapV2"),
            tvlUsd,
            category: "UniswapV2",
            fetchedAt: now,
          };
        } catch {
          yieldLog.warn(
            { pair: pair.label },
            "Failed to fetch UV2 reserves — using fallback",
          );
          return {
            name: pair.label,
            protocolLabel: "UniswapV2",
            protocol: pair.address,
            address: pair.address,
            token0: pair.token0,
            token1: pair.token1,
            reserve0: "0",
            reserve1: "0",
            apyPercent: this.simulateApy("UniswapV2"),
            tvlUsd: this.simulateTvl(500_000, 5_000_000),
            category: "UniswapV2",
            fetchedAt: now,
          };
        }
      }),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<UniswapV2Yield> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Real Data Fetchers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch TVL for Hydration and Bifrost from DeFiLlama's fast per-slug
   * endpoint (`api.llama.fi/tvl/{slug}`). Runs both requests in parallel.
   * Returns cached data if within TTL. Falls back to null on failure.
   */
  private async fetchProtocolTvls(): Promise<{
    hydration: number | null;
    bifrost: number | null;
  }> {
    // Return cached data if still fresh
    if (
      this.cachedTvlData &&
      Date.now() - this.cachedTvlData.fetchedAt < YieldService.CACHE_TTL_MS
    ) {
      return {
        hydration: this.cachedTvlData.hydration,
        bifrost: this.cachedTvlData.bifrost,
      };
    }

    const fetchTvl = async (slug: string): Promise<number | null> => {
      try {
        const response = await fetch(
          `${YieldService.DEFILLAMA_TVL_URL}/${slug}`,
          {
            signal: AbortSignal.timeout(YieldService.FETCH_TIMEOUT_MS),
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          throw new Error(`DeFiLlama TVL HTTP ${response.status} for ${slug}`);
        }
        const text = await response.text();
        const value = parseFloat(text);
        if (Number.isNaN(value)) {
          throw new Error(
            `DeFiLlama TVL non-numeric response for ${slug}: ${text}`,
          );
        }
        yieldLog.info({ slug, tvlUsd: value }, "DeFiLlama TVL fetched");
        return value;
      } catch (err) {
        yieldLog.warn(
          { err, slug },
          "Failed to fetch DeFiLlama TVL — using fallback",
        );
        return null;
      }
    };

    const [hydrationResult, bifrostResult] = await Promise.allSettled([
      fetchTvl("hydradx"),
      fetchTvl("bifrost-liquid-staking"),
    ]);

    const hydration =
      hydrationResult.status === "fulfilled" ? hydrationResult.value : null;
    const bifrost =
      bifrostResult.status === "fulfilled" ? bifrostResult.value : null;

    this.cachedTvlData = { hydration, bifrost, fetchedAt: Date.now() };
    return { hydration, bifrost };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Simulation Fallbacks
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Simulate a realistic APY value with variance.
   * Used as fallback when real data sources are unavailable.
   */
  private simulateApy(protocol: string): number {
    const range = YieldService.APY_RANGES[protocol];
    if (!range) return 5.0;

    const [min, max] = range;
    const mid = (min + max) / 2;
    const amplitude = (max - min) / 2;

    const periodMs = 30 * 60 * 1000;
    const phase = protocol.includes("Hydration")
      ? 0
      : protocol.includes("SLP")
        ? Math.PI / 4
        : protocol.includes("DEX")
          ? Math.PI / 3
          : protocol.includes("Farm")
            ? Math.PI / 2
            : protocol.includes("SALP")
              ? (2 * Math.PI) / 3
              : Math.PI / 6;
    const t = (Date.now() % periodMs) / periodMs;
    const sine = Math.sin(2 * Math.PI * t + phase);
    const noise = (Math.random() - 0.5) * 0.6;

    const apy = mid + amplitude * sine + noise;
    return Math.max(min, Math.min(max, Number(apy.toFixed(2))));
  }

  /**
   * Simulate a TVL value within a range.
   */
  private simulateTvl(min: number, max: number): number {
    return Math.round(min + Math.random() * (max - min));
  }
}
