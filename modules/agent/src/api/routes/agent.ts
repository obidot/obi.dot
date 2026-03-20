import type { FastifyInstance } from "fastify";
import type { StructuredToolInterface } from "@langchain/core/tools";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { env } from "../../config/env.js";
import { strategyStore } from "../../services/strategy-store.service.js";
import { logger } from "../../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Agent API Routes — Decision log + AI chat
// ─────────────────────────────────────────────────────────────────────────────

const chatLog = logger.child({ module: "api-chat" });

const MAX_CHAT_ITERATIONS = 5;

const CHAT_SYSTEM_PROMPT = `You are the Obidot Vault Assistant — an AI DeFi assistant for the Obidot cross-chain vault on Polkadot Hub EVM.

Your capabilities:
- Deposit assets into the ERC-4626 vault (use execute_deposit tool)
- Check vault state (idle balance, remote assets, paused, emergency mode)
- Fetch live yield data from Polkadot DeFi protocols (Hydration, Bifrost)
- View cross-chain satellite vault state
- Execute strategies and Bifrost operations
- Show vault performance and oracle status
- Find UV2 swap routes (use find_swap_routes tool — returns live routes with amountOut estimates)
- Execute direct UV2 swaps (use execute_direct_swap tool — tDOT↔TKB, tDOT↔tUSDC, tDOT↔tETH, tUSDC↔tETH, TKB↔TKA)

Rules:
1. Confirm amounts and addresses with the user ONCE before executing write operations. After the user confirms, IMMEDIATELY call the relevant tool — do not ask again.
2. Format responses concisely. Use bullet points.
3. For amounts, show human-readable values (e.g., "1,000 DOT") not raw wei.
4. Never expose private keys or internal state.
5. Once the user says "confirm", "yes", "proceed", or "PROCEED", treat that as authorization and execute immediately.`;

export function registerAgentRoutes(
  app: FastifyInstance,
  tools: StructuredToolInterface[],
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
      const response = await runChat(tools, userMessage, history);
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
): Promise<string> {
  const model = new ChatOpenAI({
    model: "gpt-5-mini",
    apiKey: env.OPENAI_API_KEY,
    temperature: 1,
  });

  const boundModel = tools.length > 0 ? model.bindTools(tools) : model;

  const toolMap = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Reconstruct prior turns from the client-provided history
  const priorMessages = history.map((m) =>
    m.role === "user"
      ? new HumanMessage(m.content)
      : new AIMessage(m.content),
  );

  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
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
