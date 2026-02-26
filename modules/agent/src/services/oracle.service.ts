import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env } from "../config/env.js";
import { CHAIN_ID, RPC_URL } from "../config/constants.js";
import {
  KEEPER_ORACLE_ADDRESS,
  ORACLE_REGISTRY_ADDRESS,
  KEEPER_ORACLE_ABI,
  ORACLE_REGISTRY_ABI,
  STALENESS_WARNING_RATIO,
  ORACLE_HEARTBEAT_MS,
  PRICE_PAIRS,
} from "../config/oracle.config.js";
import { PriceAggregator } from "./price-aggregator.service.js";
import type {
  PriceData,
  FeedStatus,
  PriceUpdate,
  OracleHealthStatus,
} from "../types/oracle.types.js";
import { logger } from "../utils/logger.js";

const oracleLog = logger.child({ module: "oracle" });

// ─────────────────────────────────────────────────────────────────────────────
//  Chain Definition
// ─────────────────────────────────────────────────────────────────────────────

const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub Testnet (Paseo)",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

// ─────────────────────────────────────────────────────────────────────────────
//  OracleService — On-Chain Oracle Manager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The OracleService is the agent's primary interface with on-chain oracles.
 *
 * Responsibilities:
 * 1. Read current on-chain prices from KeeperOracle / OracleRegistry
 * 2. Push price updates when feeds are stale or deviated
 * 3. Pre-flight checks before strategy submission
 * 4. Heartbeat monitoring to keep feeds fresh
 * 5. Health status reporting
 */
export class OracleService {
  private readonly account;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly priceAggregator: PriceAggregator;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(priceAggregator?: PriceAggregator) {
    this.account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as Hex);

    this.publicClient = createPublicClient({
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    this.priceAggregator = priceAggregator ?? new PriceAggregator();

    oracleLog.info(
      {
        keeper: this.account.address,
        oracleAddress: KEEPER_ORACLE_ADDRESS,
        registryAddress: ORACLE_REGISTRY_ADDRESS,
      },
      "OracleService initialized",
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Read Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read current on-chain price from KeeperOracle.
   */
  async getOnChainPrice(_asset?: Address): Promise<PriceData> {
    const oracleAddress = this.resolveOracleAddress(_asset);

    const [roundData, oracleDecimals, heartbeat] = await Promise.all([
      this.publicClient.readContract({
        address: oracleAddress,
        abi: KEEPER_ORACLE_ABI,
        functionName: "latestRoundData",
      }),
      this.publicClient.readContract({
        address: oracleAddress,
        abi: KEEPER_ORACLE_ABI,
        functionName: "decimals",
      }),
      this.publicClient.readContract({
        address: oracleAddress,
        abi: KEEPER_ORACLE_ABI,
        functionName: "heartbeat",
      }),
    ]);

    const [, answer, , updatedAt] = roundData;
    const nowSec = Math.floor(Date.now() / 1000);
    const isStale = nowSec - Number(updatedAt) > Number(heartbeat);

    return {
      price: answer,
      decimals: Number(oracleDecimals),
      updatedAt: Number(updatedAt),
      isStale,
    };
  }

  /**
   * Check if the on-chain oracle is stale.
   */
  async isOracleStale(_asset?: Address): Promise<boolean> {
    const oracleAddress = this.resolveOracleAddress(_asset);

    return this.publicClient.readContract({
      address: oracleAddress,
      abi: KEEPER_ORACLE_ABI,
      functionName: "isStale",
    });
  }

  /**
   * Get status of all feeds from OracleRegistry.
   * Falls back to single oracle if registry not configured.
   */
  async getAllFeeds(): Promise<FeedStatus[]> {
    const feeds: FeedStatus[] = [];

    if (
      ORACLE_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000"
    ) {
      try {
        const assets = await this.publicClient.readContract({
          address: ORACLE_REGISTRY_ADDRESS,
          abi: ORACLE_REGISTRY_ABI,
          functionName: "getAllRegisteredAssets",
        });

        for (const asset of assets) {
          try {
            const [priceData, stale, feedInfo] = await Promise.all([
              this.publicClient.readContract({
                address: ORACLE_REGISTRY_ADDRESS,
                abi: ORACLE_REGISTRY_ABI,
                functionName: "getPrice",
                args: [asset],
              }),
              this.publicClient.readContract({
                address: ORACLE_REGISTRY_ADDRESS,
                abi: ORACLE_REGISTRY_ABI,
                functionName: "isFeedStale",
                args: [asset],
              }),
              this.publicClient.readContract({
                address: ORACLE_REGISTRY_ADDRESS,
                abi: ORACLE_REGISTRY_ABI,
                functionName: "feeds",
                args: [asset],
              }),
            ]);

            const [price, decimals, updatedAt] = priceData;
            const [oracleAddr, heartbeat, , active] = feedInfo;

            feeds.push({
              asset,
              oracle: oracleAddr,
              description: `Feed for ${asset}`,
              price,
              decimals: Number(decimals),
              updatedAt: Number(updatedAt),
              heartbeat: Number(heartbeat),
              isStale: stale,
              active,
            });
          } catch (err) {
            oracleLog.warn({ asset, err }, "Failed to read feed from registry");
          }
        }

        return feeds;
      } catch (err) {
        oracleLog.warn(
          { err },
          "Failed to read registry, falling back to single oracle",
        );
      }
    }

    // Fallback: single oracle
    if (
      KEEPER_ORACLE_ADDRESS !== "0x0000000000000000000000000000000000000000"
    ) {
      try {
        const priceData = await this.getOnChainPrice();
        const [desc, heartbeat] = await Promise.all([
          this.publicClient.readContract({
            address: KEEPER_ORACLE_ADDRESS,
            abi: KEEPER_ORACLE_ABI,
            functionName: "description",
          }),
          this.publicClient.readContract({
            address: KEEPER_ORACLE_ADDRESS,
            abi: KEEPER_ORACLE_ABI,
            functionName: "heartbeat",
          }),
        ]);

        feeds.push({
          asset: env.ASSET_ADDRESS as Address,
          oracle: KEEPER_ORACLE_ADDRESS,
          description: desc,
          price: priceData.price,
          decimals: priceData.decimals,
          updatedAt: priceData.updatedAt,
          heartbeat: Number(heartbeat),
          isStale: priceData.isStale,
          active: true,
        });
      } catch (err) {
        oracleLog.error({ err }, "Failed to read single oracle");
      }
    }

    return feeds;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Write Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Push a price update to KeeperOracle.
   * Requires the agent to have KEEPER_ROLE on the oracle.
   */
  async updatePrice(_asset: Address, price: bigint): Promise<Hex> {
    const oracleAddress = this.resolveOracleAddress(_asset);

    oracleLog.info(
      {
        oracle: oracleAddress,
        price: price.toString(),
      },
      "Pushing price update on-chain",
    );

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: polkadotHubTestnet,
      address: oracleAddress,
      abi: KEEPER_ORACLE_ABI,
      functionName: "updatePrice",
      args: [price],
    });

    oracleLog.info({ txHash }, "Price update transaction submitted");

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    oracleLog.info(
      {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      "Price update confirmed",
    );

    return txHash;
  }

  /**
   * Batch-update multiple feeds.
   * Currently sends individual transactions (batch contract not yet deployed).
   */
  async updatePrices(updates: PriceUpdate[]): Promise<Hex[]> {
    const hashes: Hex[] = [];

    for (const update of updates) {
      try {
        const hash = await this.updatePrice(update.asset, update.price);
        hashes.push(hash);
      } catch (err) {
        oracleLog.error(
          { asset: update.asset, err },
          "Failed to update price for asset",
        );
      }
    }

    return hashes;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Pre-Flight Checks
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Ensure the oracle is fresh before submitting a strategy.
   *
   * Flow:
   * 1. Read on-chain price
   * 2. If stale → fetch from PriceAggregator → push update → wait → return
   * 3. If fresh → return current price
   */
  async ensureFreshPrice(asset: Address): Promise<PriceData> {
    const currentPrice = await this.getOnChainPrice(asset);

    if (!currentPrice.isStale) {
      oracleLog.debug(
        { asset, price: currentPrice.price.toString() },
        "Oracle is fresh",
      );
      return currentPrice;
    }

    oracleLog.warn(
      {
        asset,
        lastUpdated: currentPrice.updatedAt,
        age: Math.floor(Date.now() / 1000) - currentPrice.updatedAt,
      },
      "Oracle is stale — fetching fresh price from aggregator",
    );

    // Find the pair for this asset
    const pair = PRICE_PAIRS.find((p) => p.asset === asset);
    if (!pair) {
      oracleLog.error(
        { asset },
        "No price pair configured for this asset — cannot refresh",
      );
      return currentPrice;
    }

    try {
      const aggregated = await this.priceAggregator.getPrice(pair.pair);

      oracleLog.info(
        {
          pair: pair.pair,
          price: aggregated.price.toString(),
          confidence: aggregated.confidence,
        },
        "Aggregated price fetched — pushing on-chain",
      );

      await this.updatePrice(asset, aggregated.price);

      // Re-read to confirm
      return this.getOnChainPrice(asset);
    } catch (err) {
      oracleLog.error(
        { asset, err },
        "Failed to refresh oracle — returning stale price",
      );
      return currentPrice;
    }
  }

  /**
   * Compute a safe minReturn based on oracle price and slippage.
   *
   * Formula: minReturn = amount * price * (10000 - slippageBps) / (10000 * 10^decimals)
   *
   * @param amount - Amount of asset to deploy (uint256).
   * @param price - Oracle price (scaled by decimals).
   * @param oracleDecimals - Number of decimals in the price.
   * @param slippageBps - Maximum slippage in basis points.
   * @returns The computed minimum return.
   */
  computeMinReturn(
    amount: bigint,
    price: bigint,
    oracleDecimals: number,
    slippageBps: number,
  ): bigint {
    const BPS = 10_000n;
    const scaleFactor = 10n ** BigInt(oracleDecimals);

    // minReturn = amount * price * (BPS - slippage) / (BPS * scaleFactor)
    // Round down (conservative, favoring vault)
    return (amount * price * (BPS - BigInt(slippageBps))) / (BPS * scaleFactor);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Heartbeat Monitor
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Start the heartbeat monitor that periodically checks feed freshness
   * and pushes updates when approaching staleness.
   */
  startHeartbeatMonitor(intervalMs?: number): void {
    const interval = intervalMs ?? ORACLE_HEARTBEAT_MS ?? 1_800_000;

    if (this.heartbeatTimer) {
      oracleLog.warn("Heartbeat monitor already running — restarting");
      this.stopHeartbeatMonitor();
    }

    oracleLog.info(
      { intervalMs: interval },
      "Starting oracle heartbeat monitor",
    );

    // Run immediately, then on interval
    void this.heartbeatCheck();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatCheck();
    }, interval);
  }

  /**
   * Stop the heartbeat monitor.
   */
  stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      oracleLog.info("Heartbeat monitor stopped");
    }
  }

  /**
   * Get the health status of all oracle feeds.
   */
  async getHealthStatus(): Promise<OracleHealthStatus> {
    const feeds = await this.getAllFeeds();
    const warnings: string[] = [];
    let healthy = true;

    const nowSec = Math.floor(Date.now() / 1000);

    for (const feed of feeds) {
      if (!feed.active) {
        warnings.push(`Feed for ${feed.asset} is disabled`);
        continue;
      }

      if (feed.isStale) {
        healthy = false;
        warnings.push(
          `Feed for ${feed.asset} is STALE (last updated ${nowSec - feed.updatedAt}s ago, heartbeat ${feed.heartbeat}s)`,
        );
      } else {
        const age = nowSec - feed.updatedAt;
        const threshold = feed.heartbeat * STALENESS_WARNING_RATIO;
        if (age > threshold) {
          warnings.push(
            `Feed for ${feed.asset} is approaching staleness (${age}s / ${feed.heartbeat}s)`,
          );
        }
      }
    }

    return {
      healthy,
      feeds,
      checkedAt: nowSec,
      warnings,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Single heartbeat check cycle.
   */
  private async heartbeatCheck(): Promise<void> {
    oracleLog.debug("Running heartbeat check");

    try {
      const feeds = await this.getAllFeeds();
      const nowSec = Math.floor(Date.now() / 1000);

      for (const feed of feeds) {
        if (!feed.active) continue;

        const age = nowSec - feed.updatedAt;
        const threshold = feed.heartbeat * STALENESS_WARNING_RATIO;

        if (age > threshold || feed.isStale) {
          oracleLog.info(
            {
              asset: feed.asset,
              age,
              heartbeat: feed.heartbeat,
              isStale: feed.isStale,
            },
            "Feed approaching/exceeded staleness — refreshing",
          );

          // Find pair config for this asset
          const pair = PRICE_PAIRS.find((p) => p.asset === feed.asset);
          if (!pair) {
            oracleLog.warn(
              { asset: feed.asset },
              "No price pair for asset — skipping refresh",
            );
            continue;
          }

          try {
            const aggregated = await this.priceAggregator.getPrice(pair.pair);

            // Check deviation from current on-chain price
            if (feed.price > 0n) {
              const currentPriceNum = Number(feed.price);
              const newPriceNum = Number(aggregated.price);
              const deviationPercent =
                Math.abs((newPriceNum - currentPriceNum) / currentPriceNum) *
                100;

              oracleLog.debug(
                {
                  pair: pair.pair,
                  currentPrice: feed.price.toString(),
                  newPrice: aggregated.price.toString(),
                  deviationPercent: deviationPercent.toFixed(4),
                },
                "Price deviation check",
              );
            }

            await this.updatePrice(feed.asset, aggregated.price);
          } catch (err) {
            oracleLog.error(
              { asset: feed.asset, pair: pair.pair, err },
              "Failed to refresh feed during heartbeat",
            );
          }
        }
      }
    } catch (err) {
      oracleLog.error({ err }, "Heartbeat check failed");
    }
  }

  /**
   * Resolve the oracle address for a given asset.
   * For now, all assets use the single KEEPER_ORACLE_ADDRESS.
   */
  private resolveOracleAddress(_asset?: Address): Address {
    // In multi-feed mode, this would look up the registry.
    // Phase 1: single oracle for all assets.
    return KEEPER_ORACLE_ADDRESS;
  }
}
