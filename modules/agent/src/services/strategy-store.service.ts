import { logger } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Strategy Store — In-memory history of executed strategies
// ─────────────────────────────────────────────────────────────────────────────

const storeLog = logger.child({ module: "strategy-store" });

export interface StrategyRecord {
  id: string;
  action: string;
  amount: string;
  target: string;
  reasoning: string;
  status: "pending" | "executed" | "failed" | "timeout";
  txHash?: string;
  timestamp: number;
  outcomeTimestamp?: number;
}

export interface AgentDecisionRecord {
  cycle: number;
  action: string;
  reasoning: string;
  timestamp: number;
  snapshot?: {
    totalAssets: string;
    idleBalance: string;
    topYieldApy: string;
    topYieldProtocol: string;
  };
}

/** Maximum records to keep in memory. */
const MAX_STRATEGIES = 500;
const MAX_DECISIONS = 1000;

/**
 * In-memory store for strategy execution history and agent decisions.
 * Used by the API to serve `/api/strategies` and `/api/agent/log`.
 */
class StrategyStore {
  private static instance: StrategyStore;
  private readonly strategies: StrategyRecord[] = [];
  private readonly decisions: AgentDecisionRecord[] = [];

  private constructor() {}

  static getInstance(): StrategyStore {
    if (!StrategyStore.instance) {
      StrategyStore.instance = new StrategyStore();
    }
    return StrategyStore.instance;
  }

  // ── Strategies ─────────────────────────────────────────────────────

  addStrategy(record: StrategyRecord): void {
    this.strategies.unshift(record);
    if (this.strategies.length > MAX_STRATEGIES) {
      this.strategies.pop();
    }
    storeLog.debug({ id: record.id, action: record.action }, "Strategy recorded");
  }

  updateStrategyStatus(
    id: string,
    status: StrategyRecord["status"],
    txHash?: string,
  ): void {
    const record = this.strategies.find((s) => s.id === id);
    if (record) {
      record.status = status;
      record.outcomeTimestamp = Date.now();
      if (txHash) record.txHash = txHash;
      storeLog.debug({ id, status }, "Strategy status updated");
    }
  }

  getStrategies(limit = 50, offset = 0): StrategyRecord[] {
    return this.strategies.slice(offset, offset + limit);
  }

  getStrategyCount(): number {
    return this.strategies.length;
  }

  // ── Agent Decisions ────────────────────────────────────────────────

  addDecision(record: AgentDecisionRecord): void {
    this.decisions.unshift(record);
    if (this.decisions.length > MAX_DECISIONS) {
      this.decisions.pop();
    }
    storeLog.debug(
      { cycle: record.cycle, action: record.action },
      "Decision recorded",
    );
  }

  getDecisions(limit = 50, offset = 0): AgentDecisionRecord[] {
    return this.decisions.slice(offset, offset + limit);
  }

  getDecisionCount(): number {
    return this.decisions.length;
  }
}

export const strategyStore = StrategyStore.getInstance();
