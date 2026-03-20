import { API_BASE } from "./constants";
import type {
  VaultState,
  VaultPerformance,
  ProtocolYield,
  BifrostYield,
  UniswapV2Yield,
  CrossChainVaultState,
  StrategyRecord,
  AgentDecision,
  ChatMessage,
} from "@/types";

// ── Generic Fetch Wrapper ─────────────────────────────────────────────────

/** All agent API routes return { success: boolean; data?: T; error?: string } */
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  const envelope = (await res.json()) as ApiEnvelope<T>;
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Unknown API error");
  }
  return envelope.data as T;
}

// ── Vault ─────────────────────────────────────────────────────────────────

export async function getVaultState(): Promise<VaultState> {
  return fetchJson<VaultState>("/vault/state");
}

export async function getVaultPerformance(): Promise<VaultPerformance> {
  return fetchJson<VaultPerformance>("/vault/performance");
}

// ── Yields ────────────────────────────────────────────────────────────────

export async function getYields(): Promise<ProtocolYield[]> {
  return fetchJson<ProtocolYield[]>("/yields");
}

export async function getBifrostYields(): Promise<BifrostYield[]> {
  return fetchJson<BifrostYield[]>("/yields/bifrost");
}

export async function getUniswapV2Yields(): Promise<UniswapV2Yield[]> {
  return fetchJson<UniswapV2Yield[]>("/yields/uniswap");
}

// ── Cross-Chain ───────────────────────────────────────────────────────────

export async function getCrossChainState(): Promise<CrossChainVaultState> {
  return fetchJson<CrossChainVaultState>("/crosschain/state");
}

// ── Strategies ────────────────────────────────────────────────────────────

export async function getStrategies(): Promise<StrategyRecord[]> {
  return fetchJson<StrategyRecord[]>("/strategies");
}

// ── Agent ─────────────────────────────────────────────────────────────────

export async function getAgentLog(): Promise<AgentDecision[]> {
  return fetchJson<AgentDecision[]>("/agent/log");
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<ChatMessage> {
  const data = await fetchJson<{ response: string }>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: data.response,
    timestamp: new Date().toISOString(),
  };
}
