import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Chain,
} from "viem";

import {
  CHAIN_ID,
  RPC_URL,
  SWAP_ROUTER_ADDRESS,
  SWAP_QUOTER_ADDRESS,
  SWAP_ROUTER_ABI,
  SWAP_QUOTER_ABI,
  POOL_ADAPTER_ABI,
  HYDRATION_ADAPTER_ADDRESS,
  ASSET_HUB_ADAPTER_ADDRESS,
  BIFROST_DEX_ADAPTER_ADDRESS,
} from "../config/constants.js";
import { PoolType, POOL_TYPE_LABELS, type SwapQuote } from "../types/index.js";
import { swapLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Chain Definition
// ─────────────────────────────────────────────────────────────────────────────

const polkadotHubTestnet: Chain = {
  id: CHAIN_ID,
  name: "Polkadot Hub TestNet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Zero Address Constant
// ─────────────────────────────────────────────────────────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ─────────────────────────────────────────────────────────────────────────────
//  SwapRouterService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Service for querying the SwapQuoter and IPoolAdapter contracts.
 *
 * Provides read-only access to DEX aggregator functionality:
 * - Quote single swaps via SwapQuoter.getBestQuote
 * - Quote multi-hop swaps via SwapQuoter.quoteMultiHop
 * - Query pool adapter support for token pairs
 * - List available pool adapters
 *
 * All methods gracefully handle zero-address (not-yet-deployed) contracts.
 */
export class SwapRouterService {
  private readonly publicClient: PublicClient;

  constructor() {
    this.publicClient = createPublicClient({
      chain: polkadotHubTestnet,
      transport: http(RPC_URL),
    });

    swapLog.info(
      {
        swapRouter: SWAP_ROUTER_ADDRESS,
        swapQuoter: SWAP_QUOTER_ADDRESS,
      },
      "SwapRouterService initialized",
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Availability Checks
  // ─────────────────────────────────────────────────────────────────────

  /** Whether the SwapRouter contract is deployed (non-zero address). */
  get isRouterDeployed(): boolean {
    return SWAP_ROUTER_ADDRESS !== ZERO_ADDRESS;
  }

  /** Whether the SwapQuoter contract is deployed (non-zero address). */
  get isQuoterDeployed(): boolean {
    return SWAP_QUOTER_ADDRESS !== ZERO_ADDRESS;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Quoter Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get the best swap quote for a token pair across all registered adapters.
   *
   * @param pool     Pool address to query.
   * @param tokenIn  Input token address.
   * @param tokenOut Output token address.
   * @param amountIn Amount of tokenIn to swap.
   * @returns Best quote, or null if quoter is not deployed.
   */
  async getBestQuote(
    pool: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
  ): Promise<SwapQuote | null> {
    if (!this.isQuoterDeployed) {
      swapLog.warn("SwapQuoter not deployed — returning null");
      return null;
    }

    try {
      const result = await this.publicClient.readContract({
        address: SWAP_QUOTER_ADDRESS,
        abi: SWAP_QUOTER_ABI,
        functionName: "getBestQuote",
        args: [pool, tokenIn, tokenOut, amountIn],
      });

      const quote = result as {
        source: number;
        pool: Address;
        feeBps: bigint;
        amountIn: bigint;
        amountOut: bigint;
      };

      swapLog.debug(
        {
          source: POOL_TYPE_LABELS[quote.source as PoolType] ?? quote.source,
          amountOut: quote.amountOut.toString(),
        },
        "Best quote fetched",
      );

      return {
        source: quote.source as PoolType,
        pool: quote.pool,
        feeBps: quote.feeBps,
        amountIn: quote.amountIn,
        amountOut: quote.amountOut,
      };
    } catch (error) {
      swapLog.error({ err: error }, "getBestQuote failed");
      return null;
    }
  }

  /**
   * Get all available swap quotes for a token pair.
   *
   * @param pool     Pool address to query.
   * @param tokenIn  Input token address.
   * @param tokenOut Output token address.
   * @param amountIn Amount of tokenIn to swap.
   * @returns Array of quotes, or empty array if quoter is not deployed.
   */
  async getAllQuotes(
    pool: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
  ): Promise<SwapQuote[]> {
    if (!this.isQuoterDeployed) {
      swapLog.warn("SwapQuoter not deployed — returning empty");
      return [];
    }

    try {
      const result = await this.publicClient.readContract({
        address: SWAP_QUOTER_ADDRESS,
        abi: SWAP_QUOTER_ABI,
        functionName: "getAllQuotes",
        args: [pool, tokenIn, tokenOut, amountIn],
      });

      const quotes = result as Array<{
        source: number;
        pool: Address;
        feeBps: bigint;
        amountIn: bigint;
        amountOut: bigint;
      }>;

      swapLog.debug({ quoteCount: quotes.length }, "All quotes fetched");

      return quotes.map((q) => ({
        source: q.source as PoolType,
        pool: q.pool,
        feeBps: q.feeBps,
        amountIn: q.amountIn,
        amountOut: q.amountOut,
      }));
    } catch (error) {
      swapLog.error({ err: error }, "getAllQuotes failed");
      return [];
    }
  }

  /**
   * Get a quote for a multi-hop swap through a series of routes.
   *
   * @param routes   Ordered array of routes for each hop.
   * @param amountIn Input amount for the first hop.
   * @returns Final output amount, or null if quoter is not deployed.
   */
  async getMultiHopQuote(
    routes: Array<{
      poolType: number;
      pool: Address;
      tokenIn: Address;
      tokenOut: Address;
      feeBps: bigint;
      data: `0x${string}`;
    }>,
    amountIn: bigint,
  ): Promise<bigint | null> {
    if (!this.isQuoterDeployed) {
      swapLog.warn("SwapQuoter not deployed — returning null");
      return null;
    }

    try {
      const result = await this.publicClient.readContract({
        address: SWAP_QUOTER_ADDRESS,
        abi: SWAP_QUOTER_ABI,
        functionName: "quoteMultiHop",
        args: [routes, amountIn],
      });

      swapLog.debug(
        { amountOut: (result as bigint).toString(), hops: routes.length },
        "Multi-hop quote fetched",
      );

      return result as bigint;
    } catch (error) {
      swapLog.error({ err: error }, "quoteMultiHop failed");
      return null;
    }
  }

  /**
   * Build the best swap parameters using the SwapQuoter.
   *
   * @param pool        Pool address.
   * @param tokenIn     Input token.
   * @param tokenOut    Output token.
   * @param amountIn    Input amount.
   * @param slippageBps Slippage tolerance in basis points.
   * @param to          Recipient address.
   * @param deadline    Unix deadline timestamp.
   * @returns Built SwapParams, or null if quoter is not deployed.
   */
  async buildBestSwap(
    pool: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippageBps: bigint,
    to: Address,
    deadline: bigint,
  ): Promise<{
    route: {
      poolType: number;
      pool: Address;
      tokenIn: Address;
      tokenOut: Address;
      feeBps: bigint;
      data: `0x${string}`;
    };
    amountIn: bigint;
    minAmountOut: bigint;
    to: Address;
    deadline: bigint;
  } | null> {
    if (!this.isQuoterDeployed) {
      swapLog.warn("SwapQuoter not deployed — returning null");
      return null;
    }

    try {
      const result = await this.publicClient.readContract({
        address: SWAP_QUOTER_ADDRESS,
        abi: SWAP_QUOTER_ABI,
        functionName: "buildBestSwap",
        args: [pool, tokenIn, tokenOut, amountIn, slippageBps, to, deadline],
      });

      const params = result as {
        route: {
          poolType: number;
          pool: Address;
          tokenIn: Address;
          tokenOut: Address;
          feeBps: bigint;
          data: `0x${string}`;
        };
        amountIn: bigint;
        minAmountOut: bigint;
        to: Address;
        deadline: bigint;
      };

      swapLog.debug(
        {
          poolType: params.route.poolType,
          minAmountOut: params.minAmountOut.toString(),
        },
        "Best swap params built",
      );

      return params;
    } catch (error) {
      swapLog.error({ err: error }, "buildBestSwap failed");
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Pool Adapter Reads
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Check if a pool adapter supports a given token pair.
   *
   * @param adapterAddress Pool adapter contract address.
   * @param pool           Pool address to check.
   * @param tokenIn        Input token address.
   * @param tokenOut       Output token address.
   * @returns True if the pair is supported, false otherwise.
   */
  async supportsPair(
    adapterAddress: Address,
    pool: Address,
    tokenIn: Address,
    tokenOut: Address,
  ): Promise<boolean> {
    if (adapterAddress === ZERO_ADDRESS) {
      return false;
    }

    try {
      const result = await this.publicClient.readContract({
        address: adapterAddress,
        abi: POOL_ADAPTER_ABI,
        functionName: "supportsPair",
        args: [pool, tokenIn, tokenOut],
      });

      return result as boolean;
    } catch {
      return false;
    }
  }

  /**
   * Get a quote from a specific pool adapter.
   *
   * @param adapterAddress Pool adapter contract address.
   * @param pool           Pool address.
   * @param tokenIn        Input token address.
   * @param tokenOut       Output token address.
   * @param amountIn       Input amount.
   * @returns Estimated output amount, or null on failure.
   */
  async getAdapterQuote(
    adapterAddress: Address,
    pool: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
  ): Promise<bigint | null> {
    if (adapterAddress === ZERO_ADDRESS) {
      return null;
    }

    try {
      const result = await this.publicClient.readContract({
        address: adapterAddress,
        abi: POOL_ADAPTER_ABI,
        functionName: "getAmountOut",
        args: [pool, tokenIn, tokenOut, amountIn, "0x" as `0x${string}`],
      });

      return result as bigint;
    } catch (error) {
      swapLog.error(
        { err: error, adapter: adapterAddress },
        "Adapter quote failed",
      );
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Registry
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get all configured pool adapters with their deployment status.
   */
  getPoolAdapters(): Array<{
    poolType: PoolType;
    name: string;
    address: Address;
    deployed: boolean;
  }> {
    return [
      {
        poolType: PoolType.HydrationOmnipool,
        name: "Hydration Omnipool",
        address: HYDRATION_ADAPTER_ADDRESS,
        deployed: HYDRATION_ADAPTER_ADDRESS !== ZERO_ADDRESS,
      },
      {
        poolType: PoolType.AssetHubPair,
        name: "AssetHub Pair",
        address: ASSET_HUB_ADAPTER_ADDRESS,
        deployed: ASSET_HUB_ADAPTER_ADDRESS !== ZERO_ADDRESS,
      },
      {
        poolType: PoolType.BifrostDEX,
        name: "Bifrost DEX",
        address: BIFROST_DEX_ADAPTER_ADDRESS,
        deployed: BIFROST_DEX_ADAPTER_ADDRESS !== ZERO_ADDRESS,
      },
    ];
  }

  /**
   * Check if the SwapRouter is paused.
   * @returns True if paused, false if not paused or not deployed.
   */
  async isRouterPaused(): Promise<boolean> {
    if (!this.isRouterDeployed) return false;

    try {
      const result = await this.publicClient.readContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: "paused",
      });
      return result as boolean;
    } catch {
      return false;
    }
  }
}
