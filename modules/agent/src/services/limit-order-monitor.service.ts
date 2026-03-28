import { formatUnits, parseUnits } from "viem";
import type { SwapRouteResult } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { eventBus } from "./event-bus.service.js";
import type { SwapRouterService } from "./swap-router.service.js";

const monLog = logger.child({ module: "limit-order-monitor" });

export type LimitOrderStatus =
  | "pending"
  | "triggered"
  | "expired"
  | "cancelled";

export interface LimitOrderInput {
  id: string;
  ownerAddress: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string; // human-readable (e.g. "10.5")
  targetPrice: string; // human-readable price (tokenOut per tokenIn)
  expiry: number; // Unix ms timestamp
  marketPriceAtOrder: string;
  createdAt: number;
}

export interface LimitOrder extends LimitOrderInput {
  status: LimitOrderStatus;
  triggeredAt?: number;
  cancelledAt?: number;
  currentPrice?: string;
  proposedRoute?: SwapRouteResult;
}

// Max total live orders held in memory. Terminal-state orders older than this
// are evicted when a new order would push the map over the cap.
const MAX_ORDERS = 500;
const TERMINAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class LimitOrderMonitorService {
  private orders = new Map<string, LimitOrder>();
  private swapRouterService: SwapRouterService;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private checkInFlight = false;

  constructor(swapRouterService: SwapRouterService) {
    this.swapRouterService = swapRouterService;
  }

  private evictTerminalOrders(): void {
    if (this.orders.size < MAX_ORDERS) return;

    const cutoff = Date.now() - TERMINAL_TTL_MS;
    for (const [id, order] of this.orders.entries()) {
      if (
        (order.status === "expired" || order.status === "cancelled") &&
        order.createdAt < cutoff
      ) {
        this.orders.delete(id);
        if (this.orders.size < MAX_ORDERS) break;
      }
    }

    if (this.orders.size >= MAX_ORDERS) {
      monLog.warn(
        { orderCount: this.orders.size },
        "Order store at capacity — rejecting new order",
      );
      throw new Error("Order store at capacity");
    }
  }

  addOrder(order: LimitOrderInput): LimitOrder {
    this.evictTerminalOrders();

    const next: LimitOrder = {
      ...order,
      ownerAddress: order.ownerAddress.toLowerCase(),
      status: "pending",
    };
    this.orders.set(next.id, next);
    monLog.info(
      {
        orderId: next.id,
        ownerAddress: next.ownerAddress,
        pair: `${next.tokenInSymbol}→${next.tokenOutSymbol}`,
      },
      "Limit order registered",
    );
    return next;
  }

  cancelOrder(id: string, ownerAddress?: string): LimitOrder | null {
    const order = this.orders.get(id);
    if (!order) return null;

    if (ownerAddress && order.ownerAddress !== ownerAddress.toLowerCase()) {
      return null;
    }

    const cancelled: LimitOrder = {
      ...order,
      status: "cancelled",
      cancelledAt: Date.now(),
    };
    this.orders.set(id, cancelled);
    monLog.info(
      { orderId: id, ownerAddress: order.ownerAddress },
      "Limit order cancelled",
    );
    return cancelled;
  }

  getOrders(ownerAddress?: string): LimitOrder[] {
    this.syncStatuses();

    const normalizedOwner = ownerAddress?.toLowerCase();
    return Array.from(this.orders.values())
      .filter((order) =>
        normalizedOwner ? order.ownerAddress === normalizedOwner : true,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  start(intervalMs = 30_000): void {
    if (this.intervalId) return;
    monLog.info({ intervalMs }, "Limit order monitor started");
    this.intervalId = setInterval(() => void this.checkOrders(), intervalMs);
    // Run immediately on start
    void this.checkOrders();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private syncStatuses(now = Date.now()): void {
    for (const [id, order] of this.orders.entries()) {
      if (
        order.expiry <= now &&
        order.status !== "expired" &&
        order.status !== "cancelled"
      ) {
        this.orders.set(id, {
          ...order,
          status: "expired",
        });
      }
    }
  }

  private async checkOrders(): Promise<void> {
    if (this.checkInFlight) return;
    this.checkInFlight = true;

    const now = Date.now();
    this.syncStatuses(now);

    for (const order of this.orders.values()) {
      if (order.status !== "pending") {
        continue;
      }

      try {
        // Use 1 unit of tokenIn to get current market price
        const decimals = 18; // all test tokens use 18 decimals
        const oneUnit = parseUnits("1", decimals).toString();
        const routes = await this.swapRouterService.findRoutes(
          order.tokenInAddress,
          order.tokenOutAddress,
          BigInt(oneUnit),
        );

        const bestLocal = routes
          .filter(
            (r) =>
              r.routeType === "local" &&
              r.status === "live" &&
              r.amountOut !== "0" &&
              /^\d+$/.test(r.amountOut),
          )
          .reduce<(typeof routes)[0] | null>(
            (best, r) =>
              !best || BigInt(r.amountOut) > BigInt(best.amountOut) ? r : best,
            null,
          );

        if (!bestLocal) continue;

        const currentPrice = formatUnits(BigInt(bestLocal.amountOut), decimals);
        const targetNum = Number(order.targetPrice);
        const currentNum = Number(currentPrice);

        if (currentNum >= targetNum) {
          const triggered: LimitOrder = {
            ...order,
            status: "triggered",
            triggeredAt: now,
            currentPrice,
            proposedRoute: bestLocal,
          };
          this.orders.set(order.id, triggered);
          monLog.info(
            { orderId: order.id, currentPrice, targetPrice: order.targetPrice },
            "Limit order target price reached — broadcasting event",
          );
          eventBus.broadcast({
            type: "limit_order:triggered",
            data: {
              orderId: order.id,
              ownerAddress: order.ownerAddress,
              tokenInSymbol: order.tokenInSymbol,
              tokenOutSymbol: order.tokenOutSymbol,
              targetPrice: order.targetPrice,
              currentPrice,
              proposedRoute: bestLocal,
              timestamp: Date.now(),
            },
          });
        }
      } catch (err) {
        monLog.warn(
          { err, orderId: order.id },
          "Error checking limit order price",
        );
      }
    }

    this.checkInFlight = false;
  }
}
