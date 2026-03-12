import type { FastifyInstance } from "fastify";
import type { SwapRouterService } from "../../services/swap-router.service.js";
import { POOL_TYPE_LABELS, type PoolType } from "../../types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Swap API Routes — DEX Aggregator Endpoints
// ─────────────────────────────────────────────────────────────────────────────

export function registerSwapRoutes(
  app: FastifyInstance,
  swapRouterService: SwapRouterService,
): void {
  /**
   * GET /api/swap/quote — Get the best swap quote across pool adapters.
   *
   * Query params:
   *   pool     - Pool address (0x…)
   *   tokenIn  - Input token address (0x…)
   *   tokenOut - Output token address (0x…)
   *   amountIn - Amount in wei (string)
   */
  app.get<{
    Querystring: {
      pool: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
    };
  }>("/api/swap/quote", async (request) => {
    try {
      const { pool, tokenIn, tokenOut, amountIn } = request.query;

      if (!pool || !tokenIn || !tokenOut || !amountIn) {
        return {
          success: false,
          error:
            "Missing required query params: pool, tokenIn, tokenOut, amountIn",
        };
      }

      if (!swapRouterService.isQuoterDeployed) {
        return {
          success: false,
          error: "SwapQuoter is not yet deployed",
        };
      }

      const [bestQuote, allQuotes] = await Promise.all([
        swapRouterService.getBestQuote(
          pool as `0x${string}`,
          tokenIn as `0x${string}`,
          tokenOut as `0x${string}`,
          BigInt(amountIn),
        ),
        swapRouterService.getAllQuotes(
          pool as `0x${string}`,
          tokenIn as `0x${string}`,
          tokenOut as `0x${string}`,
          BigInt(amountIn),
        ),
      ]);

      return {
        success: true,
        data: {
          bestQuote: bestQuote
            ? {
                source:
                  POOL_TYPE_LABELS[bestQuote.source as PoolType] ??
                  String(bestQuote.source),
                pool: bestQuote.pool,
                feeBps: bestQuote.feeBps.toString(),
                amountIn: bestQuote.amountIn.toString(),
                amountOut: bestQuote.amountOut.toString(),
              }
            : null,
          allQuotes: allQuotes.map((q) => ({
            source: POOL_TYPE_LABELS[q.source as PoolType] ?? String(q.source),
            pool: q.pool,
            feeBps: q.feeBps.toString(),
            amountIn: q.amountIn.toString(),
            amountOut: q.amountOut.toString(),
          })),
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  /**
   * GET /api/swap/routes — List all registered pool adapters and their status.
   */
  app.get("/api/swap/routes", async () => {
    try {
      const adapters = swapRouterService.getPoolAdapters();
      const [routerDeployed, quoterDeployed, paused] = await Promise.all([
        Promise.resolve(swapRouterService.isRouterDeployed),
        Promise.resolve(swapRouterService.isQuoterDeployed),
        swapRouterService.isRouterPaused(),
      ]);

      return {
        success: true,
        data: {
          routerDeployed,
          quoterDeployed,
          paused,
          adapters: adapters.map((a) => ({
            poolType: POOL_TYPE_LABELS[a.poolType] ?? String(a.poolType),
            address: a.address,
            deployed: a.deployed,
          })),
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
}
