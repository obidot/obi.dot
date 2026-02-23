import { logger } from "./utils/logger.js";
import { AutonomousLoop } from "./agent/loop.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Main Entrypoint — Obidot Autonomous CFO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bootstrap and run the Obidot AI agent.
 *
 * Lifecycle:
 *   1. Import `env.ts` (validates environment variables via Zod — fails fast)
 *   2. Initialize the AutonomousLoop (SignerService, YieldService, ObiKit, LLM)
 *   3. Register graceful shutdown handlers (SIGINT, SIGTERM)
 *   4. Start the infinite perception → reasoning → execution loop
 */
async function main(): Promise<void> {
  logger.info("════════════════════════════════════════════════════════════");
  logger.info("  Obidot Autonomous CFO — Starting Up");
  logger.info("════════════════════════════════════════════════════════════");

  const loop = new AutonomousLoop();

  // ── Graceful Shutdown ──────────────────────────────────────────────────
  const shutdown = () => {
    logger.info("Shutdown signal received — completing current cycle...");
    loop.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception — shutting down");
    loop.stop();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });

  // ── Start ──────────────────────────────────────────────────────────────
  try {
    await loop.start();
  } catch (error) {
    logger.fatal({ err: error }, "Fatal error in autonomous loop");
    process.exit(1);
  }

  logger.info("Obidot Autonomous CFO — Shutdown complete");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Run
// ─────────────────────────────────────────────────────────────────────────────

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", error);
  process.exit(1);
});
