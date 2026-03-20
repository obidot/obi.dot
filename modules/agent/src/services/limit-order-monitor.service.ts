import { logger } from "../utils/logger.js";
import { eventBus } from "./event-bus.service.js";
import type { SwapRouterService } from "./swap-router.service.js";
import { parseUnits, formatUnits } from "viem";

const monLog = logger.child({ module: "limit-order-monitor" });

export interface LimitOrder {
  id: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string;       // human-readable (e.g. "10.5")
  targetPrice: string;    // human-readable price (tokenOut per tokenIn)
  expiry: number;         // Unix ms timestamp
  createdAt: number;
}

export class LimitOrderMonitorService {
  private orders = new Map<string, LimitOrder>();
  private swapRouterService: SwapRouterService;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(swapRouterService: SwapRouterService) {
    this.swapRouterService = swapRouterService;
  }

  addOrder(order: LimitOrder): void {
    this.orders.set(order.id, order);
    monLog.info({ orderId: order.id, pair: `${order.tokenInSymbol}→${order.tokenOutSymbol}` }, "Limit order registered");
  }

  cancelOrder(id: string): boolean {
    const existed = this.orders.has(id);
    this.orders.delete(id);
    if (existed) monLog.info({ orderId: id }, "Limit order cancelled");
    return existed;
  }

  getOrders(): LimitOrder[] {
    return Array.from(this.orders.values());
  }

  start(intervalMs = 60_000): void {
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

  private async checkOrders(): Promise<void> {
    const now = Date.now();
    for (const order of this.orders.values()) {
      // Remove expired orders silently
      if (order.expiry <= now) {
        this.orders.delete(order.id);
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
          .filter((r) => r.routeType === "local" && r.amountOut !== "0" && /^\d+$/.test(r.amountOut))
          .reduce<typeof routes[0] | null>((best, r) =>
            !best || BigInt(r.amountOut) > BigInt(best.amountOut) ? r : best,
          null);

        if (!bestLocal) continue;

        const currentPrice = formatUnits(BigInt(bestLocal.amountOut), decimals);
        const targetNum = Number(order.targetPrice);
        const currentNum = Number(currentPrice);

        if (currentNum >= targetNum) {
          monLog.info(
            { orderId: order.id, currentPrice, targetPrice: order.targetPrice },
            "Limit order target price reached — broadcasting event",
          );
          eventBus.broadcast({
            type: "limit_order:triggered",
            data: {
              orderId: order.id,
              tokenInSymbol: order.tokenInSymbol,
              tokenOutSymbol: order.tokenOutSymbol,
              targetPrice: order.targetPrice,
              currentPrice,
              timestamp: Date.now(),
            },
          });
          // Remove after triggering (order can be re-placed if not executed)
          this.orders.delete(order.id);
        }
      } catch (err) {
        monLog.warn({ err, orderId: order.id }, "Error checking limit order price");
      }
    }
  }
}
