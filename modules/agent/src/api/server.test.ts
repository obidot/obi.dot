import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ExecuteLocalSwapTool } from "../agent/tools.js";
import type {
  LimitOrder,
  LimitOrderInput,
} from "../services/limit-order-monitor.service.js";
import { PoolType } from "../types/index.js";
import { type ChatModelFactory, resetChatRouteState } from "./routes/agent.js";
import { type ApiDependencies, createApiServer } from "./server.js";

function createLimitOrderMonitorStub() {
  const orders = new Map<string, LimitOrder>();

  return {
    addOrder(input: LimitOrderInput) {
      const order: LimitOrder = {
        ...input,
        ownerAddress: input.ownerAddress.toLowerCase(),
        status: "pending",
      };
      orders.set(order.id, order);
      return order;
    },
    cancelOrder(id: string, ownerAddress?: string) {
      const order = orders.get(id);
      if (!order) return null;
      if (ownerAddress && order.ownerAddress !== ownerAddress.toLowerCase()) {
        return null;
      }
      const cancelled: LimitOrder = {
        ...order,
        status: "cancelled",
      };
      orders.set(id, cancelled);
      return cancelled;
    },
    getOrders(ownerAddress?: string) {
      const normalizedOwner = ownerAddress?.toLowerCase();
      return Array.from(orders.values()).filter((order) =>
        normalizedOwner ? order.ownerAddress === normalizedOwner : true,
      );
    },
  };
}

function createDeps(
  chatTools: StructuredToolInterface[],
  createChatModel?: ChatModelFactory,
  overrides?: Partial<ApiDependencies>,
) {
  const limitOrderMonitorService = createLimitOrderMonitorStub();

  return {
    signerService: {
      strategistAddress: "0x0000000000000000000000000000000000000001",
    },
    yieldService: {},
    crossChainService: {},
    swapRouterService: {
      isRouterDeployed: true,
      isQuoterDeployed: true,
      getBestQuote: async () => null,
      getAllQuotes: async () => [],
      findRoutes: async () => [],
      getPoolAdapters: () => [],
      isRouterPaused: async () => false,
      isPreviewOnlyPoolType: () => false,
    },
    limitOrderMonitorService,
    chatTools,
    createChatModel,
    ...overrides,
  } as unknown as ApiDependencies;
}

test("GET /api/health responds and only configured origins receive CORS headers", async (t) => {
  resetChatRouteState();
  const app = await createApiServer(createDeps([]));

  t.after(() => app.close());

  const allowed = await app.inject({
    method: "GET",
    url: "/api/health",
    headers: {
      origin: "http://localhost:3010",
    },
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(
    allowed.headers["access-control-allow-origin"],
    "http://localhost:3010",
  );

  const blocked = await app.inject({
    method: "GET",
    url: "/api/health",
    headers: {
      origin: "http://evil.example",
    },
  });

  assert.equal(blocked.statusCode, 200);
  assert.equal(blocked.headers["access-control-allow-origin"], undefined);
});

test("POST /api/chat answers read-only requests", async (t) => {
  resetChatRouteState();
  const readOnlyTool = {
    name: "fetch_vault_state",
    invoke: async () =>
      JSON.stringify({
        success: true,
        data: { totalAssets: "1000000000000000000" },
      }),
  } as unknown as StructuredToolInterface;

  const createChatModel: ChatModelFactory = async () => ({
    bindTools: () => ({
      invoke: async () =>
        new AIMessage({
          content: "• Vault state is available.\n• Total assets: 1 DOT.",
        }),
    }),
    invoke: async () =>
      new AIMessage({
        content: "• Vault state is available.\n• Total assets: 1 DOT.",
      }),
  });

  const app = await createApiServer(
    createDeps([readOnlyTool], createChatModel),
  );

  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { message: "Show me the vault state." },
  });

  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(payload, {
    success: true,
    data: {
      response: "• Vault state is available.\n• Total assets: 1 DOT.",
      proposal: null,
    },
    timestamp: payload.timestamp,
  });
});

test("POST /api/chat cannot execute write-capable tool calls", async (t) => {
  resetChatRouteState();
  let invocations = 0;
  const readOnlyTool = {
    name: "fetch_vault_state",
    invoke: async () =>
      JSON.stringify({
        success: true,
        data: { totalAssets: "1000000000000000000" },
      }),
  } as unknown as StructuredToolInterface;

  const createChatModel: ChatModelFactory = async () => ({
    bindTools: () => ({
      invoke: async () => {
        invocations += 1;

        if (invocations === 1) {
          return new AIMessage({
            content: "",
            tool_calls: [
              {
                id: "tool-call-1",
                name: "execute_deposit",
                args: {
                  amount: "1000000000000000000",
                  receiver: "0x0000000000000000000000000000000000000001",
                },
              },
            ] as never,
          });
        }

        return new AIMessage({
          content:
            "• HTTP chat is read-only.\n• Transaction execution is unavailable on this surface.",
        });
      },
    }),
    invoke: async () =>
      new AIMessage({
        content:
          "• HTTP chat is read-only.\n• Transaction execution is unavailable on this surface.",
      }),
  });

  const app = await createApiServer(
    createDeps([readOnlyTool], createChatModel),
  );

  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/chat",
    payload: { message: "Proceed. Deposit 1 DOT now." },
  });

  const payload = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(invocations, 2);
  assert.equal(
    payload.data.response,
    "• HTTP chat is read-only.\n• Transaction execution is unavailable on this surface.",
  );
});

test("POST /api/chat/execute streams text chunks and a trade proposal", async (t) => {
  resetChatRouteState();
  let invocations = 0;

  const findRoutesTool = {
    name: "find_swap_routes",
    invoke: async () =>
      JSON.stringify({
        success: true,
        data: {
          amountIn: "1000000000000000000",
          liveRoutes: [
            {
              id: "tdot-to-tusdc",
              tokenIn: "0x0000000000000000000000000000000000000001",
              tokenOut: "0x0000000000000000000000000000000000000002",
              amountIn: "1000000000000000000",
              amountOut: "1250000",
              minAmountOut: "1240000",
              totalFeeBps: "30",
              totalPriceImpactBps: "12",
              routeType: "local",
              status: "live",
              hops: [
                {
                  pool: "0x0000000000000000000000000000000000000010",
                  poolLabel: "tDOT/tUSDC",
                  poolType: "UniswapV2",
                  tokenIn: "0x0000000000000000000000000000000000000001",
                  tokenInSymbol: "tDOT",
                  tokenOut: "0x0000000000000000000000000000000000000002",
                  tokenOutSymbol: "tUSDC",
                  amountIn: "1000000000000000000",
                  amountOut: "1250000",
                  feeBps: "30",
                  priceImpactBps: "12",
                },
              ],
            },
          ],
        },
      }),
  } as unknown as StructuredToolInterface;

  const createChatModel: ChatModelFactory = async () => ({
    bindTools: () => ({
      invoke: async () => {
        invocations += 1;

        if (invocations === 1) {
          return new AIMessage({
            content: "",
            tool_calls: [
              {
                id: "tool-call-1",
                name: "find_swap_routes",
                args: {
                  tokenIn: "tDOT",
                  tokenOut: "tUSDC",
                  amountIn: "1000000000000000000",
                },
              },
            ] as never,
          });
        }

        return new AIMessage({
          content: "• Best route found.\n• Review the proposed swap below.",
        });
      },
    }),
    invoke: async () =>
      new AIMessage({
        content: "• Best route found.\n• Review the proposed swap below.",
      }),
  });

  const app = await createApiServer(
    createDeps([findRoutesTool], createChatModel),
  );

  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/chat/execute",
    payload: {
      message: "What is the best route for 1 tDOT to tUSDC?",
      address: "0x00000000000000000000000000000000000000aa",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
  assert.match(response.body, /event: trade_proposal/);
  assert.match(response.body, /event: message/);
  assert.match(response.body, /event: done/);
  assert.match(response.body, /tdot-to-tusdc/);
});

test("POST /api/chat/execute enforces per-address rate limits", async (t) => {
  resetChatRouteState();

  const createChatModel: ChatModelFactory = async () => ({
    bindTools: () => ({
      invoke: async () =>
        new AIMessage({
          content: "• Ready.",
        }),
    }),
    invoke: async () =>
      new AIMessage({
        content: "• Ready.",
      }),
  });

  const app = await createApiServer(createDeps([], createChatModel));

  t.after(() => app.close());

  for (let i = 0; i < 10; i += 1) {
    const ok = await app.inject({
      method: "POST",
      url: "/api/chat/execute",
      payload: {
        message: `Ping ${i}`,
        address: "0x00000000000000000000000000000000000000aa",
      },
    });

    assert.equal(ok.statusCode, 200);
  }

  const limited = await app.inject({
    method: "POST",
    url: "/api/chat/execute",
    payload: {
      message: "Ping 11",
      address: "0x00000000000000000000000000000000000000aa",
    },
  });

  assert.equal(limited.statusCode, 429);
  assert.equal(
    limited.json().error,
    "Rate limit exceeded. Please wait a moment and try again.",
  );
});

test("limit-order routes create, list, and cancel orders", async (t) => {
  resetChatRouteState();
  const app = await createApiServer(createDeps([]));

  t.after(() => app.close());

  const order = {
    id: "order-1",
    ownerAddress: "0x00000000000000000000000000000000000000AA",
    tokenInSymbol: "tDOT",
    tokenOutSymbol: "tUSDC",
    tokenInAddress: "0x0000000000000000000000000000000000000001",
    tokenOutAddress: "0x0000000000000000000000000000000000000002",
    amountIn: "10",
    targetPrice: "1.25",
    expiry: Date.now() + 60_000,
    marketPriceAtOrder: "1.12",
    createdAt: Date.now(),
  };

  const created = await app.inject({
    method: "POST",
    url: "/api/limit-orders",
    payload: order,
  });

  assert.equal(created.statusCode, 200);
  assert.equal(created.json().data.order.id, order.id);

  const listed = await app.inject({
    method: "GET",
    url: `/api/limit-orders/${order.ownerAddress}`,
  });

  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().data.orders.length, 1);
  assert.equal(listed.json().data.orders[0].status, "pending");

  const cancelled = await app.inject({
    method: "DELETE",
    url: `/api/limit-orders/${order.id}?address=${order.ownerAddress}`,
  });

  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().data.order.status, "cancelled");
});

test("GET /api/swap/quote labels AssetHub quotes as preview-only", async (t) => {
  resetChatRouteState();
  const app = await createApiServer(
    createDeps([], undefined, {
      swapRouterService: {
        isQuoterDeployed: true,
        isRouterDeployed: true,
        getBestQuote: async () => ({
          source: PoolType.AssetHubPair,
          pool: "0x0000000000000000000000000000000000000010",
          feeBps: 30n,
          amountIn: 1000n,
          amountOut: 1000n,
          status: "simulated",
          previewOnly: true,
          note: "AssetHub Pair quotes are preview-only on testnet until live pricing is verified.",
        }),
        getAllQuotes: async () => [
          {
            source: PoolType.AssetHubPair,
            pool: "0x0000000000000000000000000000000000000010",
            feeBps: 30n,
            amountIn: 1000n,
            amountOut: 1000n,
            status: "simulated",
            previewOnly: true,
            note: "AssetHub Pair quotes are preview-only on testnet until live pricing is verified.",
          },
        ],
        getPoolAdapters: () => [],
        isRouterPaused: async () => false,
        isPreviewOnlyPoolType: () => true,
      } as never,
    }),
  );

  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/swap/quote",
    query: {
      pool: "0x0000000000000000000000000000000000000000",
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      amountIn: "1000",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.bestQuote.status, "simulated");
  assert.equal(response.json().data.bestQuote.previewOnly, true);
});

test("GET /api/routes preserves preview-only route notes", async (t) => {
  resetChatRouteState();
  const app = await createApiServer(
    createDeps([], undefined, {
      swapRouterService: {
        isRouterDeployed: true,
        isQuoterDeployed: true,
        getBestQuote: async () => null,
        getAllQuotes: async () => [],
        findRoutes: async () => [
          {
            id: "assethub-preview",
            tokenIn: "0x0000000000000000000000000000000000000001",
            tokenOut: "0x0000000000000000000000000000000000000002",
            amountIn: "1000000000000000000",
            amountOut: "24925000",
            minAmountOut: "24800375",
            hops: [],
            totalFeeBps: "30",
            totalPriceImpactBps: "0",
            routeType: "xcm",
            status: "simulated",
            previewOnly: true,
            note: "AssetHub Pair quotes are preview-only on testnet until live pricing is verified.",
          },
        ],
        getPoolAdapters: () => [],
        isRouterPaused: async () => false,
        isPreviewOnlyPoolType: () => false,
      } as unknown as ApiDependencies["swapRouterService"],
    }),
  );

  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/routes",
    query: {
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      amountIn: "1000000000000000000",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.routes[0].status, "simulated");
  assert.equal(response.json().data.routes[0].previewOnly, true);
  assert.equal(
    response.json().data.routes[0].note,
    "AssetHub Pair quotes are preview-only on testnet until live pricing is verified.",
  );
});

test("ExecuteLocalSwapTool rejects preview-only routes before signing or execution", async () => {
  const tool = new ExecuteLocalSwapTool(
    {
      isRouterDeployed: true,
      isQuoterDeployed: true,
      buildBestSwap: async () => ({
        route: {
          poolType: PoolType.AssetHubPair,
          pool: "0x0000000000000000000000000000000000000010",
          tokenIn: "0x0000000000000000000000000000000000000001",
          tokenOut: "0x0000000000000000000000000000000000000002",
          feeBps: 30n,
          data: "0x",
        },
        amountIn: 1000n,
        minAmountOut: 900n,
        to: "0x0000000000000000000000000000000000000003",
        deadline: 123n,
      }),
      isPreviewOnlyPoolType: (poolType: PoolType) =>
        poolType === PoolType.AssetHubPair,
    } as never,
    {
      computeDeadline: () => 123n,
      fetchIntentNonce: async () => 1n,
      signStrategyIntent: async () => "0xdeadbeef",
      executeLocalSwap: async () => "0xhash",
    } as never,
  );

  const raw = await tool.invoke(
    JSON.stringify({
      action: "LOCAL_SWAP",
      poolType: PoolType.AssetHubPair,
      pool: "0x0000000000000000000000000000000000000010",
      tokenIn: "0x0000000000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000000002",
      amount: "1000",
      maxSlippageBps: 50,
      reasoning: "Test preview rejection",
    }),
  );

  const payload = JSON.parse(raw) as { success: boolean; error: string };
  assert.equal(payload.success, false);
  assert.match(payload.error, /Preview-only routes cannot be executed/);
});
