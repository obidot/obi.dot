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
//  DEX Aggregator Types — Mirrors ISwapRouter.sol structs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pool type enum — mirrors ISwapRouter.PoolType in Solidity.
 */
export enum PoolType {
  HydrationOmnipool = 0,
  AssetHubPair = 1,
  BifrostDEX = 2,
  Custom = 3,
  MockBridge = 4,
  RelayTeleport = 5,
  Karura = 6,
  Moonbeam = 7,
  Interlay = 8,
}

/**
 * Human-readable labels for pool types.
 */
export const POOL_TYPE_LABELS: Record<PoolType, string> = {
  [PoolType.HydrationOmnipool]: "Hydration Omnipool",
  [PoolType.AssetHubPair]: "AssetHub Pair",
  [PoolType.BifrostDEX]: "Bifrost DEX",
  [PoolType.Custom]: "UniswapV2",
  [PoolType.MockBridge]: "Mock Bridge",
  [PoolType.RelayTeleport]: "Relay Teleport",
  [PoolType.Karura]: "Karura DEX",
  [PoolType.Moonbeam]: "Moonbeam EVM",
  [PoolType.Interlay]: "Interlay Loans",
};

/**
 * A single swap route through a specific pool.
 * Mirrors ISwapRouter.Route in Solidity.
 */
export interface Route {
  poolType: PoolType;
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  feeBps: bigint;
  data: Hex;
}

/**
 * Parameters for a single swap execution.
 * Mirrors ISwapRouter.SwapParams in Solidity.
 */
export interface SwapParams {
  route: Route;
  amountIn: bigint;
  minAmountOut: bigint;
  to: Address;
  deadline: bigint;
}

/**
 * A split leg: fraction of input routed through a specific pool.
 * Mirrors ISwapRouter.SplitLeg in Solidity.
 */
export interface SplitLeg {
  route: Route;
  weight: bigint;
}

/**
 * Quote result from the SwapQuoter.
 * Mirrors ISwapRouter.Quote in Solidity.
 */
export interface SwapQuote {
  source: PoolType;
  pool: Address;
  feeBps: bigint;
  amountIn: bigint;
  amountOut: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Universal Intent Types — Mirrors IntentTypes.sol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Destination type enum — mirrors IntentTypes.DestType.
 */
export enum DestType {
  Native = 0,
  Hyper = 1,
}

/**
 * On-chain asset descriptor.
 * Mirrors IntentTypes.Asset in Solidity.
 */
export interface IntentAsset {
  token: Address;
  assetId: bigint;
}

/**
 * Routing destination for a UniversalIntent.
 * Mirrors IntentTypes.Destination in Solidity.
 */
export interface Destination {
  destType: DestType;
  paraId: number;
  chainId: number;
}

/**
 * Universal intent struct signed by the off-chain AI strategist.
 * Mirrors IntentTypes.UniversalIntent in Solidity.
 */
export interface UniversalIntent {
  inAsset: IntentAsset;
  outAsset: IntentAsset;
  amount: bigint;
  minOut: bigint;
  dest: Destination;
  calldata_: Hex;
  nonce: bigint;
  deadline: bigint;
}

/**
 * Serialized swap quote result for API responses.
 */
export interface SwapQuoteResult {
  source: string;
  pool: string;
  feeBps: string;
  amountIn: string;
  amountOut: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Route Finder Types — Route graph path-finder results
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single hop within a multi-hop swap route.
 */
export interface RouteHop {
  /** Pool pair contract address. */
  pool: string;
  /** Human-readable pool label, e.g. "tDOT/tUSDC". */
  poolLabel: string;
  /** Pool type string, e.g. "UniswapV2". */
  poolType: string;
  /** Input token address (checksummed). */
  tokenIn: string;
  /** Human-readable input token symbol. */
  tokenInSymbol: string;
  /** Output token address (checksummed). */
  tokenOut: string;
  /** Human-readable output token symbol. */
  tokenOutSymbol: string;
  /** Amount of tokenIn consumed by this hop (wei string). */
  amountIn: string;
  /** Amount of tokenOut produced by this hop (wei string). */
  amountOut: string;
  /** Pool fee in basis points, e.g. "30" for 0.3%. */
  feeBps: string;
  /** Approximate price impact in basis points. */
  priceImpactBps: string;
}

/**
 * A complete swap route from tokenIn to tokenOut, possibly multi-hop.
 * Returned by the /api/routes endpoint.
 */
export interface SwapRouteResult {
  /** Unique route identifier, e.g. "tDOT→TKB→tUSDC". */
  id: string;
  /** Input token address. */
  tokenIn: string;
  /** Output token address. */
  tokenOut: string;
  /** Total input amount (wei string). */
  amountIn: string;
  /** Estimated total output amount (wei string). */
  amountOut: string;
  /** Minimum output after 50 bps slippage (wei string). */
  minAmountOut: string;
  /** Ordered list of swap hops. */
  hops: RouteHop[];
  /** Aggregate fee in basis points across all hops. */
  totalFeeBps: string;
  /** Aggregate price impact in basis points across all hops. */
  totalPriceImpactBps: string;
  /** Route category. */
  routeType: "local" | "xcm" | "bridge";
  /** Execution availability. */
  status: "live" | "mainnet_only" | "coming_soon";
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
 * Schema for a "LOCAL_SWAP" decision from the AI.
 * Used for on-hub swaps routed through the SwapRouter via the vault.
 */
const localSwapDecisionSchema = z.object({
  action: z.literal("LOCAL_SWAP"),
  /** Pool type: 0=HydrationOmnipool, 1=AssetHubPair, 2=BifrostDEX, 3=Custom */
  poolType: z.nativeEnum(PoolType),
  /** Pool or adapter address to route through */
  pool: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  /** Input token address */
  tokenIn: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  /** Output token address */
  tokenOut: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string (wei)")
    .refine((v: string) => BigInt(v) > 0n, "Amount must be positive"),
  maxSlippageBps: z.number().int().min(1).max(200),
  reasoning: z.string().min(1).max(500),
});

/**
 * Schema for a "UNIVERSAL_INTENT" decision from the AI.
 * Used for cross-chain intent execution (XCM or Hyperbridge).
 */
const universalIntentDecisionSchema = z.object({
  action: z.literal("UNIVERSAL_INTENT"),
  /** Input token address */
  tokenIn: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  /** Input asset ID (remote, e.g. Hydration assetId) */
  inAssetId: z.string().regex(/^\d+$/).default("0"),
  /** Output token address */
  tokenOut: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM address"),
  /** Output asset ID */
  outAssetId: z.string().regex(/^\d+$/).default("0"),
  amount: z
    .string()
    .regex(/^\d+$/, "Amount must be a numeric string (wei)")
    .refine((v: string) => BigInt(v) > 0n, "Amount must be positive"),
  maxSlippageBps: z.number().int().min(1).max(200),
  /** Destination type: 0=Native (XCM), 1=Hyper (Hyperbridge) */
  destType: z.nativeEnum(DestType),
  /** Target parachain ID (for Native) */
  targetParachain: z.number().int().nonnegative().optional(),
  /** Target Hyperbridge chain ID (for Hyper) */
  targetChainId: z.number().int().nonnegative().optional(),
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
  localSwapDecisionSchema,
  universalIntentDecisionSchema,
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

/** Type-narrowing helper: is this a local swap decision? */
export type LocalSwapDecision = z.infer<typeof localSwapDecisionSchema>;

/** Type-narrowing helper: is this a universal intent decision? */
export type UniversalIntentDecision = z.infer<
  typeof universalIntentDecisionSchema
>;

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
/** Live swap quote from the DEX aggregator for a specific token pair. */
export interface SwapQuoteSnapshot {
  amountIn: string;
  amountOut: string;
  feeBps: string;
  source: number; // ISwapRouter.PoolType
}

export interface MarketSnapshot {
  /** APY data for all tracked protocols. */
  yields: ProtocolYield[];
  /** Bifrost-specific yield sources. */
  bifrostYields?: BifrostYield[];
  /** Current on-chain vault state. */
  vaultState: VaultState;
  /** Cross-chain vault state (if available). */
  crossChainState?: CrossChainVaultState;
  /**
   * Live SwapQuoter snapshots for key pairs.
   * Populated when SwapQuoter is deployed and router is not paused.
   */
  swapQuotes?: {
    dotToUsdc?: SwapQuoteSnapshot;
    [pair: string]: SwapQuoteSnapshot | undefined;
  };
  /** ISO timestamp of this snapshot. */
  timestamp: string;
}
