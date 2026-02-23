import { z } from "zod";
import type { Address, Hex } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
//  StrategyIntent — TypeScript mirror of the Solidity struct
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TypeScript interface for the on-chain StrategyIntent struct.
 *
 * This is the exact shape signed via EIP-712 and submitted to
 * `ObidotVault.executeStrategy()`. Every field maps 1:1 to its
 * Solidity counterpart in ObidotVault.StrategyIntent.
 */
export interface StrategyIntent {
  /** The vault's underlying ERC-20 asset address. */
  asset: Address;
  /** Amount of underlying asset to deploy (uint256). */
  amount: bigint;
  /** Minimum expected return from the remote strategy (uint256). */
  minReturn: bigint;
  /** Maximum acceptable slippage in basis points (uint256). */
  maxSlippageBps: bigint;
  /** Unix timestamp after which this intent expires (uint256). */
  deadline: bigint;
  /** Per-strategist sequential nonce for replay protection (uint256). */
  nonce: bigint;
  /** SCALE-encoded VersionedXcm message payload. */
  xcmCall: Hex;
  /** Destination parachain ID (uint32). */
  targetParachain: number;
  /** Target protocol address for on-chain exposure tracking. */
  targetProtocol: Address;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Bifrost Strategy Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bifrost DeFi strategy types — mirrors the Solidity
 * `BifrostAdapter.BifrostStrategyType` enum.
 */
export enum BifrostStrategyType {
  MintVToken = 0,
  RedeemVToken = 1,
  DEXSwap = 2,
  FarmDeposit = 3,
  FarmWithdraw = 4,
  FarmClaim = 5,
  SALPContribute = 6,
}

/**
 * Human-readable labels for Bifrost strategy types.
 */
export const BIFROST_STRATEGY_LABELS: Record<BifrostStrategyType, string> = {
  [BifrostStrategyType.MintVToken]: "Mint vToken (SLP)",
  [BifrostStrategyType.RedeemVToken]: "Redeem vToken (SLP)",
  [BifrostStrategyType.DEXSwap]: "DEX Swap (Zenlink)",
  [BifrostStrategyType.FarmDeposit]: "Farm Deposit",
  [BifrostStrategyType.FarmWithdraw]: "Farm Withdraw",
  [BifrostStrategyType.FarmClaim]: "Farm Claim Rewards",
  [BifrostStrategyType.SALPContribute]: "SALP Crowdloan Contribute",
};

/**
 * Bifrost currency IDs — mirrors BifrostCodec.sol constants.
 */
export enum BifrostCurrencyId {
  DOT = 0,
  vDOT = 1,
  KSM = 2,
  vKSM = 3,
  BNC = 4,
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI Decision Schema — Zod-validated LLM output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for a "REALLOCATE" decision from the AI.
 * The LLM must output a JSON object matching this shape exactly.
 */
const reallocateDecisionSchema = z.object({
  action: z.literal("REALLOCATE"),
  targetParachain: z.number().int().positive(),
  targetProtocol: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string (wei)")
    .refine((v: string) => BigInt(v) > 0n, "Amount must be positive"),
  maxSlippageBps: z.number().int().min(1).max(100),
  reasoning: z.string().min(1).max(500),
});

/**
 * Schema for a "BIFROST_STRATEGY" decision from the AI.
 * Covers all Bifrost DeFi operations: SLP, DEX, Farming, SALP.
 */
const bifrostStrategyDecisionSchema = z.object({
  action: z.literal("BIFROST_STRATEGY"),
  strategyType: z.nativeEnum(BifrostStrategyType),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string (wei)")
    .refine((v: string) => BigInt(v) > 0n, "Amount must be positive"),
  maxSlippageBps: z.number().int().min(1).max(100),
  /** Currency ID for input token (DOT=0, vDOT=1, etc.) */
  currencyIn: z.nativeEnum(BifrostCurrencyId),
  /** Currency ID for output token (used for DEX swaps) */
  currencyOut: z.nativeEnum(BifrostCurrencyId).optional(),
  /** Pool ID for farming operations */
  poolId: z.number().int().nonnegative().optional(),
  /** Minimum expected output amount */
  minOutput: z
    .string()
    .regex(/^\d+$/, "minOutput must be a numeric string (wei)")
    .optional(),
  reasoning: z.string().min(1).max(500),
});

/**
 * Schema for a "CROSS_CHAIN_REBALANCE" decision from the AI.
 * Used for moving assets between the hub vault and satellite EVM vaults.
 */
const crossChainRebalanceDecisionSchema = z.object({
  action: z.literal("CROSS_CHAIN_REBALANCE"),
  /** Target chain identifier (e.g. "ethereum", "arbitrum") */
  targetChain: z.string().min(1),
  /** Direction of the rebalance */
  direction: z.enum(["HUB_TO_SATELLITE", "SATELLITE_TO_HUB"]),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string (wei)")
    .refine((v: string) => BigInt(v) > 0n, "Amount must be positive"),
  reasoning: z.string().min(1).max(500),
});

/**
 * Schema for a "NO_ACTION" decision from the AI.
 */
const noActionDecisionSchema = z.object({
  action: z.literal("NO_ACTION"),
  reasoning: z.string().min(1).max(500),
});

/**
 * Discriminated union schema for any valid AI decision.
 * Used to parse and validate raw LLM output before acting on it.
 */
export const aiDecisionSchema = z.discriminatedUnion("action", [
  reallocateDecisionSchema,
  bifrostStrategyDecisionSchema,
  crossChainRebalanceDecisionSchema,
  noActionDecisionSchema,
]);

/** Inferred type of a validated AI decision. */
export type AiDecision = z.infer<typeof aiDecisionSchema>;

/** Type-narrowing helper: is this a reallocation decision? */
export type ReallocateDecision = z.infer<typeof reallocateDecisionSchema>;

/** Type-narrowing helper: is this a Bifrost strategy decision? */
export type BifrostStrategyDecision = z.infer<
  typeof bifrostStrategyDecisionSchema
>;

/** Type-narrowing helper: is this a cross-chain rebalance decision? */
export type CrossChainRebalanceDecision = z.infer<
  typeof crossChainRebalanceDecisionSchema
>;

/** Type-narrowing helper: is this a no-action decision? */
export type NoActionDecision = z.infer<typeof noActionDecisionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
//  Vault State Snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Point-in-time snapshot of vault on-chain state.
 * Fetched at the start of each autonomous loop cycle.
 */
export interface VaultState {
  /** Total assets under management (idle + remote). */
  totalAssets: bigint;
  /** Assets currently deployed to remote parachains. */
  totalRemoteAssets: bigint;
  /** Assets sitting idle in the vault contract. */
  idleBalance: bigint;
  /** Whether the vault is paused. */
  paused: boolean;
  /** Whether emergency withdrawal mode is active. */
  emergencyMode: boolean;
  /** Current daily loss accumulator. */
  dailyLoss: bigint;
  /** Maximum allowed daily loss. */
  maxDailyLoss: bigint;
  /** Current strategist nonce. */
  nonce: bigint;
  /** Number of strategies executed so far. */
  strategyCounter: bigint;
}

/**
 * Cross-chain vault state including satellite chain information.
 */
export interface CrossChainVaultState extends VaultState {
  /** Total assets in satellite vaults across all EVM chains. */
  totalSatelliteAssets: bigint;
  /** Global total assets (hub + all satellites). */
  globalTotalAssets: bigint;
  /** Per-chain satellite asset breakdown. */
  satelliteAssets: SatelliteChainState[];
}

/**
 * State of a single satellite vault on an EVM chain.
 */
export interface SatelliteChainState {
  /** Chain identifier (e.g. "ethereum", "arbitrum"). */
  chainId: string;
  /** Human-readable chain name. */
  chainName: string;
  /** Total assets held in this satellite vault. */
  totalAssets: bigint;
  /** Whether the satellite vault is in emergency mode. */
  emergencyMode: boolean;
  /** Last sync timestamp (unix seconds). */
  lastSyncTimestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Yield Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * APY data point for a single DeFi protocol.
 */
export interface ProtocolYield {
  /** Human-readable protocol name. */
  name: string;
  /** Parachain ID hosting this protocol. */
  paraId: number;
  /** Protocol contract/address for exposure tracking. */
  protocol: Address;
  /** Current annual percentage yield (e.g. 8.5 = 8.5%). */
  apyPercent: number;
  /** Total value locked in USD (informational). */
  tvlUsd: number;
  /** Timestamp when this data was fetched. */
  fetchedAt: Date;
}

/**
 * Extended yield data for Bifrost-specific products.
 */
export interface BifrostYield extends ProtocolYield {
  /** The Bifrost product category. */
  category: "SLP" | "DEX" | "Farming" | "SALP";
  /** Input currency for this yield source. */
  currencyIn: BifrostCurrencyId;
  /** Output currency (for SLP minting / DEX swaps). */
  currencyOut?: BifrostCurrencyId;
  /** Farming pool ID if applicable. */
  poolId?: number;
  /** Whether the product is actively accepting deposits. */
  isActive: boolean;
}

/**
 * Aggregated market data passed to the LLM for decision-making.
 */
export interface MarketSnapshot {
  /** APY data for all tracked protocols. */
  yields: ProtocolYield[];
  /** Bifrost-specific yield sources. */
  bifrostYields?: BifrostYield[];
  /** Current on-chain vault state. */
  vaultState: VaultState;
  /** Cross-chain vault state (if available). */
  crossChainState?: CrossChainVaultState;
  /** ISO timestamp of this snapshot. */
  timestamp: string;
}
