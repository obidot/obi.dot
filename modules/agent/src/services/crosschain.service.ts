import {
  type Address,
  createPublicClient,
  http,
  type PublicClient,
} from "viem";

import {
  CROSS_CHAIN_ROUTER_ABI,
  CROSS_CHAIN_ROUTER_ADDRESS,
  EVM_CHAINS,
  type EVMChainConfig,
  MAX_SATELLITE_SYNC_AGE,
  SATELLITE_VAULT_ABI,
  VAULT_ADDRESS,
  VAULT_CROSS_CHAIN_ABI,
} from "../config/constants.js";
import { env } from "../config/env.js";
import type {
  CrossChainVaultState,
  SatelliteChainState,
  VaultState,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

const crossChainLog = logger.child({ module: "crosschain" });

// ─────────────────────────────────────────────────────────────────────────────
//  CrossChainService — Multi-Chain State Aggregator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates vault state across the Polkadot Hub and satellite EVM chains.
 *
 * Responsible for:
 *   1. Reading hub vault cross-chain state (totalSatelliteAssets, globalTotalAssets)
 *   2. Polling satellite vault state on each configured EVM chain
 *   3. Detecting stale sync data and flagging chains that need re-sync
 *   4. Providing a unified CrossChainVaultState for the AI decision engine
 */
export class CrossChainService {
  /** Viem public clients for each satellite EVM chain. */
  private readonly satelliteClients: Map<string, PublicClient> = new Map();

  /** Hub public client (reuses the main RPC). */
  private readonly hubClient: PublicClient;

  /** Configured satellite chains that have valid vault addresses. */
  private readonly activeChains: EVMChainConfig[];

  constructor() {
    // Hub client for cross-chain state reads
    this.hubClient = createPublicClient({
      transport: http(env.RPC_URL),
    });

    // Initialize satellite clients for configured chains
    this.activeChains = [];
    for (const [chainId, config] of Object.entries(EVM_CHAINS)) {
      if (config.satelliteVault) {
        const client = createPublicClient({
          transport: http(config.rpcUrl),
        });
        this.satelliteClients.set(chainId, client);
        this.activeChains.push(config);
        crossChainLog.info(
          { chainId, rpcUrl: config.rpcUrl, vault: config.satelliteVault },
          "Satellite client initialized",
        );
      }
    }

    crossChainLog.info(
      { activeChainCount: this.activeChains.length },
      "CrossChainService initialized",
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Whether any satellite chains are configured and active.
   */
  get hasSatellites(): boolean {
    return this.activeChains.length > 0;
  }

  /**
   * List of active satellite chain identifiers.
   */
  get activeChainIds(): string[] {
    return this.activeChains.map((c) => c.chainId);
  }

  /**
   * Fetch complete cross-chain vault state.
   *
   * Reads hub cross-chain state and all satellite vault states in parallel,
   * then merges into a unified CrossChainVaultState.
   *
   * @param hubState - The base hub vault state (fetched by SignerService).
   * @returns Aggregated cross-chain vault state.
   */
  async fetchCrossChainState(
    hubState: VaultState,
  ): Promise<CrossChainVaultState> {
    crossChainLog.info("Fetching cross-chain vault state");

    // Fetch hub cross-chain data and all satellite states in parallel
    const [hubCrossChainData, satelliteStates] = await Promise.all([
      this.fetchHubCrossChainData(),
      this.fetchAllSatelliteStates(),
    ]);

    const crossChainState: CrossChainVaultState = {
      ...hubState,
      totalSatelliteAssets: hubCrossChainData.totalSatelliteAssets,
      globalTotalAssets: hubCrossChainData.globalTotalAssets,
      satelliteAssets: satelliteStates,
    };

    crossChainLog.info(
      {
        hubTotalAssets: hubState.totalAssets.toString(),
        totalSatelliteAssets: hubCrossChainData.totalSatelliteAssets.toString(),
        globalTotalAssets: hubCrossChainData.globalTotalAssets.toString(),
        satelliteCount: satelliteStates.length,
      },
      "Cross-chain state aggregated",
    );

    return crossChainState;
  }

  /**
   * Check if any satellite chain has stale sync data.
   *
   * @returns Array of chain IDs with stale sync timestamps.
   */
  async getStaleSatellites(): Promise<string[]> {
    const states = await this.fetchAllSatelliteStates();
    const now = Math.floor(Date.now() / 1000);
    const stale: string[] = [];

    for (const state of states) {
      const age = now - state.lastSyncTimestamp;
      if (age > MAX_SATELLITE_SYNC_AGE) {
        stale.push(state.chainId);
        crossChainLog.warn(
          {
            chainId: state.chainId,
            lastSync: state.lastSyncTimestamp,
            ageSec: age,
            maxAge: MAX_SATELLITE_SYNC_AGE,
          },
          "Satellite sync data is stale",
        );
      }
    }

    return stale;
  }

  /**
   * Check if the CrossChainRouter is configured and not paused.
   */
  async isRouterActive(): Promise<boolean> {
    if (
      CROSS_CHAIN_ROUTER_ADDRESS ===
      "0x0000000000000000000000000000000000000000"
    ) {
      return false;
    }

    try {
      const paused = await this.hubClient.readContract({
        address: CROSS_CHAIN_ROUTER_ADDRESS,
        abi: CROSS_CHAIN_ROUTER_ABI,
        functionName: "paused",
      });
      return !paused;
    } catch (error) {
      crossChainLog.warn(
        { err: error },
        "Failed to check router status — assuming inactive",
      );
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal: Hub Cross-Chain Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read cross-chain state from the hub vault contract.
   */
  private async fetchHubCrossChainData(): Promise<{
    totalSatelliteAssets: bigint;
    globalTotalAssets: bigint;
  }> {
    try {
      const [totalSatelliteAssets, globalTotalAssets] = await Promise.all([
        this.hubClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_CROSS_CHAIN_ABI,
          functionName: "totalSatelliteAssets",
        }) as Promise<bigint>,
        this.hubClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_CROSS_CHAIN_ABI,
          functionName: "globalTotalAssets",
        }) as Promise<bigint>,
      ]);

      return { totalSatelliteAssets, globalTotalAssets };
    } catch (error) {
      crossChainLog.warn(
        { err: error },
        "Failed to read hub cross-chain data — using defaults",
      );
      return { totalSatelliteAssets: 0n, globalTotalAssets: 0n };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Internal: Satellite State Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Fetch state from all configured satellite vaults in parallel.
   */
  private async fetchAllSatelliteStates(): Promise<SatelliteChainState[]> {
    const promises = this.activeChains.map((chain) =>
      this.fetchSatelliteState(chain),
    );

    const results = await Promise.allSettled(promises);
    const states: SatelliteChainState[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const chain = this.activeChains[i];

      if (result.status === "fulfilled") {
        states.push(result.value);
      } else {
        crossChainLog.error(
          { chainId: chain.chainId, err: result.reason },
          "Failed to fetch satellite state",
        );
        // Add a degraded state entry so the AI knows this chain is unreachable
        states.push({
          chainId: chain.chainId,
          chainName: chain.name,
          totalAssets: 0n,
          emergencyMode: false,
          lastSyncTimestamp: 0,
        });
      }
    }

    return states;
  }

  /**
   * Fetch state from a single satellite vault.
   */
  private async fetchSatelliteState(
    chain: EVMChainConfig,
  ): Promise<SatelliteChainState> {
    const client = this.satelliteClients.get(chain.chainId);
    if (!client || !chain.satelliteVault) {
      throw new Error(`No client for chain ${chain.chainId}`);
    }

    const vaultAddress = chain.satelliteVault as Address;

    const [totalAssets, emergencyMode, lastSyncTimestamp] = await Promise.all([
      client.readContract({
        address: vaultAddress,
        abi: SATELLITE_VAULT_ABI,
        functionName: "totalAssets",
      }) as Promise<bigint>,
      client.readContract({
        address: vaultAddress,
        abi: SATELLITE_VAULT_ABI,
        functionName: "emergencyMode",
      }) as Promise<boolean>,
      client.readContract({
        address: vaultAddress,
        abi: SATELLITE_VAULT_ABI,
        functionName: "lastSyncTimestamp",
      }) as Promise<bigint>,
    ]);

    const state: SatelliteChainState = {
      chainId: chain.chainId,
      chainName: chain.name,
      totalAssets,
      emergencyMode,
      lastSyncTimestamp: Number(lastSyncTimestamp),
    };

    crossChainLog.debug(
      {
        chainId: chain.chainId,
        totalAssets: totalAssets.toString(),
        emergencyMode,
        lastSync: state.lastSyncTimestamp,
      },
      "Satellite state fetched",
    );

    return state;
  }
}
