import type {
  AgentDecision,
  BifrostYield,
  ChatMessage,
  ChatStreamEvent,
  ChatTradeProposal,
  CrossChainVaultState,
  PendingOrder,
  ProtocolYield,
  StrategyRecord,
  SwapQuoteResult,
  UniswapV2Yield,
  VaultPerformance,
  VaultState,
} from "@/types";
import { API_BASE } from "./constants";

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

// ── Swap Quotes ────────────────────────────────────────────────────────────

interface SwapQuoteResponse {
  bestQuote: SwapQuoteResult | null;
  allQuotes: SwapQuoteResult[];
  timestamp: number;
}

export async function getSwapQuote(params: {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}): Promise<SwapQuoteResponse> {
  const search = new URLSearchParams({
    pool: params.pool,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
  });
  return fetchJson<SwapQuoteResponse>(`/swap/quote?${search.toString()}`);
}

// ── Agent ─────────────────────────────────────────────────────────────────

export async function getAgentLog(): Promise<AgentDecision[]> {
  const decisions = await fetchJson<AgentDecision[]>("/agent/log");
  return [...decisions].sort((a, b) => {
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return b.cycle - a.cycle;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEventPayload(raw: string): unknown {
  if (!raw) return undefined;
  if (raw === "[DONE]") return { type: "done" };
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function eventTypeFromPayload(
  eventName: string | undefined,
  payload: unknown,
): string | undefined {
  if (eventName) return eventName;
  if (isRecord(payload) && typeof payload.type === "string")
    return payload.type;
  if (typeof payload === "string" && payload.length > 0) return "token";
  return undefined;
}

function contentFromPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!isRecord(payload)) return "";
  const value =
    payload.content ?? payload.text ?? payload.delta ?? payload.chunk;
  return typeof value === "string" ? value : "";
}

function normalizeProposal(payload: unknown): ChatTradeProposal | null {
  if (!isRecord(payload)) return null;
  const candidate = isRecord(payload.intent)
    ? payload.intent
    : isRecord(payload.proposal)
      ? payload.proposal
      : payload;
  if (!isRecord(candidate)) return null;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.length > 0
        ? candidate.id
        : crypto.randomUUID(),
    action:
      typeof candidate.action === "string"
        ? candidate.action
        : typeof candidate.type === "string"
          ? candidate.type
          : undefined,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    summary:
      typeof candidate.summary === "string" ? candidate.summary : undefined,
    reasoning:
      typeof candidate.reasoning === "string" ? candidate.reasoning : undefined,
    tokenIn:
      typeof candidate.tokenIn === "string" ? candidate.tokenIn : undefined,
    tokenInSymbol:
      typeof candidate.tokenInSymbol === "string"
        ? candidate.tokenInSymbol
        : undefined,
    tokenOut:
      typeof candidate.tokenOut === "string" ? candidate.tokenOut : undefined,
    tokenOutSymbol:
      typeof candidate.tokenOutSymbol === "string"
        ? candidate.tokenOutSymbol
        : undefined,
    amountIn:
      typeof candidate.amountIn === "string"
        ? candidate.amountIn
        : typeof candidate.amount === "string"
          ? candidate.amount
          : undefined,
    expectedAmountOut:
      typeof candidate.expectedAmountOut === "string"
        ? candidate.expectedAmountOut
        : typeof candidate.amountOut === "string"
          ? candidate.amountOut
          : undefined,
    minAmountOut:
      typeof candidate.minAmountOut === "string"
        ? candidate.minAmountOut
        : typeof candidate.minReturn === "string"
          ? candidate.minReturn
          : undefined,
    maxSlippageBps:
      typeof candidate.maxSlippageBps === "string"
        ? candidate.maxSlippageBps
        : typeof candidate.maxSlippageBps === "number"
          ? String(candidate.maxSlippageBps)
          : undefined,
    deadline:
      typeof candidate.deadline === "string"
        ? candidate.deadline
        : typeof candidate.deadline === "number"
          ? String(candidate.deadline)
          : undefined,
    targetParachain:
      typeof candidate.targetParachain === "string"
        ? candidate.targetParachain
        : typeof candidate.targetParachain === "number"
          ? String(candidate.targetParachain)
          : undefined,
    targetProtocol:
      typeof candidate.targetProtocol === "string"
        ? candidate.targetProtocol
        : undefined,
    route: Array.isArray(candidate.route)
      ? candidate.route.filter(isRecord).map((hop) => ({
          pool: typeof hop.pool === "string" ? hop.pool : undefined,
          poolLabel:
            typeof hop.poolLabel === "string" ? hop.poolLabel : undefined,
          poolType:
            typeof hop.poolType === "string" || typeof hop.poolType === "number"
              ? hop.poolType
              : undefined,
          tokenIn: typeof hop.tokenIn === "string" ? hop.tokenIn : undefined,
          tokenInSymbol:
            typeof hop.tokenInSymbol === "string"
              ? hop.tokenInSymbol
              : undefined,
          tokenOut: typeof hop.tokenOut === "string" ? hop.tokenOut : undefined,
          tokenOutSymbol:
            typeof hop.tokenOutSymbol === "string"
              ? hop.tokenOutSymbol
              : undefined,
          amountIn: typeof hop.amountIn === "string" ? hop.amountIn : undefined,
          amountOut:
            typeof hop.amountOut === "string" ? hop.amountOut : undefined,
          feeBps:
            typeof hop.feeBps === "string" || typeof hop.feeBps === "number"
              ? hop.feeBps
              : undefined,
          priceImpactBps:
            typeof hop.priceImpactBps === "string" ||
            typeof hop.priceImpactBps === "number"
              ? hop.priceImpactBps
              : undefined,
        }))
      : undefined,
    status: typeof candidate.status === "string" ? candidate.status : undefined,
    raw: candidate,
  };
}

function normalizeChatStreamEvent(block: string): ChatStreamEvent | null {
  const lines = block.split(/\r?\n/);
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
      continue;
    }
    dataLines.push(line.trim());
  }

  const payload = parseEventPayload(dataLines.join("\n").trim());
  const type = eventTypeFromPayload(eventName, payload);
  if (!type) return null;

  if (
    type === "token" ||
    type === "text" ||
    type === "chunk" ||
    type === "message"
  ) {
    const content = contentFromPayload(payload);
    return content ? { type: "token", content } : null;
  }

  if (type === "proposal" || type === "trade_proposal") {
    const proposal = normalizeProposal(payload);
    return proposal ? { type: "proposal", proposal } : null;
  }

  if (type === "tool_call") {
    return {
      type: "tool_call",
      tool:
        isRecord(payload) && typeof payload.tool === "string"
          ? payload.tool
          : undefined,
      args:
        isRecord(payload) && isRecord(payload.args) ? payload.args : undefined,
    };
  }

  if (type === "tool_result") {
    return {
      type: "tool_result",
      tool:
        isRecord(payload) && typeof payload.tool === "string"
          ? payload.tool
          : undefined,
      success:
        isRecord(payload) && typeof payload.success === "boolean"
          ? payload.success
          : undefined,
      result: isRecord(payload) ? payload.result : undefined,
    };
  }

  if (type === "done") {
    return { type: "done" };
  }

  return null;
}

async function readErrorResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      return (
        payload.error ?? `API error ${response.status}: ${response.statusText}`
      );
    }
    const text = await response.text();
    return text || `API error ${response.status}: ${response.statusText}`;
  } catch {
    return `API error ${response.status}: ${response.statusText}`;
  }
}

export async function executeChatStream({
  message,
  history,
  walletAddress,
  signal,
  onEvent,
}: {
  message: string;
  history: ChatMessage[];
  walletAddress?: string;
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/execute`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      // Server maintains authoritative per-address history; this field is ignored
      // by /api/chat/execute but kept for forward-compatibility with future endpoints
      // that may accept client-provided context.
      history: history.map((m) => ({ role: m.role, content: m.content })),
      address: walletAddress,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }
  if (!response.body) {
    throw new Error("Chat execute stream was empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const event = normalizeChatStreamEvent(part);
      if (event) onEvent(event);
    }
  }

  buffer += decoder.decode();
  const finalEvent = normalizeChatStreamEvent(buffer.trim());
  if (finalEvent) onEvent(finalEvent);
}

export async function getLimitOrders(address: string): Promise<PendingOrder[]> {
  const data = await fetchJson<{ orders: PendingOrder[] }>(
    `/limit-orders/${address}`,
  );
  return data.orders;
}

export async function createLimitOrder(
  order: PendingOrder,
): Promise<PendingOrder> {
  const data = await fetchJson<{ order: PendingOrder }>("/limit-orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
  return data.order;
}

export async function cancelLimitOrder(
  id: string,
  address?: string,
): Promise<PendingOrder> {
  const query = address ? `?address=${encodeURIComponent(address)}` : "";
  const data = await fetchJson<{ order: PendingOrder }>(
    `/limit-orders/${id}${query}`,
    {
      method: "DELETE",
    },
  );
  return data.order;
}
