import type { FastifyInstance } from "fastify";
import type { YieldService } from "../../services/yield.service.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Yield API Routes
// ─────────────────────────────────────────────────────────────────────────────

export function registerYieldRoutes(
  app: FastifyInstance,
  yieldService: YieldService,
): void {
  /** GET /api/yields — All protocol yields (DeFiLlama + tracked). */
  app.get("/api/yields", async () => {
    try {
      const yields = await yieldService.fetchYields();
      return {
        success: true,
        data: yields.map((y) => ({
          name: y.name,
          protocol: y.protocol,
          protocolLabel: y.protocolLabel,
          paraId: y.paraId,
          apyPercent: y.apyPercent,
          tvlUsd: y.tvlUsd,
          fetchedAt: y.fetchedAt.toISOString(),
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  /** GET /api/yields/bifrost — Bifrost-specific yields. */
  app.get("/api/yields/bifrost", async () => {
    try {
      const bifrostYields = await yieldService.fetchBifrostYields();
      return {
        success: true,
        data: bifrostYields.map((y) => ({
          name: y.name,
          protocol: y.protocol,
          protocolLabel: y.protocolLabel,
          category: y.category,
          apyPercent: y.apyPercent,
          tvlUsd: y.tvlUsd,
          isActive: y.isActive,
          fetchedAt: y.fetchedAt.toISOString(),
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  /** GET /api/yields/uniswap — UniswapV2 pair yield data. */
  app.get("/api/yields/uniswap", async () => {
    try {
      const uniswapYields = await yieldService.fetchUniswapV2Yields();
      return {
        success: true,
        data: uniswapYields.map((y) => ({
          name: y.name,
          protocolLabel: y.protocolLabel,
          protocol: y.protocol,
          address: y.address,
          token0: y.token0,
          token1: y.token1,
          reserve0: y.reserve0,
          reserve1: y.reserve1,
          apyPercent: y.apyPercent,
          tvlUsd: y.tvlUsd,
          category: y.category,
          fetchedAt: y.fetchedAt.toISOString(),
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
}
