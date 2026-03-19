// ── GraphQL HTTP client for obi.index queries ─────────────────────────────
// Queries the obi.index indexer (port 4350) for on-chain historical data.
// For real-time subscriptions, see use-graphql-subscription.ts (graphql-ws).

import { GRAPHQL_HTTP_URL } from "./constants";

// ── Generic fetch wrapper ─────────────────────────────────────────────────

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function fetchGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL HTTP error ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("GraphQL response missing data");
  }
  return json.data;
}

// ── Indexed types (mirrors obi.index GraphQL schema) ─────────────────────

export interface IndexedDeposit {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  sender: string;
  owner: string;
  assets: string;
  shares: string;
}

export interface IndexedWithdrawal {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  sender: string;
  receiver: string;
  owner: string;
  assets: string;
  shares: string;
}

export interface IndexedSwapExecution {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  recipient: string;
  poolType: string;
  hops: number;
}

export interface IndexedStrategyExecution {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  executor: string;
  destination: string;
  targetChain: string;
  protocol: string;
  amount: string;
  profit: string;
  success: boolean;
}

export interface IndexedVaultStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalStrategies: number;
  totalSwaps: number;
  totalIntents: number;
  totalCrossChainMessages: number;
}

export interface IndexedVaultState {
  address: string;
  totalAssets: string;
  totalSupply: string;
  totalDeposited: string;
  totalWithdrawn: string;
  depositCap: string;
  maxDailyLoss: string;
  paused: boolean;
  swapRouter: string | null;
  pendingWithdrawals: number;
  updatedAtBlock: number;
  updatedAt: string;
}

// ── Named queries ─────────────────────────────────────────────────────────

export async function getIndexedDeposits(
  limit = 10,
  offset = 0,
  owner?: string,
): Promise<IndexedDeposit[]> {
  const data = await fetchGraphQL<{ deposits: IndexedDeposit[] }>(
    `query Deposits($limit: Int, $offset: Int, $owner: String) {
      deposits(limit: $limit, offset: $offset, owner: $owner) {
        id txHash blockNumber timestamp sender owner assets shares
      }
    }`,
    { limit, offset, owner },
  );
  return data.deposits;
}

export async function getIndexedWithdrawals(
  limit = 10,
  offset = 0,
  owner?: string,
): Promise<IndexedWithdrawal[]> {
  const data = await fetchGraphQL<{ withdrawals: IndexedWithdrawal[] }>(
    `query Withdrawals($limit: Int, $offset: Int, $owner: String) {
      withdrawals(limit: $limit, offset: $offset, owner: $owner) {
        id txHash blockNumber timestamp sender receiver owner assets shares
      }
    }`,
    { limit, offset, owner },
  );
  return data.withdrawals;
}

export async function getIndexedSwapExecutions(
  limit = 10,
  offset = 0,
): Promise<IndexedSwapExecution[]> {
  const data = await fetchGraphQL<{ swapExecutions: IndexedSwapExecution[] }>(
    `query SwapExecutions($limit: Int, $offset: Int) {
      swapExecutions(limit: $limit, offset: $offset) {
        id txHash blockNumber timestamp tokenIn tokenOut amountIn amountOut recipient poolType hops
      }
    }`,
    { limit, offset },
  );
  return data.swapExecutions;
}

/**
 * Fetch recent swap executions filtered to a specific recipient address.
 * Fetches the last 50 swaps and filters client-side (indexer may not support
 * recipient param on swapExecutions query).
 */
export async function getSwapExecutionsByRecipient(
  recipient: string,
  limit = 20,
): Promise<IndexedSwapExecution[]> {
  const all = await getIndexedSwapExecutions(50);
  return all
    .filter((s) => s.recipient.toLowerCase() === recipient.toLowerCase())
    .slice(0, limit);
}

export async function getIndexedStrategyExecutions(
  limit = 10,
  offset = 0,
): Promise<IndexedStrategyExecution[]> {
  const data = await fetchGraphQL<{
    strategyExecutions: IndexedStrategyExecution[];
  }>(
    `query StrategyExecutions($limit: Int, $offset: Int) {
      strategyExecutions(limit: $limit, offset: $offset) {
        id txHash blockNumber timestamp executor destination targetChain protocol amount profit success
      }
    }`,
    { limit, offset },
  );
  return data.strategyExecutions;
}

export async function getIndexedVaultStats(): Promise<IndexedVaultStats> {
  const data = await fetchGraphQL<{ vaultStats: IndexedVaultStats }>(
    `query VaultStats {
      vaultStats {
        totalDeposits totalWithdrawals totalStrategies totalSwaps totalIntents totalCrossChainMessages
      }
    }`,
  );
  return data.vaultStats;
}

export async function getIndexedVaultState(): Promise<IndexedVaultState | null> {
  const data = await fetchGraphQL<{ vaultState: IndexedVaultState | null }>(
    `query VaultState {
      vaultState {
        address totalAssets totalSupply totalDeposited totalWithdrawn
        depositCap maxDailyLoss paused swapRouter pendingWithdrawals
        updatedAtBlock updatedAt
      }
    }`,
  );
  return data.vaultState;
}
