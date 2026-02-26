import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
//  Environment Variable Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strict Zod schema for all required environment variables.
 * Parsing this at startup guarantees the agent will not run with
 * missing or malformed configuration — fail-fast before any RPC call.
 */
const envSchema = z.object({
  /** OpenAI API key for LangChain GPT-4o reasoning. */
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),

  /** Hex-encoded secp256k1 private key (with 0x prefix) of the strategist agent. */
  AGENT_PRIVATE_KEY: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{64}$/,
      "AGENT_PRIVATE_KEY must be a 0x-prefixed 64-char hex string",
    ),

  /** JSON-RPC endpoint for Polkadot Hub EVM. */
  RPC_URL: z
    .string()
    .url("RPC_URL must be a valid URL")
    .default("https://services.polkadothub-rpc.com/testnet"),

  /** Deployed ObidotVault contract address. */
  VAULT_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "VAULT_ADDRESS must be a valid EVM address"),

  /** Underlying ERC-20 asset address used by the vault. */
  ASSET_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "ASSET_ADDRESS must be a valid EVM address"),

  /** Autonomous loop interval in minutes. */
  LOOP_INTERVAL_MINUTES: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default("5"),

  /** Log level for pino. */
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  /** Maximum single strategy deployment in asset units (18-decimal string). */
  MAX_STRATEGY_AMOUNT: z.string().default("100000000000000000000000"), // 100k tokens

  /** Default maximum slippage in basis points. */
  DEFAULT_MAX_SLIPPAGE_BPS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(500))
    .default("100"), // 1%

  /** Intent deadline offset in seconds from now. */
  INTENT_DEADLINE_SECONDS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .default("600"), // 10 minutes

  // ── Oracle Configuration (optional) ────────────────────────────────────

  /** KeeperOracle contract address on Polkadot Hub. */
  KEEPER_ORACLE_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** OracleRegistry contract address on Polkadot Hub. */
  ORACLE_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** Heartbeat monitor interval in milliseconds (default: 30 min). */
  ORACLE_HEARTBEAT_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive())
    .optional(),

  /** Deviation threshold in basis points for price updates (default: 100 = 1%). */
  ORACLE_DEVIATION_BPS: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(5000))
    .optional(),

  /** Pyth Hermes API URL. */
  PYTH_HERMES_URL: z.string().url().optional(),

  /** CoinGecko API key (optional, for higher rate limits). */
  COINGECKO_API_KEY: z.string().min(1).optional(),

  /** Binance API URL. */
  BINANCE_API_URL: z.string().url().optional(),

  /** Pyth DOT/USD feed ID (hex). */
  PYTH_DOT_USD_FEED_ID: z.string().optional(),

  // ── Cross-Chain Configuration (optional) ─────────────────────────────

  /** CrossChainRouter contract address on Polkadot Hub. */
  CROSS_CHAIN_ROUTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** BifrostAdapter contract address on Polkadot Hub. */
  BIFROST_ADAPTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  // ── Satellite EVM Chain RPC URLs (optional) ──────────────────────────

  /** Ethereum mainnet RPC URL for satellite vault. */
  ETH_RPC_URL: z.string().url().optional(),
  /** Ethereum satellite vault contract address. */
  ETH_SATELLITE_VAULT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** Arbitrum One RPC URL for satellite vault. */
  ARB_RPC_URL: z.string().url().optional(),
  /** Arbitrum satellite vault contract address. */
  ARB_SATELLITE_VAULT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** Base RPC URL for satellite vault. */
  BASE_RPC_URL: z.string().url().optional(),
  /** Base satellite vault contract address. */
  BASE_SATELLITE_VAULT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** Optimism RPC URL for satellite vault. */
  OP_RPC_URL: z.string().url().optional(),
  /** Optimism satellite vault contract address. */
  OP_SATELLITE_VAULT: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
//  Parse & Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validated environment configuration.
 * Throws a descriptive ZodError at import time if any variable is invalid.
 */
export const env = envSchema.parse(process.env);

/** Inferred type of the validated environment. */
export type Env = z.infer<typeof envSchema>;
