import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { AutonomousLoop } from "./agent/loop.js";
import { startTelegramBot } from "./telegram/bot.js";
import { startApiServer } from "./api/server.js";

/**
 * Bootstrap and run the Obidot AI agent.
 *
 * Lifecycle:
 *   1. Validate environment variables (Zod — fails fast)
 *   2. Initialize AutonomousLoop (SignerService, YieldService, ObiKit, LLM)
 *   3. Start the API server (Fastify HTTP + WebSocket)
 *   4. Optionally start the Telegram bot (when TELEGRAM_BOT_TOKEN is set)
 *   5. Register graceful shutdown handlers (SIGINT, SIGTERM)
 *   6. Start the infinite perception → reasoning → execution loop
 */
async function main(): Promise<void> {
  const loop = new AutonomousLoop();
  const tools = loop.getTools();
  const services = loop.getServices();

  // ── API Server ─────────────────────────────────────────────────────────
  try {
    await startApiServer({
      signerService: services.signerService,
      yieldService: services.yieldService,
      crossChainService: services.crossChainService,
      swapRouterService: services.swapRouterService,
      tools,
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to start API server — continuing without it",
    );
  }

  // ── Telegram Bot (optional) ────────────────────────────────────────────
  if (env.TELEGRAM_BOT_TOKEN) {
    logger.info("Telegram bot token detected — starting bot...");
    try {
      await startTelegramBot(tools);
      logger.info("Telegram bot started successfully");
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to start Telegram bot — continuing without it",
      );
    }
  } else {
    logger.info("No TELEGRAM_BOT_TOKEN — Telegram bot disabled");
  }

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
