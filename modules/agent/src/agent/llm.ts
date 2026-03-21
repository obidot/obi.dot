// ── LLM Factory ──────────────────────────────────────────
// Creates a LangChain chat model from environment configuration.
// Supports OpenAI, Anthropic, and OpenRouter via LLM_PROVIDER env var.

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { env } from "../config/env.js";
import { loopLog } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Default model names per provider
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
  openrouter: "anthropic/claude-sonnet-4",
};

// ─────────────────────────────────────────────────────────────────────────────
//  Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a LangChain `BaseChatModel` from environment configuration.
 * Supports three providers:
 *   - `openai`      — requires OPENAI_API_KEY
 *   - `anthropic`   — requires ANTHROPIC_API_KEY
 *   - `openrouter`  — uses OPENAI_API_KEY, points at OpenRouter base URL
 */
export async function createLlm(): Promise<BaseChatModel> {
  const provider = env.LLM_PROVIDER ?? "openai";
  const model = env.LLM_MODEL ?? DEFAULTS[provider] ?? "gpt-5-mini";

  loopLog.info({ provider, model }, "Initialising LLM");

  switch (provider) {
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY");
      }
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model,
        temperature: 1,
        apiKey: env.OPENAI_API_KEY,
      });
    }

    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
      }
      const { ChatAnthropic } = await import("@langchain/anthropic");
      return new ChatAnthropic({
        model,
        temperature: 1,
        apiKey: env.ANTHROPIC_API_KEY,
      });
    }

    case "openrouter": {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "LLM_PROVIDER=openrouter requires OPENAI_API_KEY (used as OpenRouter key)",
        );
      }
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model,
        temperature: 1,
        apiKey,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": "https://obidot.com",
            "X-Title": "Obidot AI Agent",
          },
        },
      });
    }

    default:
      throw new Error(`Unknown LLM_PROVIDER: ${String(provider)}`);
  }
}
