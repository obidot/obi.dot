import {
  type AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Bot } from "grammy";
import { createLlm } from "../agent/llm.js";
import { VAULT_ADDRESS } from "../config/constants.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Obidot Telegram Bot
// ─────────────────────────────────────────────────────────────────────────────

const teleLog = logger.child({ module: "telegram" });

/** Maximum LangChain tool-calling iterations per user message. */
const MAX_ITERATIONS = 5;

/** Maximum conversation turns (human + AI pairs) to retain per user. */
const MAX_HISTORY_TURNS = 20;

/** Telegram message character limit. */
const TELEGRAM_CHAR_LIMIT = 4096;

/** System prompt for the Telegram-facing assistant. */
const TELEGRAM_SYSTEM_PROMPT = `You are the **Obidot Vault Assistant** — an AI-powered DeFi assistant on Telegram for the Obidot cross-chain vault on Polkadot Hub EVM.

## Capabilities
- Deposit assets into the ERC-4626 vault (use execute_deposit tool)
- Check vault state (idle balance, remote assets, paused, emergency mode)
- Fetch live yield data from Polkadot DeFi protocols (Hydration, Bifrost)
- Fetch Bifrost-specific yields (SLP, DEX, Farming, SALP)
- View cross-chain satellite vault state
- Execute cross-chain strategies and Bifrost operations (when authorized)
- Show vault performance and oracle status
- Find best swap routes across UV2 pools (use find_swap_routes tool)
- Execute direct UV2 swaps from agent wallet (use execute_direct_swap tool)
- Supported swap pairs: tDOT↔TKB, tDOT↔tUSDC, tDOT↔tETH, tUSDC↔tETH, TKB↔TKA (multi-hop supported)

## Rules
1. Confirm amounts and addresses with the user ONCE before executing write operations. After the user confirms, IMMEDIATELY call the relevant tool — do not ask again.
2. Format responses concisely for mobile chat — use bullet points, avoid walls of text.
3. Use tool results to provide accurate, up-to-date on-chain information.
4. If a tool returns an error, explain it clearly to the user.
5. For amounts, show human-readable values (e.g., "1,000 DOT") not raw wei strings.
6. Never expose private keys or sensitive internal state.
7. When the vault has no idle balance, clearly inform the user.
8. Once the user says "confirm", "yes", "proceed", or "PROCEED", treat that as authorization and execute immediately without asking for further confirmation.
9. For swap requests: ALWAYS call find_swap_routes first to see available routes and expected output, then confirm with user before calling execute_direct_swap.`;

// ─────────────────────────────────────────────────────────────────────────────
//  Agent Runner
// ─────────────────────────────────────────────────────────────────────────────

type ConversationMessage =
  | SystemMessage
  | HumanMessage
  | AIMessage
  | ToolMessage;

interface AgentRunner {
  run: (userMessage: string, userId: number) => Promise<string>;
}

/**
 * Creates a LangChain tool-calling agent runner with per-user conversation history.
 *
 * History is retained across messages so the model remembers prior context
 * (e.g. a deposit amount/address the user confirmed earlier in the session).
 * Each user gets an independent history capped at MAX_HISTORY_TURNS pairs.
 */
async function createAgentRunner(
  tools: StructuredToolInterface[],
): Promise<AgentRunner> {
  const model = await createLlm();
  const boundModel =
    tools.length > 0 &&
    "bindTools" in model &&
    typeof model.bindTools === "function"
      ? model.bindTools(tools)
      : model;

  const toolMap = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  /** Per-user message history (excluding system prompt, which is prepended each time). */
  const userHistories = new Map<number, ConversationMessage[]>();

  return {
    async run(userMessage: string, userId: number): Promise<string> {
      // Retrieve or initialise this user's history
      if (!userHistories.has(userId)) {
        userHistories.set(userId, []);
      }
      const history = userHistories.get(userId);
      if (!history) {
        throw new Error(`Failed to initialize history for user ${userId}`);
      }

      // Append the new human message
      history.push(new HumanMessage(userMessage));

      // Build full message list: system prompt + rolling history
      const messages: ConversationMessage[] = [
        new SystemMessage(TELEGRAM_SYSTEM_PROMPT),
        ...history,
      ];

      let finalContent =
        "I was unable to complete your request within the allowed steps. Please try a simpler query.";

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await boundModel.invoke(messages);
        const aiMessage = response as AIMessage;
        messages.push(aiMessage);

        const toolCalls = aiMessage.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          const content = aiMessage.content;
          if (typeof content === "string") {
            finalContent = content;
          } else if (Array.isArray(content)) {
            finalContent = content
              .map((part) => {
                if (typeof part === "string") return part;
                if (typeof part === "object" && "text" in part)
                  return String(part.text);
                return "";
              })
              .join("");
          } else {
            finalContent = String(content);
          }

          // Persist AI response to history
          history.push(aiMessage);
          break;
        }

        // Execute tool calls
        for (const toolCall of toolCalls) {
          const tool = toolMap.get(toolCall.name);
          if (!tool) {
            const errMsg = new ToolMessage({
              content: JSON.stringify({
                success: false,
                error: `Unknown tool: ${toolCall.name}`,
              }),
              tool_call_id: toolCall.id ?? "",
            });
            messages.push(errMsg);
            continue;
          }

          try {
            const result = await tool.invoke(JSON.stringify(toolCall.args));
            const toolMsg = new ToolMessage({
              content:
                typeof result === "string" ? result : JSON.stringify(result),
              tool_call_id: toolCall.id ?? "",
            });
            messages.push(toolMsg);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            messages.push(
              new ToolMessage({
                content: JSON.stringify({
                  success: false,
                  error: errorMessage,
                }),
                tool_call_id: toolCall.id ?? "",
              }),
            );
          }
        }
      }

      // Trim history to last MAX_HISTORY_TURNS human+AI pairs to bound context size
      if (history.length > MAX_HISTORY_TURNS * 2) {
        history.splice(0, history.length - MAX_HISTORY_TURNS * 2);
      }

      return finalContent;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Message Splitting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits a long message at newline boundaries to respect Telegram's
 * character limit, avoiding mid-sentence breaks.
 */
function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_CHAR_LIMIT) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_CHAR_LIMIT) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline before the limit
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_CHAR_LIMIT);
    if (splitAt <= 0) {
      // No newline found — split at limit
      splitAt = TELEGRAM_CHAR_LIMIT;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Telegram Bot Setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates and starts the Telegram bot.
 *
 * @param tools - LangChain tools from the AutonomousLoop (shared with the
 *   autonomous agent so users can invoke the same capabilities via chat).
 * @returns The Grammy Bot instance (for lifecycle management).
 */
export async function createTelegramBot(
  tools: StructuredToolInterface[],
): Promise<Bot> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to start the Telegram bot");
  }

  const bot = new Bot(token);
  // exclude execute_local_swap — it's the vault-path tool (requires SOLVER_ROLE +
  // signed StrategyIntent). Telegram users should use execute_direct_swap instead.
  const botTools = tools.filter((t) => t.name !== "execute_local_swap");
  const agent = await createAgentRunner(botTools);

  // ── /start Command ─────────────────────────────────────────────────

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `Welcome to Obidot — Autonomous Cross-Chain Finance on Polkadot\n\n` +
        `Vault: ${VAULT_ADDRESS}\n` +
        `Chain: Polkadot Hub Testnet (Paseo)\n\n` +
        `Send me a message to interact with the vault. Examples:\n` +
        `• "What is the current vault state?"\n` +
        `• "Show me the best yield opportunities"\n` +
        `• "What are the Bifrost yields?"\n` +
        `• "Deposit 100 DOT into the vault"\n\n` +
        `Type /help for all commands.`,
    );
  });

  // ── /help Command ──────────────────────────────────────────────────

  bot.command("help", async (ctx) => {
    const toolNames = tools.map((t) => `• ${t.name}`).join("\n");
    await ctx.reply(
      `Obidot Vault Bot — Help\n\n` +
        `Available tools:\n${toolNames}\n\n` +
        `Example prompts:\n` +
        `• "Show vault state"\n` +
        `• "Fetch all yield opportunities"\n` +
        `• "What are the Bifrost liquid staking yields?"\n` +
        `• "Check cross-chain satellite status"\n` +
        `• "Deposit 50 DOT"\n` +
        `• "Withdraw 25 DOT"\n\n` +
        `The bot uses an AI agent to interpret your messages ` +
        `and call the appropriate on-chain tools.`,
    );
  });

  // ── /info Command ──────────────────────────────────────────────────

  bot.command("info", async (ctx) => {
    await ctx.reply(
      `Obidot Agent Info\n\n` +
        `• Vault: ${VAULT_ADDRESS}\n` +
        `• Chain: Polkadot Hub Testnet (420420417)\n` +
        `• Tools: ${String(tools.length)}\n` +
        `• Model: GPT-5-mini\n` +
        `• Mode: EVM (live transactions)`,
    );
  });

  // ── Text Message Handler ───────────────────────────────────────────

  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage.startsWith("/")) return;

    const chatId = ctx.chat.id;
    const userId = ctx.from?.id;
    teleLog.info(
      { chatId, userId, messageLength: userMessage.length },
      "Received user message",
    );

    await ctx.replyWithChatAction("typing");

    try {
      const response = await agent.run(userMessage, userId ?? chatId);

      const chunks = splitMessage(response);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }

      teleLog.info(
        { chatId, responseLength: response.length, chunks: chunks.length },
        "Replied to user",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      teleLog.error({ chatId, error: errorMessage }, "Agent error");
      await ctx.reply(
        "Sorry, something went wrong while processing your request. " +
          "Please try again.",
      );
    }
  });

  // ── Error Handler ──────────────────────────────────────────────────

  bot.catch((err) => {
    teleLog.error({ error: err.message }, "Grammy bot error");
  });

  return bot;
}

/**
 * Starts the Telegram bot with long polling.
 * This is a non-blocking call — the bot runs in the background.
 */
export async function startTelegramBot(
  tools: StructuredToolInterface[],
): Promise<Bot> {
  const bot = await createTelegramBot(tools);

  await bot.start({
    onStart: () => {
      teleLog.info("Telegram bot is running — accepting messages");
    },
  });

  return bot;
}
