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
}
