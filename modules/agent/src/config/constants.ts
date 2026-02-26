import type { Address, Hex } from "viem";
import { env } from "./env.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Network Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Polkadot Hub Testnet (Paseo) Chain ID. */
export const CHAIN_ID = 420_420_417;

/** JSON-RPC endpoint for Polkadot Hub EVM. */
export const RPC_URL = env.RPC_URL;

// ─────────────────────────────────────────────────────────────────────────────
//  Contract Addresses
// ─────────────────────────────────────────────────────────────────────────────

/** Deployed ObidotVault proxy/implementation address. */
export const VAULT_ADDRESS = env.VAULT_ADDRESS as Address;

/** The underlying ERC-20 asset managed by the vault. */
export const ASSET_ADDRESS = env.ASSET_ADDRESS as Address;

/** XCM precompile address on Polkadot Hub EVM (REVM). */
export const XCM_PRECOMPILE_ADDRESS =
  "0x00000000000000000000000000000000000a0000" as Address;

// ─────────────────────────────────────────────────────────────────────────────
//  EIP-712 Domain Separator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EIP-712 typed data domain matching the on-chain DOMAIN_SEPARATOR computed
 * in the ObidotVault constructor. Must stay in sync with the Solidity values:
 *   name:              "ObidotVault"
 *   version:           "1"
 *   chainId:           420420417
 *   verifyingContract: <vault address>
 */
export const EIP712_DOMAIN = {
  name: "ObidotVault" as const,
  version: "1" as const,
  chainId: BigInt(CHAIN_ID),
  verifyingContract: VAULT_ADDRESS,
} as const;

/**
 * EIP-712 type definitions for the StrategyIntent struct.
 * Field ordering must match the Solidity STRATEGY_INTENT_TYPEHASH exactly:
 *   StrategyIntent(address asset,uint256 amount,uint256 minReturn,
 *     uint256 maxSlippageBps,uint256 deadline,uint256 nonce,
 *     bytes xcmCall,uint32 targetParachain,address targetProtocol)
 */
export const STRATEGY_INTENT_TYPES = {
  StrategyIntent: [
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "minReturn", type: "uint256" },
    { name: "maxSlippageBps", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "xcmCall", type: "bytes" },
    { name: "targetParachain", type: "uint32" },
    { name: "targetProtocol", type: "address" },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Vault ABI (minimal — only the functions we read/write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal ABI subset of ObidotVault used by the agent.
 * Includes read functions for nonce, policy state, and the executeStrategy write.
 */
export const VAULT_ABI = [
  // ── Read Functions ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "strategist", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalRemoteAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "strategyCounter",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "depositCap",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "emergencyMode",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowedParachains",
    inputs: [{ name: "parachainId", type: "uint32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowedTargets",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolExposure",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxProtocolExposure",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxDailyLoss",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dailyLossAccumulator",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "asset",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },

  // ── Strategy Tracking ───────────────────────────────────────────────────
  {
    type: "function",
    name: "strategies",
    inputs: [{ name: "strategyId", type: "uint256" }],
    outputs: [
      { name: "strategist", type: "address" },
      { name: "targetProtocol", type: "address" },
      { name: "targetParachain", type: "uint32" },
      { name: "amount", type: "uint256" },
      { name: "minReturn", type: "uint256" },
      { name: "executedAt", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
    stateMutability: "view",
  },

  // ── Write Functions ────────────────────────────────────────────────────
  {
    type: "function",
    name: "reportStrategyOutcome",
    inputs: [
      { name: "strategyId", type: "uint256" },
      { name: "success", type: "bool" },
      { name: "returnedAmount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeStrategy",
    inputs: [
      {
        name: "intent",
        type: "tuple",
        components: [
          { name: "asset", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "minReturn", type: "uint256" },
          { name: "maxSlippageBps", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "xcmCall", type: "bytes" },
          { name: "targetParachain", type: "uint32" },
          { name: "targetProtocol", type: "address" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "strategyId", type: "uint256" }],
    stateMutability: "nonpayable",
  },

  // ── Errors (for decode) ────────────────────────────────────────────────
  {
    type: "error",
    name: "DeadlineExpired",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "currentTime", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidNonce",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "provided", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "UnauthorizedStrategist",
    inputs: [{ name: "recovered", type: "address" }],
  },
  { type: "error", name: "InvalidSignature", inputs: [] },
  {
    type: "error",
    name: "AssetMismatch",
    inputs: [
      { name: "expected", type: "address" },
      { name: "provided", type: "address" },
    ],
  },
  {
    type: "error",
    name: "ParachainNotAllowed",
    inputs: [{ name: "parachainId", type: "uint32" }],
  },
  {
    type: "error",
    name: "InsufficientIdleBalance",
    inputs: [
      { name: "available", type: "uint256" },
      { name: "requested", type: "uint256" },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Known Parachains & Protocols
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of known Polkadot parachains the agent may target.
 * Protocol addresses are placeholders — replace with real deployments.
 */
export const KNOWN_PARACHAINS = {
  /** Hydration (formerly HydraDX) — Omnipool DEX & liquidity hub. */
  HYDRATION: {
    paraId: 2034 as const,
    name: "Hydration",
    /** Placeholder protocol address for the Omnipool on Hydration. */
    protocol: "0x0000000000000000000000000000000000002034" as Address,
  },
  /** Bifrost — Liquid staking derivatives (SLP). */
  BIFROST: {
    paraId: 2030 as const,
    name: "Bifrost",
    /** Placeholder protocol address for vDOT staking on Bifrost. */
    protocol: "0x0000000000000000000000000000000000002030" as Address,
  },
} as const;

/**
 * Bifrost sub-protocol registry — individual DeFi products.
 * Each entry maps to a Bifrost pallet used via XCM dispatch.
 */
export const BIFROST_PROTOCOLS = {
  /** SLP: Liquid staking for DOT → vDOT, KSM → vKSM, etc. */
  SLP: {
    palletIndex: 60,
    name: "Bifrost SLP (Liquid Staking)",
    protocol: "0x0000000000000000000000000000000000002030" as Address,
  },
  /** DEX: Zenlink-based token swap. */
  DEX: {
    palletIndex: 61,
    name: "Bifrost DEX (Zenlink)",
    protocol: "0x0000000000000000000000000000000000002031" as Address,
  },
  /** Farming: Yield farming and liquidity mining. */
  FARMING: {
    palletIndex: 62,
    name: "Bifrost Farming",
    protocol: "0x0000000000000000000000000000000000002032" as Address,
  },
  /** SALP: Slot auction liquidity protocol (crowdloan derivatives). */
  SALP: {
    palletIndex: 63,
    name: "Bifrost SALP (Crowdloans)",
    protocol: "0x0000000000000000000000000000000000002033" as Address,
  },
} as const;

/** Union type of supported parachain IDs. */
export type KnownParachainId =
  (typeof KNOWN_PARACHAINS)[keyof typeof KNOWN_PARACHAINS]["paraId"];

// ─────────────────────────────────────────────────────────────────────────────
//  Cross-Chain EVM Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a satellite EVM chain connected via Hyperbridge.
 */
export interface EVMChainConfig {
  /** Unique identifier used in cross-chain messages. */
  chainId: string;
  /** Human-readable chain name. */
  name: string;
  /** JSON-RPC endpoint URL. */
  rpcUrl: string;
  /** Satellite vault address on this chain. */
  satelliteVault?: Address;
}

/**
 * Registry of supported EVM chains for cross-chain operations.
 * Populated from environment variables at startup.
 */
export const EVM_CHAINS: Record<string, EVMChainConfig> = {};

// Populate from env at import time (optional env vars)
if (env.ETH_RPC_URL) {
  EVM_CHAINS["ethereum"] = {
    chainId: "ethereum",
    name: "Ethereum Mainnet",
    rpcUrl: env.ETH_RPC_URL,
    satelliteVault: env.ETH_SATELLITE_VAULT as Address | undefined,
  };
}
if (env.ARB_RPC_URL) {
  EVM_CHAINS["arbitrum"] = {
    chainId: "arbitrum",
    name: "Arbitrum One",
    rpcUrl: env.ARB_RPC_URL,
    satelliteVault: env.ARB_SATELLITE_VAULT as Address | undefined,
  };
}
if (env.BASE_RPC_URL) {
  EVM_CHAINS["base"] = {
    chainId: "base",
    name: "Base",
    rpcUrl: env.BASE_RPC_URL,
    satelliteVault: env.BASE_SATELLITE_VAULT as Address | undefined,
  };
}
if (env.OP_RPC_URL) {
  EVM_CHAINS["optimism"] = {
    chainId: "optimism",
    name: "Optimism",
    rpcUrl: env.OP_RPC_URL,
    satelliteVault: env.OP_SATELLITE_VAULT as Address | undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Cross-Chain Contract Addresses
// ─────────────────────────────────────────────────────────────────────────────

/** CrossChainRouter address on Polkadot Hub. */
export const CROSS_CHAIN_ROUTER_ADDRESS = (env.CROSS_CHAIN_ROUTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** BifrostAdapter address on Polkadot Hub. */
export const BIFROST_ADAPTER_ADDRESS = (env.BIFROST_ADAPTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

// ─────────────────────────────────────────────────────────────────────────────
//  Cross-Chain Contract ABIs (minimal)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for BifrostAdapter read/write via agent. */
export const BIFROST_ADAPTER_ABI = [
  {
    type: "function",
    name: "previewStrategy",
    inputs: [
      { name: "strategyType", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "currencyIn", type: "uint8" },
      { name: "currencyOut", type: "uint8" },
    ],
    outputs: [{ name: "estimatedReturn", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "executeBifrostStrategy",
    inputs: [
      { name: "strategyType", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "currencyIn", type: "uint8" },
      { name: "currencyOut", type: "uint8" },
      { name: "poolId", type: "uint32" },
      { name: "minOutput", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** Minimal ABI for CrossChainRouter read/write via agent. */
export const CROSS_CHAIN_ROUTER_ABI = [
  {
    type: "function",
    name: "broadcastAssetSync",
    inputs: [
      { name: "totalAssets", type: "uint256" },
      { name: "totalShares", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "satelliteChains",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

/** Minimal ABI for ObidotVaultEVM (satellite) reads. */
export const SATELLITE_VAULT_ABI = [
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "globalTotalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "globalTotalShares",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "emergencyMode",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lastSyncTimestamp",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Hub Vault Extended ABI (cross-chain reads)
// ─────────────────────────────────────────────────────────────────────────────

/** Additional ABI entries for cross-chain state on the hub vault. */
export const VAULT_CROSS_CHAIN_ABI = [
  {
    type: "function",
    name: "totalSatelliteAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "globalTotalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "crossChainRouter",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "bifrostAdapter",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Agent Parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum strategy deployment amount (parsed from env). */
export const MAX_STRATEGY_AMOUNT = BigInt(env.MAX_STRATEGY_AMOUNT);

/** Default max slippage in basis points (parsed from env). */
export const DEFAULT_MAX_SLIPPAGE_BPS = BigInt(env.DEFAULT_MAX_SLIPPAGE_BPS);

/** EIP-712 intent deadline offset in seconds. */
export const INTENT_DEADLINE_SECONDS = BigInt(env.INTENT_DEADLINE_SECONDS);

/** Minimum APY delta (in percentage points) to justify a cross-chain reallocation. */
export const MIN_APY_DELTA_THRESHOLD = 0.5;

/** Estimated XCM execution cost as a fraction of the strategy amount. */
export const ESTIMATED_XCM_COST_BPS = 15; // 0.15%

/** Estimated Hyperbridge ISMP cost as a fraction for cross-chain messages. */
export const ESTIMATED_ISMP_COST_BPS = 25; // 0.25%

/** Maximum allowed satellite sync age before skipping cycle (seconds). */
export const MAX_SATELLITE_SYNC_AGE = 3600; // 1 hour

/** Placeholder XCM call payload — in production, encode real XCM instructions. */
export const PLACEHOLDER_XCM_CALL =
  "0x0304000100a10f04000101000700e8764817040d0100040001010070c2eb0b1abf691cc65a18bd0a3b005cc190a0ecbfdd2b69cb15157c2a841e6d" as Hex;
