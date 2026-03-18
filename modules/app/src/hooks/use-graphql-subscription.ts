"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient, type Client } from "graphql-ws";

// GraphQL WebSocket URL for obi.index subscriptions
const GRAPHQL_WS_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ?? "ws://localhost:4350/graphql";

// ─────────────────────────────────────────────────────────────────────────────
//  Singleton client per URL (avoids re-creating on every render)
// ─────────────────────────────────────────────────────────────────────────────

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: GRAPHQL_WS_URL,
      retryAttempts: 10,
      shouldRetry: () => true,
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
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  const subscribe = useCallback(() => {
    const client = getClient();

    const unsubscribe = client.subscribe<{ [key: string]: T }>(
      { query, variables },
      {
        next(value) {
          setConnected(true);
          if (value.data) {
            // The subscription root field name is the first key
            const payload = Object.values(value.data)[0];
            if (payload !== undefined) {
              onDataRef.current(payload as T);
            }
          }
        },
        error() {
          setConnected(false);
        },
        complete() {
          setConnected(false);
        },
      },
    );

    return unsubscribe;
  }, [query, variables]);

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

export function useOracleSubscription(onUpdate: (o: OracleUpdateEvent) => void) {
  return useGraphQLSubscription<OracleUpdateEvent>(
    `subscription { oracleUpdated { id feed price timestamp blockNumber } }`,
    onUpdate,
  );
}
