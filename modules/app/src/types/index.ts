export type SwapStep =
  | "idle"
  | "approving"
  | "approve-confirming"
  | "swapping"
  | "swap-confirming"
  | "done";

export type TradeActionType = "swap" | "limit" | "crosschain";

/** Vault state with bigints serialized as strings */
export interface VaultState {
  totalAssets: string;
  totalRemoteAssets: string;
  idleBalance: string;
  paused: boolean;
  emergencyMode: boolean;
  dailyLoss: string;
  maxDailyLoss: string;
  nonce: string;
  strategyCounter: string;
}

/** Vault performance metrics */
export interface VaultPerformance {
  cumulativePnL: string;
  highWaterMark: string;
  feeAccrued: string;
}

/** Protocol yield data */
export interface ProtocolYield {
  name: string;
  paraId: number;
  protocol: string;
  protocolLabel: string;
  apyPercent: number;
  tvlUsd: number;
  fetchedAt: string;
}

/** Bifrost-specific yield (subset serialized by agent) */
export interface BifrostYield {
  name: string;
  protocol: string;
  protocolLabel: string;
  category: "SLP" | "DEX" | "Farming" | "SALP";
  apyPercent: number;
  tvlUsd: number;
  isActive: boolean;
  fetchedAt: string;
}

/** UniswapV2 pair yield data from Polkadot Hub TestNet */
export interface UniswapV2Yield {
  name: string;
  protocolLabel: string;
  protocol: string;
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  apyPercent: number;
  tvlUsd: number;
  category: "UniswapV2";
  /** ISO string (agent serializes Date to string) */
  fetchedAt: string;
}

/** Satellite chain state */
export interface SatelliteChainState {
  chainId: string;
  chainName: string;
  totalAssets: string;
  emergencyMode: boolean;
  lastSyncTimestamp: number;
}

/** Cross-chain vault state */
export interface CrossChainVaultState {
  hasSatellites: boolean;
  totalSatelliteAssets?: string;
  globalTotalAssets?: string;
  /** Keyed as `satellites` in the API response */
  satellites: SatelliteChainState[];
  hub?: { chain: string };
}

/** Strategy execution record (matches agent strategy-store shape) */
export interface StrategyRecord {
  id: string;
  action: string;
  /** Protocol address or name */
  target: string;
  amount: string;
  reasoning: string;
  status: "pending" | "executed" | "failed" | "timeout";
  /** Unix ms timestamp */
  timestamp: number;
  outcomeTimestamp?: number;
  txHash?: string;
}

/** Agent decision log entry (matches agent strategy-store AgentDecisionRecord) */
export interface AgentDecision {
  cycle: number;
  action: string;
  reasoning: string;
  /** Unix ms timestamp */
  timestamp: number;
  snapshot?: {
    totalAssets: string;
    idleBalance: string;
    topYieldApy: string;
    topYieldProtocol: string;
  };
}

/** Chat message */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** Limit order stored in localStorage under key "obidot_limit_orders" */
export interface PendingOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  /** ERC-20 address of tokenIn — used for fill detection */
  tokenInAddress: string;
  /** ERC-20 address of tokenOut — used for fill detection */
  tokenOutAddress: string;
  /** Human-readable amount (e.g. "10.5") */
  amountIn: string;
  targetPrice: string;
  expiry: number;
  marketPriceAtOrder: string;
  createdAt: number;
  /** Set to "filled" by fill-detection logic when a matching SwapExecuted event arrives */
  status?: "pending" | "filled";
}

// ── DEX Aggregator Types ──────────────────────────────────────────────────

/** Pool type enum (matches on-chain PoolType) */
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

/** Human-readable pool type labels */
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
 * Resolve a pool type value to its numeric PoolType.
 * Accepts either a numeric string ("3"), a number (3), or a label ("UniswapV2").
 * Returns undefined if unrecognized.
 */
export function resolvePoolType(value: string | number): PoolType | undefined {
  if (typeof value === "number") return value as PoolType;
  const n = Number(value);
  if (!isNaN(n)) return n as PoolType;
  // Reverse label lookup
  const entry = Object.entries(POOL_TYPE_LABELS).find(([, label]) => label === value);
  if (entry) return Number(entry[0]) as PoolType;
  return undefined;
}

/** Swap quote result from agent API */
export interface SwapQuoteResult {
  source: PoolType;
  pool: string;
  feeBps: number;
  amountIn: string;
  amountOut: string;
}

/** Available pool adapter info from agent API */
export interface PoolAdapterInfo {
  poolType: PoolType;
  label: string;
  adapter: string;
  deployed: boolean;
}

/** Swap routes response from agent API */
export interface SwapRoutesResponse {
  adapters: PoolAdapterInfo[];
  routerDeployed: boolean;
  routerPaused: boolean;
}

/** Token descriptor for the swap UI */
export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

// ── Route Finder Types ────────────────────────────────────────────────────

/** A single hop within a multi-hop swap route (from /api/routes). */
export interface RouteHop {
  pool: string;
  poolLabel: string;
  poolType: string;
  tokenIn: string;
  tokenInSymbol: string;
  tokenOut: string;
  tokenOutSymbol: string;
  amountIn: string;
  amountOut: string;
  feeBps: string;
  priceImpactBps: string;
}

/** A complete swap route result from /api/routes. */
export interface SwapRouteResult {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  hops: RouteHop[];
  totalFeeBps: string;
  totalPriceImpactBps: string;
  routeType: "local" | "xcm" | "bridge";
  status: "live" | "mainnet_only" | "coming_soon";
}

// ── Split Route Types ─────────────────────────────────────────────────────

/** A selected route with a weight (basis points, 0–10000) for split execution */
export interface SplitRouteSelection {
  route: SwapRouteResult;
  /** Basis points weight — selections must sum to 10_000 */
  weight: number;
}

// ── WebSocket Event Types ─────────────────────────────────────────────────

/** WebSocket event types */
export type WsEvent =
  | { type: "vault:stateUpdate"; data: VaultState }
  | { type: "strategy:executed"; data: StrategyRecord }
  | { type: "agent:decision"; data: AgentDecision }
  | {
    type: "swap:executed";
    data: {
      txHash: string;
      amountIn: string;
      amountOut: string;
      source: PoolType;
    };
  }
  | { type: "heartbeat"; data: { timestamp: string } };

/** Navigation item */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}
