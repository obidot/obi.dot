import type { FastifyInstance } from "fastify";
import type { SignerService } from "../../services/signer.service.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Vault API Routes
// ─────────────────────────────────────────────────────────────────────────────

export function registerVaultRoutes(
  app: FastifyInstance,
  signerService: SignerService,
): void {
  /** GET /api/vault/state — Current on-chain vault state. */
  app.get("/api/vault/state", async () => {
    try {
      const state = await signerService.fetchVaultState();
      return {
        success: true,
        data: {
          totalAssets: state.totalAssets.toString(),
          idleBalance: state.idleBalance.toString(),
          totalRemoteAssets: state.totalRemoteAssets.toString(),
          paused: state.paused,
          emergencyMode: state.emergencyMode,
          nonce: state.nonce.toString(),
          dailyLoss: state.dailyLoss.toString(),
          maxDailyLoss: state.maxDailyLoss.toString(),
          strategyCounter: state.strategyCounter.toString(),
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  /** GET /api/vault/performance — PnL and fee metrics. */
  app.get("/api/vault/performance", async () => {
    try {
      const state = await signerService.fetchVaultState();
      return {
        success: true,
        data: {
          totalAssets: state.totalAssets.toString(),
          idleBalance: state.idleBalance.toString(),
          totalRemoteAssets: state.totalRemoteAssets.toString(),
          paused: state.paused,
          emergencyMode: state.emergencyMode,
          strategist: signerService.strategistAddress,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
}
