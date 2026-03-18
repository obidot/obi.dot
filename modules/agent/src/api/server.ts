import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { SignerService } from "../services/signer.service.js";
import { YieldService } from "../services/yield.service.js";
import { CrossChainService } from "../services/crosschain.service.js";
import { SwapRouterService } from "../services/swap-router.service.js";
import { eventBus } from "../services/event-bus.service.js";
import { registerVaultRoutes } from "./routes/vault.js";
import { registerYieldRoutes } from "./routes/yields.js";
import { registerStrategyRoutes } from "./routes/strategies.js";
import { registerCrossChainRoutes } from "./routes/crosschain.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerSwapRoutes } from "./routes/swap.js";
import { logger } from "../utils/logger.js";

const apiLog = logger.child({ module: "api" });

const API_PORT = Number(process.env["API_PORT"] ?? "3001");
const API_HOST = process.env["API_HOST"] ?? "0.0.0.0";

export interface ApiDependencies {
  signerService: SignerService;
  yieldService: YieldService;
  crossChainService: CrossChainService;
  swapRouterService: SwapRouterService;
  tools: StructuredToolInterface[];
}

/**
 * Creates and starts the Fastify API server with HTTP routes and WebSocket.
 */
export async function startApiServer(deps: ApiDependencies): Promise<void> {
  const app = Fastify({ logger: false });

  // ── Plugins ────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });

  await app.register(websocket);

  // ── Health Check ───────────────────────────────────────────────────
  app.get("/api/health", async () => ({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
  }));

  // ── HTTP Routes ────────────────────────────────────────────────────
  registerVaultRoutes(app, deps.signerService);
  registerYieldRoutes(app, deps.yieldService);
  registerStrategyRoutes(app);
  registerCrossChainRoutes(app, deps.crossChainService, deps.signerService);
  registerAgentRoutes(app, deps.tools);
  registerSwapRoutes(app, deps.swapRouterService);

  // ── WebSocket ──────────────────────────────────────────────────────
  app.register(async (fastify) => {
    fastify.get("/ws", { websocket: true }, (socket) => {
      apiLog.info("WebSocket client connected");

      const handler = (event: unknown) => {
        try {
          socket.send(JSON.stringify(event));
        } catch {
          // Client disconnected
        }
      };

      eventBus.onEvent(handler);

      socket.on("close", () => {
        eventBus.offEvent(handler);
        apiLog.info("WebSocket client disconnected");
      });

      socket.on("error", () => {
        eventBus.offEvent(handler);
      });
    });
  });

  // ── Start ──────────────────────────────────────────────────────────
  try {
    await app.listen({ port: API_PORT, host: API_HOST });
    apiLog.info({ port: API_PORT, host: API_HOST }, "API server listening");
  } catch (error) {
    apiLog.error({ err: error }, "Failed to start API server");
    throw error;
  }
}
