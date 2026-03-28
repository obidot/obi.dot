import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  LimitOrderInput,
  LimitOrderMonitorService,
} from "../../services/limit-order-monitor.service.js";

// ── Rate limiting ──────────────────────────────────────────────────────────
// Max 10 requests per address per minute across all limit-order routes.

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(address: string, reply: FastifyReply): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(address);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(address, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    reply.code(429).send({
      success: false,
      error: "Rate limit exceeded — max 10 requests per minute",
    });
    return false;
  }

  entry.count += 1;
  return true;
}

// ── Input guard ────────────────────────────────────────────────────────────

function isLimitOrderInput(body: unknown): body is LimitOrderInput {
  if (!body || typeof body !== "object") return false;

  const candidate = body as Record<string, unknown>;
  const requiredStringFields = [
    "id",
    "ownerAddress",
    "tokenInSymbol",
    "tokenOutSymbol",
    "tokenInAddress",
    "tokenOutAddress",
    "amountIn",
    "targetPrice",
    "marketPriceAtOrder",
  ];

  return (
    requiredStringFields.every(
      (field) => typeof candidate[field] === "string",
    ) &&
    typeof candidate.expiry === "number" &&
    typeof candidate.createdAt === "number"
  );
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function registerLimitOrderRoutes(
  app: FastifyInstance,
  limitOrderMonitorService: LimitOrderMonitorService,
): void {
  app.get<{
    Params: { address: string };
  }>("/api/limit-orders/:address", async (request, reply) => {
    const { address } = request.params;

    if (!address) {
      return reply
        .code(400)
        .send({ success: false, error: "Missing wallet address" });
    }

    if (!checkRateLimit(address.toLowerCase(), reply)) return;

    return {
      success: true,
      data: {
        orders: limitOrderMonitorService.getOrders(address),
      },
      timestamp: Date.now(),
    };
  });

  app.post("/api/limit-orders", async (request, reply) => {
    const body = request.body;

    if (!isLimitOrderInput(body)) {
      return reply
        .code(400)
        .send({ success: false, error: "Invalid limit-order payload" });
    }

    if (!checkRateLimit(body.ownerAddress.toLowerCase(), reply)) return;

    const order = limitOrderMonitorService.addOrder(body);

    return {
      success: true,
      data: { order },
      timestamp: Date.now(),
    };
  });

  app.delete<{
    Params: { id: string };
    Querystring: { address?: string };
  }>("/api/limit-orders/:id", async (request, reply) => {
    const { id } = request.params;
    const { address } = request.query;

    if (!id) {
      return reply
        .code(400)
        .send({ success: false, error: "Missing order id" });
    }

    if (address && !checkRateLimit(address.toLowerCase(), reply)) return;

    const order = limitOrderMonitorService.cancelOrder(id, address);

    if (!order) {
      return reply
        .code(404)
        .send({ success: false, error: "Limit order not found" });
    }

    return {
      success: true,
      data: { order },
      timestamp: Date.now(),
    };
  });
}
