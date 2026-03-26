import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ChatModelFactory } from "./routes/agent.js";
import { type ApiDependencies, createApiServer } from "./server.js";

function createDeps(
  chatTools: StructuredToolInterface[],
  createChatModel?: ChatModelFactory,
) {
  return {
    signerService: {
      strategistAddress: "0x0000000000000000000000000000000000000001",
    },
    yieldService: {},
    crossChainService: {},
    swapRouterService: {},
    chatTools,
    createChatModel,
  } as unknown as ApiDependencies;
}

test("GET /api/health responds and only configured origins receive CORS headers", async (t) => {
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
    data: { response: "• Vault state is available.\n• Total assets: 1 DOT." },
    timestamp: payload.timestamp,
  });
});

test("POST /api/chat cannot execute write-capable tool calls", async (t) => {
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
