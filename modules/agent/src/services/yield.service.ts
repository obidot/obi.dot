import { KNOWN_PARACHAINS, BIFROST_PROTOCOLS } from "../config/constants.js";
import type { ProtocolYield, BifrostYield } from "../types/index.js";
import { BifrostCurrencyId } from "../types/index.js";
import { yieldLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  YieldService — Market Data Aggregator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches DeFi yield data from external sources.
 *
 * For the hackathon demo, this service returns **mock APY data** that
 * simulates realistic yield fluctuations for Hydration Omnipool,
 * Bifrost SLP, DEX, Farming, and SALP products. In production, this
 * would query:
 *   - DeFiLlama API for real-time APYs
 *   - Subsquid indexers for on-chain TVL data
 *   - Direct parachain RPC calls for staking rates
 *   - Bifrost API for vToken exchange rates
 */
export class YieldService {
  /** Base APY ranges for simulation (min, max). */
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
  };

  /**
   * Fetch current APY data for all tracked protocols.
   *
   * @returns Array of protocol yield data points.
   */
  async fetchYields(): Promise<ProtocolYield[]> {
    yieldLog.info("Fetching yield data for tracked protocols");

    const now = new Date();

    const yields: ProtocolYield[] = [
      {
        name: KNOWN_PARACHAINS.HYDRATION.name,
        paraId: KNOWN_PARACHAINS.HYDRATION.paraId,
        protocol: KNOWN_PARACHAINS.HYDRATION.protocol,
        apyPercent: this.simulateApy("Hydration"),
        tvlUsd: this.simulateTvl(15_000_000, 25_000_000),
        fetchedAt: now,
      },
      {
        name: KNOWN_PARACHAINS.BIFROST.name,
        paraId: KNOWN_PARACHAINS.BIFROST.paraId,
        protocol: KNOWN_PARACHAINS.BIFROST.protocol,
        apyPercent: this.simulateApy("Bifrost"),
        tvlUsd: this.simulateTvl(30_000_000, 50_000_000),
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
        },
        "Yield data fetched",
      );
    }

    return yields;
  }

  /**
   * Fetch Bifrost-specific yield data for all DeFi products.
   *
   * Returns detailed yield information for SLP liquid staking,
   * Zenlink DEX pools, farming pools, and SALP crowdloan products.
   *
   * @returns Array of Bifrost-specific yield data points.
   */
  async fetchBifrostYields(): Promise<BifrostYield[]> {
    yieldLog.info("Fetching Bifrost-specific yield data");

    const now = new Date();
    const bifrostParaId = KNOWN_PARACHAINS.BIFROST.paraId;

    const bifrostYields: BifrostYield[] = [
      // ── SLP: Liquid Staking Products ────────────────────────────────
      {
        name: "Bifrost vDOT (Liquid Staking)",
        paraId: bifrostParaId,
        protocol: BIFROST_PROTOCOLS.SLP.protocol,
        apyPercent: this.simulateApy("Bifrost-SLP-vDOT"),
        tvlUsd: this.simulateTvl(80_000_000, 120_000_000),
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
        apyPercent: this.simulateApy("Bifrost-SLP-vKSM"),
        tvlUsd: this.simulateTvl(20_000_000, 40_000_000),
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
        },
        "Bifrost yield data fetched",
      );
    }

    return bifrostYields;
  }

  /**
   * Simulate a realistic APY value with some variance.
   * Uses a sine-wave modulated by time to create smooth fluctuations.
   */
  private simulateApy(protocol: string): number {
    const range = YieldService.APY_RANGES[protocol];
    if (!range) return 5.0;

    const [min, max] = range;
    const mid = (min + max) / 2;
    const amplitude = (max - min) / 2;

    // Time-based oscillation (period ~30 minutes for demo variety)
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

    // Add small random noise (±0.3%)
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
