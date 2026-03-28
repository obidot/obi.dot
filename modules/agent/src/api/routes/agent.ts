import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { FastifyInstance, FastifyReply } from "fastify";

import { createLlm } from "../../agent/llm.js";
import { strategyStore } from "../../services/strategy-store.service.js";
import type { SwapRouteResult } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Agent API Routes — Decision log + AI chat
// ─────────────────────────────────────────────────────────────────────────────

const chatLog = logger.child({ module: "api-chat" });

const MAX_CHAT_ITERATIONS = 5;
const MAX_CHAT_HISTORY_MESSAGES = 40;
const MAX_CHAT_REQUESTS_PER_MINUTE = 10;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const STREAM_CHUNK_SIZE = 32;

const CHAT_SYSTEM_PROMPT = `You are the Obidot Vault Assistant — a read-only DeFi assistant for the Obidot cross-chain vault on Polkadot Hub.

You may:
- Check vault state, yield data, cross-chain state, and recent decision logs
- Find swap routes and quote outputs
- Answer questions using only the read-only tools provided to you

Rules:
1. This HTTP chat surface is strictly read-only. Never claim that you deposited, swapped, signed, or executed anything.
2. If the user asks to perform a write action, explain that HTTP chat cannot execute transactions and direct them to an operator-controlled workflow instead.
3. Use tools only for inspection, quoting, and status checks.
4. If a requested tool is unavailable, say so plainly rather than improvising.
5. Format responses concisely. Use bullet points.
6. For amounts, show human-readable values when possible (for example "1,000 DOT") rather than raw wei.
7. Never expose private keys or sensitive internal state.`;

const EXECUTE_CHAT_SYSTEM_PROMPT = `You are the Obidot Trading Assistant for the browser app on Polkadot Hub.

You may:
- Inspect vault state, yield data, cross-chain state, and recent agent decisions
- Find swap routes and quote expected output using only the read-only tools
- Recommend the best live route for a requested swap

Rules:
1. This browser chat surface NEVER signs or executes transactions.
2. For any swap request, call find_swap_routes before answering.
3. If a viable live route exists, explain the route and expected output clearly.
4. Never claim that any swap, deposit, or rebalance has been executed.
5. If no live route exists, say so plainly.
6. Format responses concisely. Use bullet points.
7. Never expose private keys or sensitive internal state.`;

type ConversationMessage =
  | SystemMessage
  | HumanMessage
  | AIMessage
  | ToolMessage;

type ChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

type ChatRouteOptions = {
  systemPrompt?: string;
  persistKey?: string;
  history?: ChatHistoryEntry[];
  onTradeProposal?: (route: SwapRouteResult) => void | Promise<void>;
};

type ChatRunResult = {
  response: string;
  tradeProposal?: SwapRouteResult;
};

type ChatModelLike = {
  invoke: (messages: ConversationMessage[]) => Promise<AIMessage>;
  bindTools?: (tools: StructuredToolInterface[]) => ChatModelLike;
};

export type ChatModelFactory = () => Promise<ChatModelLike>;

const chatHistoryStore = new Map<string, ChatHistoryEntry[]>();
const chatRateLimitStore = new Map<string, number[]>();

export function resetChatRouteState(): void {
  chatHistoryStore.clear();
  chatRateLimitStore.clear();
}

export function registerAgentRoutes(
  app: FastifyInstance,
  tools: StructuredToolInterface[],
  createChatModel: ChatModelFactory = createLlm,
): void {
  /** GET /api/agent/log — Recent agent decisions. */
  app.get("/api/agent/log", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? "50"), 100);
    const offset = Number(query.offset ?? "0");

    return {
      success: true,
      data: strategyStore.getDecisions(limit, offset),
      total: strategyStore.getDecisionCount(),
      limit,
      offset,
      timestamp: Date.now(),
    };
  });

  /** POST /api/chat — AI chat with optional history or a persisted address key. */
  app.post("/api/chat", async (request) => {
    const body = request.body as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
      address?: string;
    };
    const userMessage = body?.message;
    const address = normalizeChatKey(body?.address);
    const history = address
      ? getStoredHistory(address)
      : normalizeHistory(body?.history ?? []);

    if (!userMessage || typeof userMessage !== "string") {
      return { success: false, error: "Missing 'message' in request body" };
    }

    if (address && isRateLimited(address)) {
      return {
        success: false,
        error: "Rate limit exceeded. Please wait a moment and try again.",
      };
    }

    chatLog.info(
      {
        address,
        messageLength: userMessage.length,
        historyLength: history.length,
      },
      "Chat request received",
    );

    try {
      const result = await runChat(tools, userMessage, createChatModel, {
        history,
        persistKey: address ?? undefined,
      });

      return {
        success: true,
        data: {
          response: result.response,
          proposal: result.tradeProposal ?? null,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      chatLog.error({ error: msg }, "Chat error");
      return { success: false, error: msg };
    }
  });

  /** POST /api/chat/execute — Streamed AI chat with optional trade proposal events. */
  app.post("/api/chat/execute", async (request, reply) => {
    const body = request.body as {
      message?: string;
      address?: string;
    };
    const userMessage = body?.message;
    const address = normalizeChatKey(body?.address);

    if (!userMessage || typeof userMessage !== "string") {
      reply.code(400);
      return { success: false, error: "Missing 'message' in request body" };
    }

    const MAX_MESSAGE_LENGTH = 4_000;
    if (userMessage.length > MAX_MESSAGE_LENGTH) {
      reply.code(400);
      return {
        success: false,
        error: `Message too long — max ${MAX_MESSAGE_LENGTH} characters`,
      };
    }

    if (!address) {
      reply.code(400);
      return { success: false, error: "Missing 'address' in request body" };
    }

    if (isRateLimited(address)) {
      reply.code(429);
      return {
        success: false,
        error: "Rate limit exceeded. Please wait a moment and try again.",
      };
    }

    chatLog.info(
      {
        address,
        messageLength: userMessage.length,
        historyLength: getStoredHistory(address).length,
      },
      "Streaming chat request received",
    );

    startEventStream(reply);

    try {
      const result = await runChat(tools, userMessage, createChatModel, {
        systemPrompt: EXECUTE_CHAT_SYSTEM_PROMPT,
        history: getStoredHistory(address),
        persistKey: address,
        onTradeProposal: async (route) => {
          writeEvent(reply, "trade_proposal", {
            proposal: toTradeProposal(route),
          });
        },
      });

      for (const chunk of chunkText(result.response)) {
        writeEvent(reply, "message", { chunk });
      }

      writeEvent(reply, "done", {
        response: result.response,
        proposal: result.tradeProposal ?? null,
        timestamp: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatLog.error({ error: message, address }, "Streaming chat error");
      writeEvent(reply, "error", { error: message });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Chat Runner
// ─────────────────────────────────────────────────────────────────────────────

async function runChat(
  tools: StructuredToolInterface[],
  userMessage: string,
  createChatModel: ChatModelFactory = createLlm,
  options: ChatRouteOptions = {},
): Promise<ChatRunResult> {
  const model = await createChatModel();
  const boundModel =
    tools.length > 0 && typeof model.bindTools === "function"
      ? model.bindTools(tools)
      : model;

  const toolMap = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  const priorMessages = (options.history ?? []).map((message) =>
    message.role === "user"
      ? new HumanMessage(message.content)
      : new AIMessage(message.content),
  );

  const messages: ConversationMessage[] = [
    new SystemMessage(options.systemPrompt ?? CHAT_SYSTEM_PROMPT),
    ...priorMessages,
    new HumanMessage(userMessage),
  ];
  let tradeProposal: SwapRouteResult | undefined;

  for (let i = 0; i < MAX_CHAT_ITERATIONS; i++) {
    const response = await boundModel.invoke(messages);
    messages.push(response as AIMessage);

    const aiMessage = response as AIMessage;
    const toolCalls = aiMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const responseText = extractMessageText(aiMessage.content);

      if (options.persistKey) {
        persistConversation(options.persistKey, userMessage, responseText);
      }

      return {
        response: responseText,
        tradeProposal,
      };
    }

    for (const toolCall of toolCalls) {
      const tool = toolMap.get(toolCall.name);
      if (!tool) {
        messages.push(
          new ToolMessage({
            content: JSON.stringify({
              success: false,
              error: `Unknown tool: ${toolCall.name}`,
            }),
            tool_call_id: toolCall.id ?? "",
          }),
        );
        continue;
      }

      try {
        const result = await tool.invoke(JSON.stringify(toolCall.args));
        const serializedResult =
          typeof result === "string" ? result : JSON.stringify(result);

        if (!tradeProposal) {
          tradeProposal = extractTradeProposal(toolCall.name, serializedResult);
          if (tradeProposal) {
            await options.onTradeProposal?.(tradeProposal);
          }
        }

        messages.push(
          new ToolMessage({
            content: serializedResult,
            tool_call_id: toolCall.id ?? "",
          }),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        messages.push(
          new ToolMessage({
            content: JSON.stringify({ success: false, error: errorMessage }),
            tool_call_id: toolCall.id ?? "",
          }),
        );
      }
    }
  }

  const fallback =
    "I was unable to complete your request within the allowed steps. Please try a simpler query.";

  if (options.persistKey) {
    persistConversation(options.persistKey, userMessage, fallback);
  }

  return {
    response: fallback,
    tradeProposal,
  };
}

function toTradeProposal(route: SwapRouteResult) {
  const firstHop = route.hops[0];
  const lastHop = route.hops[route.hops.length - 1];

  return {
    id: route.id,
    action: "swap",
    title:
      firstHop && lastHop
        ? `${firstHop.tokenInSymbol} -> ${lastHop.tokenOutSymbol}`
        : "Swap proposal",
    summary: "Review this live route in your wallet before execution.",
    tokenIn: route.tokenIn,
    tokenInSymbol: firstHop?.tokenInSymbol,
    tokenOut: route.tokenOut,
    tokenOutSymbol: lastHop?.tokenOutSymbol,
    amountIn: route.amountIn,
    expectedAmountOut: route.amountOut,
    minAmountOut: route.minAmountOut,
    route: route.hops.map((hop) => ({
      pool: hop.pool,
      poolLabel: hop.poolLabel,
      poolType: hop.poolType,
      tokenIn: hop.tokenIn,
      tokenInSymbol: hop.tokenInSymbol,
      tokenOut: hop.tokenOut,
      tokenOutSymbol: hop.tokenOutSymbol,
      amountIn: hop.amountIn,
      amountOut: hop.amountOut,
      feeBps: hop.feeBps,
      priceImpactBps: hop.priceImpactBps,
    })),
    status: route.status,
    raw: route,
  };
}

function normalizeHistory(
  history: Array<{ role: string; content: string }>,
): ChatHistoryEntry[] {
  return history
    .filter(
      (entry): entry is { role: "user" | "assistant"; content: string } =>
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0,
    )
    .slice(-MAX_CHAT_HISTORY_MESSAGES);
}

function normalizeChatKey(value: string | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getStoredHistory(key: string): ChatHistoryEntry[] {
  return [...(chatHistoryStore.get(key) ?? [])];
}

function persistConversation(
  key: string,
  userMessage: string,
  assistantMessage: string,
): void {
  const history = getStoredHistory(key);
  history.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantMessage },
  );

  if (history.length > MAX_CHAT_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_CHAT_HISTORY_MESSAGES);
  }

  chatHistoryStore.set(key, history);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (chatRateLimitStore.get(key) ?? []).filter(
    (timestamp) => now - timestamp < CHAT_RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= MAX_CHAT_REQUESTS_PER_MINUTE) {
    chatRateLimitStore.set(key, recent);
    return true;
  }

  recent.push(now);
  chatRateLimitStore.set(key, recent);
  return false;
}

function extractMessageText(content: AIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && "text" in part)
          return String(part.text);
        return "";
      })
      .join("");
  }
  return String(content);
}

function extractTradeProposal(
  toolName: string,
  serializedResult: string,
): SwapRouteResult | undefined {
  if (toolName !== "find_swap_routes") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(serializedResult) as {
      success?: boolean;
      data?: {
        amountIn?: string;
        liveRoutes?: Array<{
          id: string;
          tokenIn?: string;
          tokenOut?: string;
          amountOut: string;
          minAmountOut: string;
          totalFeeBps: string;
          totalPriceImpactBps: string;
          routeType?: SwapRouteResult["routeType"];
          status?: SwapRouteResult["status"];
          hops?: Array<{
            pool: string;
            poolLabel: string;
            poolType?: string;
            tokenIn: string;
            tokenInSymbol: string;
            tokenOut: string;
            tokenOutSymbol: string;
            amountIn: string;
            amountOut: string;
            feeBps: string;
            priceImpactBps?: string;
          }>;
        }>;
      };
    };

    const liveRoute = parsed.data?.liveRoutes?.[0];
    if (!parsed.success || !liveRoute || !liveRoute.hops?.length) {
      return undefined;
    }

    return {
      id: liveRoute.id,
      tokenIn: liveRoute.tokenIn ?? liveRoute.hops[0].tokenIn,
      tokenOut:
        liveRoute.tokenOut ??
        liveRoute.hops[liveRoute.hops.length - 1]?.tokenOut ??
        liveRoute.hops[0].tokenOut,
      amountIn: parsed.data?.amountIn ?? liveRoute.hops[0].amountIn,
      amountOut: liveRoute.amountOut,
      minAmountOut: liveRoute.minAmountOut,
      totalFeeBps: liveRoute.totalFeeBps,
      totalPriceImpactBps: liveRoute.totalPriceImpactBps,
      routeType: liveRoute.routeType ?? "local",
      status: liveRoute.status ?? "live",
      hops: liveRoute.hops.map((hop) => ({
        pool: hop.pool,
        poolLabel: hop.poolLabel,
        poolType: hop.poolType ?? "UniswapV2",
        tokenIn: hop.tokenIn,
        tokenInSymbol: hop.tokenInSymbol,
        tokenOut: hop.tokenOut,
        tokenOutSymbol: hop.tokenOutSymbol,
        amountIn: hop.amountIn,
        amountOut: hop.amountOut,
        feeBps: hop.feeBps,
        priceImpactBps: hop.priceImpactBps ?? "0",
      })),
    };
  } catch {
    return undefined;
  }
}

function startEventStream(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
}

function writeEvent(
  reply: FastifyReply,
  event: "message" | "trade_proposal" | "done" | "error",
  data: unknown,
): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function chunkText(text: string): string[] {
  if (!text) return [];

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + STREAM_CHUNK_SIZE));
  }

  return chunks;
}
