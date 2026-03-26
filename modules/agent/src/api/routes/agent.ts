import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { FastifyInstance } from "fastify";

import { createLlm } from "../../agent/llm.js";
import { strategyStore } from "../../services/strategy-store.service.js";
import { logger } from "../../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Agent API Routes — Decision log + AI chat
// ─────────────────────────────────────────────────────────────────────────────

const chatLog = logger.child({ module: "api-chat" });

const MAX_CHAT_ITERATIONS = 5;

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

type ConversationMessage =
  | SystemMessage
  | HumanMessage
  | AIMessage
  | ToolMessage;

type ChatModelLike = {
  invoke: (messages: ConversationMessage[]) => Promise<AIMessage>;
  bindTools?: (tools: StructuredToolInterface[]) => ChatModelLike;
};

export type ChatModelFactory = () => Promise<ChatModelLike>;

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

  /** POST /api/chat — AI chat with optional conversation history. */
  app.post("/api/chat", async (request) => {
    const body = request.body as {
      message?: string;
      history?: Array<{ role: string; content: string }>;
    };
    const userMessage = body?.message;
    const history = body?.history ?? [];

    if (!userMessage || typeof userMessage !== "string") {
      return { success: false, error: "Missing 'message' in request body" };
    }

    chatLog.info(
      { messageLength: userMessage.length, historyLength: history.length },
      "Chat request received",
    );

    try {
      const response = await runChat(
        tools,
        userMessage,
        history,
        createChatModel,
      );
      return { success: true, data: { response }, timestamp: Date.now() };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      chatLog.error({ error: msg }, "Chat error");
      return { success: false, error: msg };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Chat Runner
// ─────────────────────────────────────────────────────────────────────────────

async function runChat(
  tools: StructuredToolInterface[],
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  createChatModel: ChatModelFactory = createLlm,
): Promise<string> {
  const model = await createChatModel();
  const boundModel =
    tools.length > 0 && typeof model.bindTools === "function"
      ? model.bindTools(tools)
      : model;

  const toolMap = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Reconstruct prior turns from the client-provided history
  const priorMessages = history.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  const messages: ConversationMessage[] = [
    new SystemMessage(CHAT_SYSTEM_PROMPT),
    ...priorMessages,
    new HumanMessage(userMessage),
  ];

  for (let i = 0; i < MAX_CHAT_ITERATIONS; i++) {
    const response = await boundModel.invoke(messages);
    messages.push(response as AIMessage);

    const aiMessage = response as AIMessage;
    const toolCalls = aiMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const content = aiMessage.content;
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
        messages.push(
          new ToolMessage({
            content:
              typeof result === "string" ? result : JSON.stringify(result),
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

  return "I was unable to complete your request within the allowed steps. Please try a simpler query.";
}
