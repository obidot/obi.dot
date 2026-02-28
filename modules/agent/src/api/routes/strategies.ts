import type { FastifyInstance } from "fastify";
import { strategyStore } from "../../services/strategy-store.service.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Strategy API Routes
// ─────────────────────────────────────────────────────────────────────────────

export function registerStrategyRoutes(app: FastifyInstance): void {
  /** GET /api/strategies — Strategy execution history. */
  app.get("/api/strategies", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? "50"), 100);
    const offset = Number(query.offset ?? "0");

    return {
      success: true,
      data: strategyStore.getStrategies(limit, offset),
      total: strategyStore.getStrategyCount(),
      limit,
      offset,
      timestamp: Date.now(),
    };
  });
}
