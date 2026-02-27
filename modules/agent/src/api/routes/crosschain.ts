import type { FastifyInstance } from "fastify";
import type { CrossChainService } from "../../services/crosschain.service.js";
import type { SignerService } from "../../services/signer.service.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Cross-Chain API Routes
// ─────────────────────────────────────────────────────────────────────────────

export function registerCrossChainRoutes(
  app: FastifyInstance,
  crossChainService: CrossChainService,
  signerService: SignerService,
): void {
  /** GET /api/crosschain/state — Hub + satellite vault states. */
  app.get("/api/crosschain/state", async () => {
    try {
      if (!crossChainService.hasSatellites) {
        return {
          success: true,
          data: {
            hasSatellites: false,
            hub: { chain: "Polkadot Hub Testnet" },
            satellites: [],
          },
          timestamp: Date.now(),
        };
      }

      const vaultState = await signerService.fetchVaultState();
      const state =
        await crossChainService.fetchCrossChainState(vaultState);

      return {
        success: true,
        data: {
          hasSatellites: true,
          globalTotalAssets: state.globalTotalAssets.toString(),
          totalSatelliteAssets: state.totalSatelliteAssets.toString(),
          satellites: state.satelliteAssets.map((s) => ({
            chainId: s.chainId,
            chainName: s.chainName,
            totalAssets: s.totalAssets.toString(),
            emergencyMode: s.emergencyMode,
            lastSyncTimestamp: s.lastSyncTimestamp,
          })),
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });
}
