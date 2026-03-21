import dotenv from "dotenv";
import { z } from "zod";

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
  /**
   * LLM provider selection.
   * "openai" (default) — ChatOpenAI (GPT-5-mini or configured model).
   * "anthropic"        — ChatAnthropic (claude-sonnet-4 or configured model).
   * "openrouter"       — OpenRouter proxy (requires OPENAI_API_KEY as the API key).
   */
  LLM_PROVIDER: z.enum(["openai", "anthropic", "openrouter"]).default("openai"),

  /**
   * LLM model string.
   * For openai:      "gpt-5-mini" (default), "gpt-4o", "gpt-4o-mini", etc.
   * For anthropic:   "claude-sonnet-4-5" (default), "claude-3-5-haiku-20241022", etc.
   * For openrouter:  e.g. "anthropic/claude-sonnet-4", "openai/gpt-5-mini"
   */
  LLM_MODEL: z.string().min(1).optional(),

  /** OpenAI API key (required for openai and openrouter providers). */
  OPENAI_API_KEY: z.string().min(1).optional(),

  /** Anthropic API key (required for anthropic provider). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

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

  /** API host binding. Use 0.0.0.0 to expose on LAN/local docker. */
  API_HOST: z.string().min(1).default("0.0.0.0"),

  /** Preferred API listening port. */
  API_PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(65_535))
    .default("3011"),

  /**
   * Number of consecutive ports to try when the preferred API port is already in use.
   * Example: API_PORT=3011 and API_PORT_MAX_TRIES=5 attempts 3011-3015.
   */
  API_PORT_MAX_TRIES: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .default("5"),

  /**
   * Suppress noisy @polkadot/util duplicate ESM/CJS warnings when they are same-version duplicates.
   * NOTE: This does not suppress real version mismatches.
   */
  POLKADOTJS_DISABLE_ESM_CJS_WARNING: z.enum(["0", "1"]).default("1"),

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

  // ── DEX Aggregator Configuration (optional) ──────────────────────────

  /** SwapRouter contract address on Polkadot Hub. */
  SWAP_ROUTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** SwapQuoter contract address on Polkadot Hub. */
  SWAP_QUOTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** HydrationOmnipoolAdapter contract address on Polkadot Hub. */
  HYDRATION_ADAPTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** AssetHubPairAdapter contract address on Polkadot Hub. */
  ASSET_HUB_ADAPTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

  /** BifrostDEXAdapter contract address on Polkadot Hub. */
  BIFROST_DEX_ADAPTER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),

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

  // ── Telegram Configuration (optional) ──────────────────────────────────

  /** Telegram bot token from @BotFather. When set, enables the Telegram bot. */
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
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
