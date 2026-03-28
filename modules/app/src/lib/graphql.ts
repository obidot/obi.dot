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

export interface IndexedPriceHistoryBar {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volumeIn: string;
  volumeOut: string;
  trades: number;
}

export interface IndexedProtocolStats {
  volume24h: string;
  feeRevenue24h: string;
  uniqueTraders7d: number;
  tvl: string;
  totalSwaps: number;
  activeAdapters: number;
  pricedSwapCoverage24h: number;
  estimationNote: string;
}

export interface IndexedRouteStats {
  routeKey: string;
  label: string;
  tokenIn: string;
  tokenInSymbol: string;
  tokenOut: string;
  tokenOutSymbol: string;
  poolType: string;
  hops: number;
  swapCount: number;
  amountInTotal: string;
  amountOutTotal: string;
  estimatedVolumeUsd: string;
  priced: boolean;
  lastSwapAt: string;
}

export interface IndexedPoolAnalytics {
  pair: string;
  window: string;
  volumeIn: string;
  volumeOut: string;
  estimatedVolumeUsd: string;
  estimatedFeesUsd: string;
  tradeCount: number;
  pricedTrades: number;
  priceHigh: string;
  priceLow: string;
  lastPrice: string | null;
}

export interface IndexedCrossChainDispatch {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: string;
  messageType: string;
  sourceChain: string;
  destChain: string;
  sender: string;
  data: string;
  commitment: string | null;
  status: string;
}

export interface IndexedCrossChainPipeline {
  intentId: string;
  txHash: string;
  commitment: string | null;
  sender: string;
  sourceChain: string;
  destChain: string;
  latestStatus: string;
  latestMessageType: string;
  lastUpdatedAt: string;
  steps: IndexedCrossChainDispatch[];
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

export async function getPriceHistory(
  tokenIn: string,
  tokenOut: string,
  from: number,
  to: number,
): Promise<IndexedPriceHistoryBar[]> {
  const data = await fetchGraphQL<{ priceHistory: IndexedPriceHistoryBar[] }>(
    `query PriceHistory($tokenIn: String!, $tokenOut: String!, $from: Int!, $to: Int!) {
      priceHistory(tokenIn: $tokenIn, tokenOut: $tokenOut, from: $from, to: $to) {
        timestamp open high low close volumeIn volumeOut trades
      }
    }`,
    { tokenIn, tokenOut, from, to },
  );

  return data.priceHistory;
}

export async function getProtocolStats(): Promise<IndexedProtocolStats> {
  const data = await fetchGraphQL<{ protocolStats: IndexedProtocolStats }>(
    `query ProtocolStats {
      protocolStats {
        volume24h
        feeRevenue24h
        uniqueTraders7d
        tvl
        totalSwaps
        activeAdapters
        pricedSwapCoverage24h
        estimationNote
      }
    }`,
  );

  return data.protocolStats;
}

export async function getTopRoutes(limit = 6): Promise<IndexedRouteStats[]> {
  const data = await fetchGraphQL<{ topRoutes: IndexedRouteStats[] }>(
    `query TopRoutes($limit: Int) {
      topRoutes(limit: $limit) {
        routeKey
        label
        tokenIn
        tokenInSymbol
        tokenOut
        tokenOutSymbol
        poolType
        hops
        swapCount
        amountInTotal
        amountOutTotal
        estimatedVolumeUsd
        priced
        lastSwapAt
      }
    }`,
    { limit },
  );

  return data.topRoutes;
}

export async function getPoolAnalytics(
  pair: string,
  window: string,
): Promise<IndexedPoolAnalytics> {
  const data = await fetchGraphQL<{ poolAnalytics: IndexedPoolAnalytics }>(
    `query PoolAnalytics($pair: String!, $window: String!) {
      poolAnalytics(pair: $pair, window: $window) {
        pair
        window
        volumeIn
        volumeOut
        estimatedVolumeUsd
        estimatedFeesUsd
        tradeCount
        pricedTrades
        priceHigh
        priceLow
        lastPrice
      }
    }`,
    { pair, window },
  );

  return data.poolAnalytics;
}

export async function getCrossChainPipeline(
  intentId: string,
): Promise<IndexedCrossChainPipeline | null> {
  const data = await fetchGraphQL<{
    crossChainPipeline: IndexedCrossChainPipeline | null;
  }>(
    `query CrossChainPipeline($intentId: String!) {
      crossChainPipeline(intentId: $intentId) {
        intentId
        txHash
        commitment
        sender
        sourceChain
        destChain
        latestStatus
        latestMessageType
        lastUpdatedAt
        steps {
          id
          txHash
          logIndex
          blockNumber
          timestamp
          messageType
          sourceChain
          destChain
          sender
          data
          commitment
          status
        }
      }
    }`,
    { intentId },
  );

  return data.crossChainPipeline;
}

export async function getCrossChainPipelines(
  limit = 6,
  sender?: string,
  status?: string,
): Promise<IndexedCrossChainPipeline[]> {
  const data = await fetchGraphQL<{
    crossChainPipelines: IndexedCrossChainPipeline[];
  }>(
    `query CrossChainPipelines($limit: Int, $sender: String, $status: String) {
      crossChainPipelines(limit: $limit, sender: $sender, status: $status) {
        intentId
        txHash
        commitment
        sender
        sourceChain
        destChain
        latestStatus
        latestMessageType
        lastUpdatedAt
        steps {
          id
          txHash
          logIndex
          blockNumber
          timestamp
          messageType
          sourceChain
          destChain
          sender
          data
          commitment
          status
        }
      }
    }`,
    { limit, sender, status },
  );

  return data.crossChainPipelines;
}
