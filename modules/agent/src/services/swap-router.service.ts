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
  TOKEN_SYMBOLS,
  UV2_PAIRS,
  UV2_PAIR_ABI,
} from "../config/constants.js";
import {
  PoolType,
  POOL_TYPE_LABELS,
  type SwapQuote,
  type RouteHop,
  type SwapRouteResult,
} from "../types/index.js";
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

  // ─────────────────────────────────────────────────────────────────────
  //  Route Finder — V2 Graph Path Finder + Cross-chain Stubs
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Find all viable swap routes from tokenIn to tokenOut for a given amountIn.
   *
   * Reads live V2 pair reserves via multicall, builds a token adjacency graph,
   * enumerates single- and multi-hop paths (up to depth 3), simulates AMM math
   * for each path, and appends cross-chain stub routes.
   *
   * @param tokenIn  Input token address (any casing).
   * @param tokenOut Output token address (any casing).
   * @param amountIn Amount of tokenIn in wei.
   * @returns Sorted array of SwapRouteResult (best amountOut first).
   */
  async findRoutes(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
  ): Promise<SwapRouteResult[]> {
    const tokenInLc = tokenIn.toLowerCase();
    const tokenOutLc = tokenOut.toLowerCase();

    if (tokenInLc === tokenOutLc) return [];

    // ── 1. Fetch all pair reserves via sequential readContract calls ─────────
    // (multicall3 is not deployed on Polkadot Hub TestNet)
    let reservesData: Array<[bigint, bigint, number] | null>;
    try {
      const results = await Promise.allSettled(
        UV2_PAIRS.map((pair) =>
          this.publicClient.readContract({
            address: pair.address,
            abi: UV2_PAIR_ABI,
            functionName: "getReserves",
          }),
        ),
      );

      reservesData = results.map((r) => {
        if (r.status === "rejected" || !r.value) return null;
        const [r0, r1, ts] = r.value as [bigint, bigint, number];
        return [r0, r1, ts];
      });
    } catch (err) {
      swapLog.error({ err }, "findRoutes: getReserves failed");
      return [];
    }

    // ── 2. Build adjacency maps ──────────────────────────────────────────────
    //   liveGraph: only pairs with non-zero reserves (executable routes)
    //   fullGraph: all pairs regardless of reserves (for dry-path discovery)
    interface PairEdge {
      pairIdx: number;
      neighbour: string;
      reserveIn: bigint;
      reserveOut: bigint;
    }
    const graph = new Map<string, PairEdge[]>();     // live only
    const fullGraph = new Map<string, PairEdge[]>(); // includes zero-reserve

    for (let i = 0; i < UV2_PAIRS.length; i++) {
      const pair = UV2_PAIRS[i];
      const reserves = reservesData[i];
      const t0 = pair.token0.toLowerCase();
      const t1 = pair.token1.toLowerCase();
      const r0 = reserves?.[0] ?? 0n;
      const r1 = reserves?.[1] ?? 0n;

      // always add to fullGraph (even with zero reserves — shows path exists)
      if (!fullGraph.has(t0)) fullGraph.set(t0, []);
      fullGraph.get(t0)!.push({ pairIdx: i, neighbour: t1, reserveIn: r0, reserveOut: r1 });
      if (!fullGraph.has(t1)) fullGraph.set(t1, []);
      fullGraph.get(t1)!.push({ pairIdx: i, neighbour: t0, reserveIn: r1, reserveOut: r0 });

      if (!reserves || r0 === 0n || r1 === 0n) continue; // skip empty pools for live graph

      // t0 → t1
      if (!graph.has(t0)) graph.set(t0, []);
      graph
        .get(t0)!
        .push({ pairIdx: i, neighbour: t1, reserveIn: r0, reserveOut: r1 });

      // t1 → t0
      if (!graph.has(t1)) graph.set(t1, []);
      graph
        .get(t1)!
        .push({ pairIdx: i, neighbour: t0, reserveIn: r1, reserveOut: r0 });
    }

    // ── 3. V2 AMM output math ────────────────────────────────────────────────
    function v2AmountOut(
      amountIn_: bigint,
      reserveIn: bigint,
      reserveOut: bigint,
    ): bigint {
      const amountInWithFee = amountIn_ * 997n;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 1000n + amountInWithFee;
      return numerator / denominator;
    }

    function v2PriceImpactBps(amountIn_: bigint, reserveIn: bigint): bigint {
      // approximate: impact = amountIn / (reserveIn + amountIn)
      return (amountIn_ * 10000n) / (reserveIn + amountIn_);
    }

    // ── 4. DFS to enumerate paths (max depth 3) ──────────────────────────────
    interface PathStep {
      pairIdx: number;
      tokenIn: string;
      tokenOut: string;
      amountIn: bigint;
      amountOut: bigint;
      reserveIn: bigint;
    }

    const routes: SwapRouteResult[] = [];

    function dfs(
      currentToken: string,
      currentAmount: bigint,
      path: PathStep[],
      visited: Set<string>,
    ): void {
      if (currentToken === tokenOutLc && path.length > 0) {
        // We've reached tokenOut — build a SwapRouteResult
        let totalFee = 0n;
        let totalImpact = 0n;
        const hops: RouteHop[] = path.map((step) => {
          const pair = UV2_PAIRS[step.pairIdx];
          const feeBps = 30n; // V2 = 0.3%
          const impactBps = v2PriceImpactBps(step.amountIn, step.reserveIn);
          totalFee += feeBps;
          totalImpact += impactBps;

          const tokenInSymbol =
            TOKEN_SYMBOLS[step.tokenIn] ?? step.tokenIn.slice(0, 8);
          const tokenOutSymbol =
            TOKEN_SYMBOLS[step.tokenOut] ?? step.tokenOut.slice(0, 8);

          return {
            pool: pair.address,
            poolLabel: pair.label,
            poolType: POOL_TYPE_LABELS[PoolType.Custom],
            tokenIn: step.tokenIn,
            tokenInSymbol,
            tokenOut: step.tokenOut,
            tokenOutSymbol,
            amountIn: step.amountIn.toString(),
            amountOut: step.amountOut.toString(),
            feeBps: feeBps.toString(),
            priceImpactBps: impactBps.toString(),
          } satisfies RouteHop;
        });

        const finalAmountOut = path[path.length - 1].amountOut;
        // 50 bps slippage for minAmountOut
        const minAmountOut = (finalAmountOut * (10000n - 50n)) / 10000n;

        const hopSymbols = [
          TOKEN_SYMBOLS[tokenInLc] ?? tokenInLc.slice(0, 8),
          ...path.map(
            (s) => TOKEN_SYMBOLS[s.tokenOut] ?? s.tokenOut.slice(0, 8),
          ),
        ];
        const id = hopSymbols.join("→");

        routes.push({
          id,
          tokenIn,
          tokenOut,
          amountIn: amountIn.toString(),
          amountOut: finalAmountOut.toString(),
          minAmountOut: minAmountOut.toString(),
          hops,
          totalFeeBps: totalFee.toString(),
          totalPriceImpactBps: totalImpact.toString(),
          routeType: "local",
          status: "live",
        });
        return;
      }

      if (path.length >= 3) return; // max 3 hops

      const edges = graph.get(currentToken) ?? [];
      for (const edge of edges) {
        if (visited.has(edge.neighbour)) continue;
        const out = v2AmountOut(currentAmount, edge.reserveIn, edge.reserveOut);
        if (out === 0n) continue;

        visited.add(edge.neighbour);
        path.push({
          pairIdx: edge.pairIdx,
          tokenIn: currentToken,
          tokenOut: edge.neighbour,
          amountIn: currentAmount,
          amountOut: out,
          reserveIn: edge.reserveIn,
        });
        dfs(edge.neighbour, out, path, visited);
        path.pop();
        visited.delete(edge.neighbour);
      }
    }

    const visited = new Set<string>([tokenInLc]);
    dfs(tokenInLc, amountIn, [], visited);

    // ── 5. Second DFS pass: discover "dry" paths (pools exist but no reserves) ─
    // Use fullGraph so we can find paths even through zero-reserve pairs.
    const liveRouteIds = new Set(routes.map((r) => r.id));

    function dryDfs(
      currentToken: string,
      path: Array<{ pairIdx: number; tokenIn: string; tokenOut: string }>,
      visited2: Set<string>,
    ): void {
      if (currentToken === tokenOutLc && path.length > 0) {
        const hopSymbols = [
          TOKEN_SYMBOLS[tokenInLc] ?? tokenInLc.slice(0, 8),
          ...path.map((s) => TOKEN_SYMBOLS[s.tokenOut] ?? s.tokenOut.slice(0, 8)),
        ];
        const id = hopSymbols.join("→");
        if (!liveRouteIds.has(id)) {
          const hops: RouteHop[] = path.map((step) => {
            const pair = UV2_PAIRS[step.pairIdx];
            const tokenInSymbol = TOKEN_SYMBOLS[step.tokenIn] ?? step.tokenIn.slice(0, 8);
            const tokenOutSymbol = TOKEN_SYMBOLS[step.tokenOut] ?? step.tokenOut.slice(0, 8);
            return {
              pool: pair.address,
              poolLabel: pair.label,
              poolType: POOL_TYPE_LABELS[PoolType.Custom],
              tokenIn: step.tokenIn,
              tokenInSymbol,
              tokenOut: step.tokenOut,
              tokenOutSymbol,
              amountIn: "0",
              amountOut: "0",
              feeBps: "30",
              priceImpactBps: "0",
            } satisfies RouteHop;
          });
          routes.push({
            id,
            tokenIn,
            tokenOut,
            amountIn: amountIn.toString(),
            amountOut: "0",
            minAmountOut: "0",
            hops,
            totalFeeBps: (30n * BigInt(path.length)).toString(),
            totalPriceImpactBps: "0",
            routeType: "local",
            status: "no_liquidity",
          });
        }
        return;
      }
      if (path.length >= 3) return;
      const edges = fullGraph.get(currentToken) ?? [];
      for (const edge of edges) {
        if (visited2.has(edge.neighbour)) continue;
        visited2.add(edge.neighbour);
        path.push({ pairIdx: edge.pairIdx, tokenIn: currentToken, tokenOut: edge.neighbour });
        dryDfs(edge.neighbour, path, visited2);
        path.pop();
        visited2.delete(edge.neighbour);
      }
    }

    const visited2 = new Set<string>([tokenInLc]);
    dryDfs(tokenInLc, [], visited2);

    // ── 6. Append cross-chain stub routes ────────────────────────────────────
    const stub = (
      id: string,
      routeType: SwapRouteResult["routeType"],
      status: SwapRouteResult["status"],
      totalFeeBps = "0",
    ): SwapRouteResult => ({
      id,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      amountOut: "0",
      minAmountOut: "0",
      hops: [],
      totalFeeBps,
      totalPriceImpactBps: "0",
      routeType,
      status,
    });

    const crossChainStubs: SwapRouteResult[] = [
      // XCM parachains
      stub("RelayTeleport (XCM)", "xcm", "live"),
      stub("Hydration Omnipool (XCM)", "xcm", "mainnet_only", "30"),
      stub("Bifrost DEX (XCM)", "xcm", "mainnet_only", "30"),
      // Local Polkadot Hub DEX — also appears in On-chain Routes when pair exists
      stub("Uniswap V2 (Polkadot Hub)", "local", "live", "30"),
      stub("Karura DEX (XCM)", "xcm", "mainnet_only", "30"),
      stub("Interlay Loans (XCM)", "xcm", "mainnet_only"),
      // The Moonbeam adapter (slot 7) routes via XCM to Moonbeam para 2004.
      stub("Moonbeam DEX (XCM)", "xcm", "coming_soon", "30"),
      // EVM bridges
      stub("Hyperbridge (ISMP)", "bridge", "mainnet_only"),
      stub("Snowbridge (BridgeHub → Ethereum)", "bridge", "coming_soon"),
      stub("ChainFlip (Polkadot → Ethereum)", "bridge", "coming_soon"),
    ];

    // ── 7. Sort: live routes first (best amountOut), dry paths next, then stubs ─
    const liveRoutes = routes
      .filter((r) => r.status === "live")
      .sort((a, b) => Number(BigInt(b.amountOut) - BigInt(a.amountOut)));
    const dryRoutes = routes.filter((r) => r.status === "no_liquidity");

    swapLog.debug(
      {
        tokenIn: TOKEN_SYMBOLS[tokenInLc] ?? tokenInLc,
        tokenOut: TOKEN_SYMBOLS[tokenOutLc] ?? tokenOutLc,
        liveCount: liveRoutes.length,
        dryCount: dryRoutes.length,
      },
      "findRoutes complete",
    );

    return [...liveRoutes, ...dryRoutes, ...crossChainStubs];
  }
}
