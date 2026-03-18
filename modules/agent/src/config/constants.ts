import type { Address, Hex } from "viem";
import { env } from "./env.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Network Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Polkadot Hub TestNet Chain ID. */
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
//  DEX Aggregator Contract Addresses
// ─────────────────────────────────────────────────────────────────────────────

/** SwapRouter address on Polkadot Hub (zero-address if not yet deployed). */
export const SWAP_ROUTER_ADDRESS = (env.SWAP_ROUTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** SwapQuoter address on Polkadot Hub (zero-address if not yet deployed). */
export const SWAP_QUOTER_ADDRESS = (env.SWAP_QUOTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** HydrationOmnipoolAdapter address (zero-address if not yet deployed). */
export const HYDRATION_ADAPTER_ADDRESS = (env.HYDRATION_ADAPTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** AssetHubPairAdapter address (zero-address if not yet deployed). */
export const ASSET_HUB_ADAPTER_ADDRESS = (env.ASSET_HUB_ADAPTER_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** BifrostDEXAdapter address (zero-address if not yet deployed). */
export const BIFROST_DEX_ADAPTER_ADDRESS = (env.BIFROST_DEX_ADAPTER_ADDRESS ??
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
//  Vault ABI — New Intent & Swap Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Additional ABI entries for executeIntent, executeLocalSwap, and related
 * functions added in the DEX aggregator update.
 */
export const VAULT_INTENT_ABI = [
  // ── Read Functions ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "intentNonces",
    inputs: [{ name: "solver", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "swapRouter",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SOLVER_ROLE",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },

  // ── Write Functions ────────────────────────────────────────────────────
  {
    type: "function",
    name: "executeIntent",
    inputs: [
      {
        name: "intent",
        type: "tuple",
        components: [
          {
            name: "inAsset",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "assetId", type: "uint256" },
            ],
          },
          {
            name: "outAsset",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "assetId", type: "uint256" },
            ],
          },
          { name: "amount", type: "uint256" },
          { name: "minOut", type: "uint256" },
          {
            name: "dest",
            type: "tuple",
            components: [
              { name: "destType", type: "uint8" },
              { name: "paraId", type: "uint32" },
              { name: "chainId", type: "uint8" },
            ],
          },
          { name: "calldata_", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "messageId", type: "uint64" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeLocalSwap",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "route",
            type: "tuple",
            components: [
              { name: "poolType", type: "uint8" },
              { name: "pool", type: "address" },
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "feeBps", type: "uint256" },
              { name: "data", type: "bytes32" },
            ],
          },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
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
    outputs: [
      { name: "strategyId", type: "uint256" },
      { name: "amountOut", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setSwapRouter",
    inputs: [{ name: "router", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ── Events ─────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "IntentExecuted",
    inputs: [
      { name: "messageId", type: "uint64", indexed: true },
      { name: "strategist", type: "address", indexed: true },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LocalSwapExecuted",
    inputs: [
      { name: "strategyId", type: "uint256", indexed: true },
      { name: "strategist", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SwapRouterUpdated",
    inputs: [{ name: "newRouter", type: "address", indexed: true }],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  SwapRouter ABI (minimal)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for SwapRouter read/write via agent. */
export const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "swap",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "route",
            type: "tuple",
            components: [
              { name: "poolType", type: "uint8" },
              { name: "pool", type: "address" },
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "feeBps", type: "uint256" },
              { name: "data", type: "bytes32" },
            ],
          },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapMultiHop",
    inputs: [
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "poolType", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "feeBps", type: "uint256" },
          { name: "data", type: "bytes32" },
        ],
      },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "adapters",
    inputs: [{ name: "poolType", type: "uint8" }],
    outputs: [{ name: "", type: "address" }],
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
//  SwapQuoter ABI (minimal)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for SwapQuoter reads via agent. */
export const SWAP_QUOTER_ABI = [
  {
    type: "function",
    name: "getBestQuote",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "source", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "feeBps", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOut", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllQuotes",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "source", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "feeBps", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOut", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteMultiHop",
    inputs: [
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "poolType", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "feeBps", type: "uint256" },
          { name: "data", type: "bytes32" },
        ],
      },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "finalAmountOut", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buildBestSwap",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "slippageBps", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          {
            name: "route",
            type: "tuple",
            components: [
              { name: "poolType", type: "uint8" },
              { name: "pool", type: "address" },
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "feeBps", type: "uint256" },
              { name: "data", type: "bytes32" },
            ],
          },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  IPoolAdapter ABI (minimal)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal ABI for IPoolAdapter reads via agent. */
export const POOL_ADAPTER_ABI = [
  {
    type: "function",
    name: "getAmountOut",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "data", type: "bytes32" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "supportsPair",
    inputs: [
      { name: "pool", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
    ],
    outputs: [{ name: "supported", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  EIP-712 Types for UniversalIntent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EIP-712 type definitions for the UniversalIntent struct.
 * Field ordering must match the Solidity UNIVERSAL_INTENT_TYPEHASH exactly.
 */
export const UNIVERSAL_INTENT_TYPES = {
  UniversalIntent: [
    { name: "inAsset", type: "Asset" },
    { name: "outAsset", type: "Asset" },
    { name: "amount", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "dest", type: "Destination" },
    { name: "calldata_", type: "bytes" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Asset: [
    { name: "token", type: "address" },
    { name: "assetId", type: "uint256" },
  ],
  Destination: [
    { name: "destType", type: "uint8" },
    { name: "paraId", type: "uint32" },
    { name: "chainId", type: "uint8" },
  ],
} as const;

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

// ─────────────────────────────────────────────────────────────────────────────
//  V2 DEX — Token & Pair Registry (Polkadot Hub TestNet)
// ─────────────────────────────────────────────────────────────────────────────

/** Known token addresses on Polkadot Hub TestNet. */
export const TOKEN_ADDRESSES = {
  tDOT: "0x2402C804aD8a6217BF73D8483dA7564065c56083" as Address,
  TKA: "0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f" as Address,
  TKB: "0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc" as Address,
  tUSDC: "0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626" as Address,
  tETH: "0xd92a5325fB3A56f5012F1EBD1bd37573d981144e" as Address,
} as const;

/** Lowercase-address → symbol map for route display. */
export const TOKEN_SYMBOLS: Record<string, string> = {
  "0x2402c804ad8a6217bf73d8483da7564065c56083": "tDOT",
  "0xd8913b1a14db9cd4b29c05c5e7e105cda34ebf9f": "TKA",
  "0x3e8d34e94e22bdbaa9ad6d575a239d722973d2bc": "TKB",
  "0x5298fde9e288371eca21db04ac5ddba00c1ea626": "tUSDC",
  "0xd92a5325fb3a56f5012f1ebd1bd37573d981144e": "tETH",
};

/** All live UniswapV2 pairs deployed on Hub testnet (token0 < token1 by address). */
export const UV2_PAIRS: Array<{
  address: Address;
  token0: Address;
  token1: Address;
  label: string;
}> = [
  {
    address: "0xdd59E6121315237ACc953cd6aF1924F4320778dF" as Address,
    token0: "0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc" as Address,
    token1: "0xD8913B1a14Db9CD4B29C05c5E7E105cDA34ebF9f" as Address,
    label: "TKB/TKA",
  },
  {
    address: "0x9E628e8F4f26771F3208E2B9071d843cFeF45b1a" as Address,
    token0: "0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626" as Address,
    token1: "0xd92a5325fB3A56f5012F1EBD1bd37573d981144e" as Address,
    label: "tUSDC/tETH",
  },
  {
    address: "0xe01503Aeac95Ca39E8001aDa83121f1F8743e491" as Address,
    token0: "0x2402C804aD8a6217BF73D8483dA7564065c56083" as Address,
    token1: "0x3E8D34E94e22BdBaa9aD6D575a239D722973D2Bc" as Address,
    label: "tDOT/TKB",
  },
  {
    address: "0x84864aff1aac120809f3a2ebf0be0f2cc3a51528" as Address,
    token0: "0x2402C804aD8a6217BF73D8483dA7564065c56083" as Address,
    token1: "0x5298FDe9E288371ECA21db04Ac5Ddba00C1ea626" as Address,
    label: "tDOT/tUSDC",
  },
  {
    address: "0x412cfeb621f5a43a08adda9c8d09f29651570a01" as Address,
    token0: "0x2402C804aD8a6217BF73D8483dA7564065c56083" as Address,
    token1: "0xd92a5325fB3A56f5012F1EBD1bd37573d981144e" as Address,
    label: "tDOT/tETH",
  },
];

/** Minimal ABI for reading UniswapV2 pair reserves. */
export const UV2_PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token0",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token1",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
