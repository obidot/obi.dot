import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Event Bus — Pub/Sub for real-time WebSocket broadcasts
// ─────────────────────────────────────────────────────────────────────────────

const busLog = logger.child({ module: "event-bus" });

export interface VaultStateEvent {
  type: "vault:stateUpdate";
  data: {
    totalAssets: string;
    idleBalance: string;
    remoteAssets: string;
    paused: boolean;
    emergencyMode: boolean;
    nonce: string;
    timestamp: number;
  };
}

export interface StrategyExecutedEvent {
  type: "strategy:executed";
  data: {
    id: string;
    action: string;
    amount: string;
    target: string;
    reasoning: string;
    timestamp: number;
  };
}

export interface StrategyOutcomeEvent {
  type: "strategy:outcome";
  data: {
    id: string;
    status: "Executed" | "Failed" | "Timeout";
    timestamp: number;
  };
}

export interface AgentDecisionEvent {
  type: "agent:decision";
  data: {
    cycle: number;
    action: string;
    reasoning: string;
    timestamp: number;
  };
}

export interface OraclePriceEvent {
  type: "oracle:priceUpdate";
  data: {
    asset: string;
    price: string;
    decimals: number;
    timestamp: number;
  };
}

export type WsEvent =
  | VaultStateEvent
  | StrategyExecutedEvent
  | StrategyOutcomeEvent
  | AgentDecisionEvent
  | OraclePriceEvent;

/**
 * Singleton event bus for broadcasting real-time events to WebSocket clients.
 */
class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /** Emit a typed WebSocket event. */
  broadcast(event: WsEvent): void {
    busLog.debug({ type: event.type }, "Broadcasting event");
    this.emit("ws:event", event);
  }

  /** Subscribe to all WebSocket events. */
  onEvent(handler: (event: WsEvent) => void): void {
    this.on("ws:event", handler);
  }

  /** Unsubscribe from WebSocket events. */
  offEvent(handler: (event: WsEvent) => void): void {
    this.off("ws:event", handler);
  }
}

export const eventBus = EventBus.getInstance();
