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
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const apiLog = logger.child({ module: "api" });

const API_PORT = env.API_PORT;
const API_HOST = env.API_HOST;
const API_PORT_MAX_TRIES = env.API_PORT_MAX_TRIES;

interface ListenError extends Error {
  code?: string;
}

function isAddressInUseError(error: unknown): error is ListenError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code === "EADDRINUSE"
  );
}

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
    let listenPort = API_PORT;
    let attempt = 1;

    while (attempt <= API_PORT_MAX_TRIES) {
      try {
        await app.listen({ port: listenPort, host: API_HOST });
        apiLog.info(
          { port: listenPort, host: API_HOST, attempts: attempt },
          "API server listening",
        );
        return;
      } catch (error) {
        if (!isAddressInUseError(error) || attempt >= API_PORT_MAX_TRIES) {
          throw error;
        }

        const nextPort = listenPort + 1;
        apiLog.warn(
          { port: listenPort, nextPort, attempt, maxTries: API_PORT_MAX_TRIES },
          "API port in use — retrying with next port",
        );

        listenPort = nextPort;
        attempt += 1;
      }
    }
  } catch (error) {
    apiLog.error({ err: error }, "Failed to start API server");
    throw error;
  }
}
