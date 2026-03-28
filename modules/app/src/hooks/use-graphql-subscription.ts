"use client";

import { type Client, createClient } from "graphql-ws";
import { useCallback, useEffect, useRef, useState } from "react";

// GraphQL WebSocket URL for obi.index subscriptions
const GRAPHQL_WS_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ?? "ws://localhost:4350/graphql";

// ─────────────────────────────────────────────────────────────────────────────
//  Singleton client per URL (avoids re-creating on every render)
// ─────────────────────────────────────────────────────────────────────────────

let _client: Client | null = null;
// Track WS connection state independently of data arrival
let _wsConnected = false;
const _connListeners = new Set<(v: boolean) => void>();
function _notifyConn(v: boolean) {
  _wsConnected = v;
  for (const fn of _connListeners) fn(v);
}

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: GRAPHQL_WS_URL,
      retryAttempts: 10,
      shouldRetry: () => true,
      on: {
        connected: () => _notifyConn(true),
        closed: () => _notifyConn(false),
        error: () => _notifyConn(false),
      },
    });
  }
  return _client;
}

// ─────────────────────────────────────────────────────────────────────────────
//  useGraphQLSubscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to a GraphQL subscription from obi.index.
 *
 * @param query     A GraphQL subscription document string.
 * @param onData    Callback invoked with each new event payload.
 * @param variables Optional variables for the subscription.
 *
 * @returns `connected` — true when the WS connection is live.
 */
export function useGraphQLSubscription<T = unknown>(
  query: string,
  onData: (data: T) => void,
  variables?: Record<string, unknown>,
  options?: { enabled?: boolean },
): { connected: boolean } {
  // Initialise from the current singleton state so the indicator is correct
  // even before the first data frame arrives.
  const [connected, setConnected] = useState(() => _wsConnected);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  // Mirror WS-level connection state into React state.
  useEffect(() => {
    // Ensure the client (and its lifecycle listeners) is created.
    getClient();
    // Sync current state in case it changed between render and effect.
    setConnected(_wsConnected);
    _connListeners.add(setConnected);
    return () => {
      _connListeners.delete(setConnected);
    };
  }, []);

  const subscribe = useCallback(() => {
    if (options?.enabled === false) {
      return () => {};
    }

    const client = getClient();

    const unsubscribe = client.subscribe<{ [key: string]: T }>(
      { query, variables },
      {
        next(value) {
          if (value.data) {
            // The subscription root field name is the first key
            const payload = Object.values(value.data)[0];
            if (payload !== undefined) {
              onDataRef.current(payload as T);
            }
          }
        },
        error() {
          // WS lifecycle handler already calls _notifyConn(false); this is a
          // subscription-level error (e.g. bad query) — keep WS state alone.
        },
        complete() {},
      },
    );

    return unsubscribe;
  }, [options?.enabled, query, variables]);

  useEffect(() => {
    const unsubscribe = subscribe();
    return () => unsubscribe();
  }, [subscribe]);

  return { connected };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pre-built subscription hooks for common event types
// ─────────────────────────────────────────────────────────────────────────────

/** Latest deposit event from obi.index (real-time). */
export type DepositEvent = {
  id: string;
  txHash: string;
  owner: string;
  assets: string;
  shares: string;
  blockNumber: number;
  timestamp: string;
};

export function useDepositSubscription(onDeposit: (d: DepositEvent) => void) {
  return useGraphQLSubscription<DepositEvent>(
    `subscription { depositAdded { id txHash owner assets shares blockNumber timestamp } }`,
    onDeposit,
  );
}

/** Latest swap execution event from obi.index (real-time). */
export type SwapEvent = {
  id: string;
  txHash: string;
  /** Recipient of the swap output (from SwapRouter calldata). */
  recipient: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  /** Pool type as a string (GraphQL String! in obi.index schema). */
  poolType: string;
  blockNumber: number;
  timestamp: string;
};

export function useSwapSubscription(onSwap: (s: SwapEvent) => void) {
  return useGraphQLSubscription<SwapEvent>(
    `subscription { swapExecuted { id txHash recipient tokenIn tokenOut amountIn amountOut poolType blockNumber timestamp } }`,
    onSwap,
  );
}

/** Latest oracle price update from obi.index (real-time). */
export type OracleUpdateEvent = {
  id: string;
  feed: string;
  /** Price as a string (obi.index field: price). */
  price: string;
  timestamp: string;
  blockNumber: number;
};

export function useOracleSubscription(
  onUpdate: (o: OracleUpdateEvent) => void,
) {
  return useGraphQLSubscription<OracleUpdateEvent>(
    `subscription { oracleUpdated { id feed price timestamp blockNumber } }`,
    onUpdate,
  );
}

export type CrossChainDispatchEvent = {
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
};

export type CrossChainPipelineEvent = {
  intentId: string;
  txHash: string;
  commitment: string | null;
  sender: string;
  sourceChain: string;
  destChain: string;
  latestStatus: string;
  latestMessageType: string;
  lastUpdatedAt: string;
  steps: CrossChainDispatchEvent[];
};

export function useCrossChainStatusSubscription(
  txHash: string | null | undefined,
  onUpdate: (pipeline: CrossChainPipelineEvent) => void,
) {
  const enabledTxHash = txHash?.trim();
  return useGraphQLSubscription<CrossChainPipelineEvent>(
    `subscription CrossChainStatus($txHash: String!) {
      crossChainStatus(txHash: $txHash) {
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
    onUpdate,
    enabledTxHash ? { txHash: enabledTxHash } : undefined,
    { enabled: !!enabledTxHash },
  );
}
