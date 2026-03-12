import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured logger for the Obidot Autonomous CFO.
 *
 * Uses pino for high-performance, JSON-structured logging suitable for
 * both local development (pino-pretty) and production log aggregation.
 *
 * All agent subsystems should import this singleton rather than
 * instantiating their own loggers, ensuring consistent formatting
 * and level filtering across the process.
 */
export const logger = pino({
  name: "obidot-agent",
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  serializers: {
    err: pino.stdSerializers.err,
  },
});

/** Pre-bound child loggers for each subsystem. */
export const signerLog = logger.child({ module: "signer" });
export const agentLog = logger.child({ module: "agent" });
export const yieldLog = logger.child({ module: "yield" });
export const loopLog = logger.child({ module: "loop" });
export const swapLog = logger.child({ module: "swap" });
export const intentLog = logger.child({ module: "intent" });
