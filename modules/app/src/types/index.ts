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

/** Bifrost-specific yield */
export interface BifrostYield extends ProtocolYield {
  category: "SLP" | "DEX" | "Farming" | "SALP";
  currencyIn: number;
  currencyOut?: number;
  poolId?: number;
  isActive: boolean;
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
  totalSatelliteAssets: string;
  globalTotalAssets: string;
  satelliteAssets: SatelliteChainState[];
}

/** Strategy execution record */
export interface StrategyRecord {
  id: string;
  action: string;
  targetProtocol: string;
  targetParachain: number;
  amount: string;
  reasoning: string;
  status: "pending" | "executed" | "failed";
  timestamp: string;
  txHash?: string;
}

/** Agent decision log entry */
export interface AgentDecision {
  id: string;
  action: string;
  reasoning: string;
  timestamp: string;
  cycleNumber: number;
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
