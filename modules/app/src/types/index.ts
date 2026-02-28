// ── Frontend Types (serialized for JSON transport) ────────────────────────

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
  apyPercent: number;
  tvlUsd: number;
  fetchedAt: string;
}

/** Bifrost-specific yield (subset serialized by agent) */
export interface BifrostYield {
  name: string;
  protocol: string;
  category: "SLP" | "DEX" | "Farming" | "SALP";
  apyPercent: number;
  tvlUsd: number;
  isActive: boolean;
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

/** WebSocket event types */
export type WsEvent =
  | { type: "vault:stateUpdate"; data: VaultState }
  | { type: "strategy:executed"; data: StrategyRecord }
  | { type: "agent:decision"; data: AgentDecision }
  | { type: "heartbeat"; data: { timestamp: string } };

/** Navigation item */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}
