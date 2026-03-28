"use client";

import {
  Bot,
  ChevronRight,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { ERC20_APPROVE_ABI, SWAP_ROUTER_ABI } from "@/lib/abi";
import { executeChatStream } from "@/lib/api";
import { CHAIN, CONTRACTS, GAS_LIMITS, ZERO_BYTES32 } from "@/lib/constants";
import {
  cn,
  formatRelativeTime,
  formatTokenAmount,
  truncateAddress,
} from "@/lib/format";
import { TOKENS } from "@/shared/trade/swap";
import {
  type ChatMessage,
  type ChatProposalRouteHop,
  type ChatTradeProposal,
  POOL_TYPE_LABELS,
  resolvePoolType,
} from "@/types";

const EXAMPLE_PROMPTS = [
  "Show me the best tDOT to tUSDC route for 100 tDOT.",
  "Compare current yield opportunities across the supported protocols.",
  "What is the vault doing right now, and why?",
  "Propose a conservative rebalance for idle assets.",
  "Estimate slippage for swapping 50 tETH into tUSDC.",
] as const;

const GUEST_STORAGE_KEY = "guest";
const MAX_STORED_MESSAGES = 20;

interface InteractiveChatProps {
  variant?: "page" | "widget";
  className?: string;
  autoFocus?: boolean;
  onExecuteProposal?: (proposal: ChatTradeProposal) => void | Promise<void>;
}

type ProposalExecutionStep =
  | "idle"
  | "approving"
  | "approve-confirming"
  | "swapping"
  | "swap-confirming"
  | "done";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function trimMessages(messages: ChatMessage[]) {
  return messages.slice(-MAX_STORED_MESSAGES);
}

function coerceProposal(value: unknown): ChatTradeProposal | undefined {
  if (!isRecord(value)) return undefined;

  return {
    id:
      typeof value.id === "string" && value.id.length > 0
        ? value.id
        : crypto.randomUUID(),
    action: typeof value.action === "string" ? value.action : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    reasoning:
      typeof value.reasoning === "string" ? value.reasoning : undefined,
    tokenIn: typeof value.tokenIn === "string" ? value.tokenIn : undefined,
    tokenInSymbol:
      typeof value.tokenInSymbol === "string" ? value.tokenInSymbol : undefined,
    tokenOut: typeof value.tokenOut === "string" ? value.tokenOut : undefined,
    tokenOutSymbol:
      typeof value.tokenOutSymbol === "string"
        ? value.tokenOutSymbol
        : undefined,
    amountIn: typeof value.amountIn === "string" ? value.amountIn : undefined,
    expectedAmountOut:
      typeof value.expectedAmountOut === "string"
        ? value.expectedAmountOut
        : undefined,
    minAmountOut:
      typeof value.minAmountOut === "string" ? value.minAmountOut : undefined,
    maxSlippageBps:
      typeof value.maxSlippageBps === "string"
        ? value.maxSlippageBps
        : undefined,
    deadline: typeof value.deadline === "string" ? value.deadline : undefined,
    targetParachain:
      typeof value.targetParachain === "string"
        ? value.targetParachain
        : undefined,
    targetProtocol:
      typeof value.targetProtocol === "string"
        ? value.targetProtocol
        : undefined,
    route: Array.isArray(value.route)
      ? value.route.filter(isRecord).map((hop) => ({
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
    status: typeof value.status === "string" ? value.status : undefined,
    raw: isRecord(value.raw) ? value.raw : undefined,
  };
}

function parseStoredMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return trimMessages(
      parsed.filter(isRecord).map((message) => ({
        id:
          typeof message.id === "string" && message.id.length > 0
            ? message.id
            : crypto.randomUUID(),
        role: message.role === "user" ? "user" : "assistant",
        content: typeof message.content === "string" ? message.content : "",
        timestamp:
          typeof message.timestamp === "string"
            ? message.timestamp
            : new Date().toISOString(),
        state: message.state === "error" ? "error" : "complete",
        tradeProposal: coerceProposal(message.tradeProposal),
      })),
    );
  } catch {
    return [];
  }
}

function tokenLabel(token?: string, explicitSymbol?: string) {
  if (explicitSymbol) return explicitSymbol;
  if (!token) return undefined;

  const normalized = token.toLowerCase();
  const knownToken = TOKENS.find(
    (candidate) =>
      candidate.address.toLowerCase() === normalized ||
      candidate.symbol.toLowerCase() === normalized,
  );

  if (knownToken) return knownToken.symbol;
  if (token.startsWith("0x")) return truncateAddress(token);
  return token;
}

function formatProposalAmount(value?: string, symbol?: string) {
  if (!value) return "n/a";
  if (/^\d+$/.test(value) && value.length > 15) {
    return `${formatTokenAmount(value, 18, 4)}${symbol ? ` ${symbol}` : ""}`;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${numeric.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    })}${symbol ? ` ${symbol}` : ""}`;
  }

  return `${value}${symbol ? ` ${symbol}` : ""}`;
}

function formatDeadline(deadline?: string) {
  if (!deadline) return "n/a";
  const parsed = Number(deadline);
  if (!Number.isFinite(parsed)) return deadline;
  const timestamp = parsed > 1_000_000_000_000 ? parsed : parsed * 1_000;
  return new Date(timestamp).toLocaleString();
}

function routeLabel(hop: ChatProposalRouteHop) {
  if (hop.poolLabel) return hop.poolLabel;
  if (hop.poolType !== undefined) {
    const resolved = resolvePoolType(hop.poolType);
    if (resolved !== undefined) return POOL_TYPE_LABELS[resolved];
    if (typeof hop.poolType === "string") return hop.poolType;
  }
  return "Route hop";
}

function proposalTitle(proposal: ChatTradeProposal) {
  if (proposal.title) return proposal.title;
  const fromSymbol = tokenLabel(proposal.tokenIn, proposal.tokenInSymbol);
  const toSymbol = tokenLabel(proposal.tokenOut, proposal.tokenOutSymbol);
  if (fromSymbol && toSymbol) return `${fromSymbol} -> ${toSymbol}`;
  return "Trade proposal";
}

function proposalSummary(proposal: ChatTradeProposal) {
  if (proposal.summary) return proposal.summary;
  if (proposal.reasoning) return proposal.reasoning;
  return "Review the route and amounts before wiring approval and execution.";
}

function parseBigIntValue(value?: string): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseDeadlineValue(deadline?: string): bigint {
  if (!deadline) {
    return BigInt(Math.floor(Date.now() / 1000) + 300);
  }

  const parsed = Number(deadline);
  if (!Number.isFinite(parsed)) {
    return BigInt(Math.floor(Date.now() / 1000) + 300);
  }

  return BigInt(
    parsed > 1_000_000_000_000 ? Math.floor(parsed / 1000) : Math.floor(parsed),
  );
}

function buildExecutableProposal(proposal: ChatTradeProposal | null) {
  if (!proposal?.route?.length || !proposal.tokenIn || !proposal.tokenOut) {
    return null;
  }

  const amountIn = parseBigIntValue(proposal.amountIn);
  const minAmountOut = parseBigIntValue(
    proposal.minAmountOut ?? proposal.expectedAmountOut,
  );

  if (amountIn === null || minAmountOut === null) {
    return null;
  }

  const routes = proposal.route
    .map((hop) => {
      if (
        !hop.pool ||
        !hop.tokenIn ||
        !hop.tokenOut ||
        hop.feeBps === undefined
      ) {
        return null;
      }

      const poolType = resolvePoolType(hop.poolType ?? "UniswapV2");
      if (poolType === undefined) return null;

      const feeValue =
        typeof hop.feeBps === "number"
          ? BigInt(hop.feeBps)
          : parseBigIntValue(hop.feeBps);
      if (feeValue === null) return null;

      return {
        poolType,
        pool: hop.pool as Address,
        tokenIn: hop.tokenIn as Address,
        tokenOut: hop.tokenOut as Address,
        feeBps: feeValue,
        data: ZERO_BYTES32,
      };
    })
    .filter((route): route is NonNullable<typeof route> => route !== null);

  if (routes.length !== proposal.route.length || routes.length === 0) {
    return null;
  }

  return {
    tokenIn: proposal.tokenIn as Address,
    tokenOut: proposal.tokenOut as Address,
    amountIn,
    minAmountOut,
    deadline: parseDeadlineValue(proposal.deadline),
    routes,
  };
}

export function InteractiveChat({
  variant = "widget",
  className,
  autoFocus = false,
  onExecuteProposal,
}: InteractiveChatProps) {
  const { address } = useAccount();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] =
    useState<ChatTradeProposal | null>(null);
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [proposalExecutionStep, setProposalExecutionStep] =
    useState<ProposalExecutionStep>("idle");
  const [proposalExecutionError, setProposalExecutionError] = useState<
    string | null
  >(null);
  const [activeApproveTxHash, setActiveApproveTxHash] = useState<
    `0x${string}` | undefined
  >();
  const [activeSwapTxHash, setActiveSwapTxHash] = useState<
    `0x${string}` | undefined
  >();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const routerAddress = CONTRACTS.SWAP_ROUTER as Address;
  const proposalExecution = useMemo(
    () => buildExecutableProposal(selectedProposal),
    [selectedProposal],
  );

  const storageKey = `obidot:chat:${address?.toLowerCase() ?? GUEST_STORAGE_KEY}`;
  const lastMessageId = messages.at(-1)?.id;

  useEffect(() => {
    setMessages(parseStoredMessages(localStorage.getItem(storageKey)));
    setHasLoadedHistory(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hasLoadedHistory) return;
    localStorage.setItem(storageKey, JSON.stringify(trimMessages(messages)));
  }, [hasLoadedHistory, messages, storageKey]);

  useEffect(() => {
    if (!lastMessageId && !loading && !toolStatus) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessageId, loading, toolStatus]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const { data: proposalAllowance, isLoading: isAllowanceLoading } =
    useReadContract({
      address: proposalExecution?.tokenIn,
      abi: ERC20_APPROVE_ABI,
      functionName: "allowance",
      args:
        address && proposalExecution
          ? [address as Address, routerAddress]
          : undefined,
      query: {
        enabled: !!address && !!proposalExecution,
        staleTime: 5_000,
      },
    });

  const {
    data: approveTxHash,
    writeContract: writeApprove,
    isPending: approveWalletPending,
    error: approveError,
  } = useWriteContract();
  const {
    data: swapTxHash,
    writeContract: writeSwap,
    isPending: swapWalletPending,
    error: swapError,
  } = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });
  const { isSuccess: swapConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash,
  });

  useEffect(() => {
    if (approveTxHash) setActiveApproveTxHash(approveTxHash);
  }, [approveTxHash]);

  useEffect(() => {
    if (swapTxHash) setActiveSwapTxHash(swapTxHash);
  }, [swapTxHash]);

  const needsProposalApproval = useMemo(() => {
    if (!proposalExecution) return false;
    // Treat in-flight allowance check as "needs approval" so the label stays
    // stable, but the button will be separately disabled while loading.
    if (isAllowanceLoading || proposalAllowance === undefined) return true;
    return (proposalAllowance as bigint) < proposalExecution.amountIn;
  }, [isAllowanceLoading, proposalAllowance, proposalExecution]);

  const executeProposalSwap = useCallback(() => {
    if (!address || !proposalExecution) return;

    if (proposalExecution.routes.length > 1) {
      writeSwap({
        address: routerAddress,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapMultiHop",
        gas: GAS_LIMITS.SWAP,
        args: [
          proposalExecution.routes,
          proposalExecution.amountIn,
          proposalExecution.minAmountOut,
          address as Address,
          proposalExecution.deadline,
        ],
      });
      return;
    }

    const [route] = proposalExecution.routes;
    if (!route) return;

    writeSwap({
      address: routerAddress,
      abi: SWAP_ROUTER_ABI,
      functionName: "swapFlat",
      gas: GAS_LIMITS.SWAP,
      args: [
        route.poolType,
        route.pool,
        route.tokenIn,
        route.tokenOut,
        route.feeBps,
        ZERO_BYTES32,
        proposalExecution.amountIn,
        proposalExecution.minAmountOut,
        address as Address,
        proposalExecution.deadline,
      ],
    });
  }, [address, proposalExecution, writeSwap]);

  useEffect(() => {
    if (proposalExecutionStep === "approving" && approveWalletPending) {
      setProposalExecutionStep("approve-confirming");
    }
  }, [approveWalletPending, proposalExecutionStep]);

  useEffect(() => {
    if (proposalExecutionStep === "swapping" && swapWalletPending) {
      setProposalExecutionStep("swap-confirming");
    }
  }, [proposalExecutionStep, swapWalletPending]);

  useEffect(() => {
    if (proposalExecutionStep === "approve-confirming" && approveConfirmed) {
      setProposalExecutionStep("swapping");
      executeProposalSwap();
    }
  }, [approveConfirmed, executeProposalSwap, proposalExecutionStep]);

  useEffect(() => {
    if (proposalExecutionStep === "swap-confirming" && swapConfirmed) {
      setProposalExecutionStep("done");
      setProposalExecutionError(null);
    }
  }, [proposalExecutionStep, swapConfirmed]);

  useEffect(() => {
    const nextError = approveError ?? swapError;
    if (!nextError) return;

    setProposalExecutionStep("idle");
    setProposalExecutionError(nextError.message);
  }, [approveError, swapError]);

  const handleExecuteProposal = useCallback(async () => {
    if (!selectedProposal || !proposalExecution) return;

    setProposalExecutionError(null);

    try {
      await onExecuteProposal?.(selectedProposal);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Proposal hook failed";
      setProposalExecutionError(message);
      return;
    }

    if (!address) {
      setProposalExecutionError(
        "Connect your wallet to execute this proposal.",
      );
      return;
    }

    if (needsProposalApproval) {
      setProposalExecutionStep("approving");
      writeApprove({
        address: proposalExecution.tokenIn,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        gas: GAS_LIMITS.APPROVE,
        args: [routerAddress, proposalExecution.amountIn],
      });
      return;
    }

    setProposalExecutionStep("swapping");
    executeProposalSwap();
  }, [
    address,
    executeProposalSwap,
    needsProposalApproval,
    onExecuteProposal,
    proposalExecution,
    selectedProposal,
    writeApprove,
  ]);

  const proposalActionLabel = useMemo(() => {
    if (!address) return "Connect wallet";
    switch (proposalExecutionStep) {
      case "approving":
        return "Approving...";
      case "approve-confirming":
        return "Confirming approval...";
      case "swapping":
        return "Submitting swap...";
      case "swap-confirming":
        return "Confirming swap...";
      case "done":
        return "Swap confirmed";
      default:
        return needsProposalApproval ? "Approve & execute" : "Execute swap";
    }
  }, [address, needsProposalApproval, proposalExecutionStep]);

  const proposalExecutable =
    !!proposalExecution &&
    (selectedProposal?.status === undefined ||
      selectedProposal.status === "live");

  const openProposal = useCallback((proposal: ChatTradeProposal) => {
    setProposalExecutionStep("idle");
    setProposalExecutionError(null);
    setActiveApproveTxHash(undefined);
    setActiveSwapTxHash(undefined);
    setSelectedProposal(proposal);
    setProposalDialogOpen(true);
  }, []);

  async function handleSend(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || loading) return;

    controllerRef.current?.abort();

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      state: "complete",
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      state: "streaming",
    };
    const nextHistory = [...messages, userMessage];
    const controller = new AbortController();

    controllerRef.current = controller;
    setInput("");
    setToolStatus(null);
    setLoading(true);
    setMessages(trimMessages([...nextHistory, assistantMessage]));

    try {
      await executeChatStream({
        message: text,
        history: nextHistory,
        walletAddress: address,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "token") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content: `${message.content}${event.content}`,
                      state: "streaming",
                    }
                  : message,
              ),
            );
            return;
          }

          if (event.type === "tool_call") {
            setToolStatus(
              event.tool ? `Using ${event.tool}...` : "Running agent tools...",
            );
            return;
          }

          if (event.type === "tool_result") {
            setToolStatus(
              event.tool
                ? `${event.tool} ${event.success === false ? "failed" : "completed"}`
                : null,
            );
            return;
          }

          if (event.type === "proposal") {
            const proposal = {
              ...event.proposal,
              id: event.proposal.id || crypto.randomUUID(),
            };
            openProposal(proposal);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content:
                        message.content ||
                        "I prepared a trade proposal for your review.",
                      tradeProposal: proposal,
                      state: "streaming",
                    }
                  : message,
              ),
            );
            return;
          }

          if (event.type === "done") {
            setToolStatus(null);
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content:
                        message.content ||
                        (message.tradeProposal
                          ? "Proposal ready for review."
                          : "Done."),
                      state: "complete",
                    }
                  : message,
              ),
            );
          }
        },
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;

      setToolStatus(null);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content:
                  message.content ||
                  "Sorry, I could not complete that request. Please try again.",
                state: "error",
              }
            : message,
        ),
      );
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      setToolStatus(null);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id && message.state === "streaming"
            ? {
                ...message,
                content:
                  message.content ||
                  (message.tradeProposal
                    ? "Proposal ready for review."
                    : "Done."),
                state: "complete",
              }
            : message,
        ),
      );
      setLoading(false);
    }
  }

  const historyLabel = address ? truncateAddress(address) : "guest";

  const chatBody = (
    <>
      <div
        className={cn(
          "flex-1 overflow-y-auto p-4",
          variant === "page" ? "space-y-4" : "space-y-3",
        )}
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-4 font-mono text-sm text-text-primary">
                Interactive chat is live. Ask for market context, execution
                plans, or a swap proposal.
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Streaming responses and proposals are saved per wallet.
              </p>
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-2",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {message.role === "assistant" ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-md bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            ) : null}

            <div
              className={cn(
                "rounded-lg px-3 py-2",
                variant === "page" ? "max-w-[88%]" : "max-w-[82%]",
                message.role === "user"
                  ? "bg-secondary/15 text-text-primary"
                  : "border border-border-subtle bg-background text-text-primary",
              )}
            >
              <p className="whitespace-pre-wrap font-mono text-sm leading-6">
                {message.content}
                {message.state === "streaming" &&
                message.content.length === 0 ? (
                  <span className="inline-flex items-center gap-2 text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </span>
                ) : null}
              </p>

              {message.tradeProposal ? (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                        Trade proposal
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {proposalTitle(message.tradeProposal)}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {proposalSummary(message.tradeProposal)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (message.tradeProposal) {
                          openProposal(message.tradeProposal);
                        }
                      }}
                      className="btn-ghost min-h-0 px-2 py-1 text-xs"
                    >
                      Review
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 font-mono text-xs text-text-secondary sm:grid-cols-2">
                    <div className="rounded-md border border-border-subtle bg-background/70 px-2 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                        Input
                      </p>
                      <p className="mt-1 text-text-primary">
                        {formatProposalAmount(
                          message.tradeProposal.amountIn,
                          tokenLabel(
                            message.tradeProposal.tokenIn,
                            message.tradeProposal.tokenInSymbol,
                          ),
                        )}
                      </p>
                    </div>
                    <div className="rounded-md border border-border-subtle bg-background/70 px-2 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                        Min output
                      </p>
                      <p className="mt-1 text-text-primary">
                        {formatProposalAmount(
                          message.tradeProposal.minAmountOut,
                          tokenLabel(
                            message.tradeProposal.tokenOut,
                            message.tradeProposal.tokenOutSymbol,
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 text-[11px] text-text-muted">
                {formatRelativeTime(message.timestamp)}
              </div>
            </div>

            {message.role === "user" ? (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-md bg-secondary/10">
                <User className="h-3.5 w-3.5 text-secondary" />
              </div>
            ) : null}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void handleSend(prompt)}
              disabled={loading}
              className="rounded-full border border-border-subtle bg-background px-3 py-1.5 text-left font-mono text-[11px] text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={variant === "page" ? 3 : 2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask Obidot to analyze, explain, or propose a trade..."
            className="input-trading min-h-[72px] flex-1 resize-none py-2 text-sm"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || loading}
            className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-background transition-colors hover:bg-primary/90 disabled:bg-surface-hover disabled:text-text-muted"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] text-text-muted">
            <Wallet className="h-3.5 w-3.5" />
            History: {historyLabel}
          </div>
          {toolStatus ? (
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              {toolStatus}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-col",
          variant === "page" && "panel overflow-hidden",
          className,
        )}
      >
        {variant === "page" ? (
          <div className="panel-header">
            <div className="panel-header-block">
              <div className="panel-header-icon bg-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="panel-heading">
                <p className="panel-kicker">Interactive Chat</p>
                <h2 className="panel-title">Execute Flow</h2>
                <p className="panel-subtitle">
                  Stream agent reasoning, capture proposals, and keep the last
                  20 messages per wallet.
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-border-subtle bg-background px-3 py-1 font-mono text-[11px] text-text-muted sm:inline-flex">
              <Wallet className="h-3.5 w-3.5" />
              {historyLabel}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            variant === "page" && "h-[min(70vh,820px)]",
          )}
        >
          {chatBody}
        </div>
      </div>

      <ResponsiveModal
        open={proposalDialogOpen}
        onOpenChange={setProposalDialogOpen}
        title="Trade Proposal"
      >
        {selectedProposal ? (
          <div className="space-y-4 p-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                Pending review
              </p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {proposalTitle(selectedProposal)}
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                {proposalSummary(selectedProposal)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Amount in
                </p>
                <p className="mt-1 text-text-primary">
                  {formatProposalAmount(
                    selectedProposal.amountIn,
                    tokenLabel(
                      selectedProposal.tokenIn,
                      selectedProposal.tokenInSymbol,
                    ),
                  )}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Expected out
                </p>
                <p className="mt-1 text-text-primary">
                  {formatProposalAmount(
                    selectedProposal.expectedAmountOut ??
                      selectedProposal.minAmountOut,
                    tokenLabel(
                      selectedProposal.tokenOut,
                      selectedProposal.tokenOutSymbol,
                    ),
                  )}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Slippage cap
                </p>
                <p className="mt-1 text-text-primary">
                  {selectedProposal.maxSlippageBps
                    ? `${selectedProposal.maxSlippageBps} bps`
                    : "n/a"}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Deadline
                </p>
                <p className="mt-1 text-text-primary">
                  {formatDeadline(selectedProposal.deadline)}
                </p>
              </div>
            </div>

            {selectedProposal.route?.length ? (
              <div className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Route
                </p>
                <div className="space-y-2">
                  {selectedProposal.route.map((hop, index) => (
                    <div
                      key={`${selectedProposal.id}-${index}`}
                      className="rounded-md border border-border-subtle bg-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2 font-mono text-xs text-text-primary">
                        <span>
                          {tokenLabel(hop.tokenIn, hop.tokenInSymbol) ??
                            "Input"}
                        </span>
                        <ChevronRight className="h-3 w-3 text-text-muted" />
                        <span>
                          {tokenLabel(hop.tokenOut, hop.tokenOutSymbol) ??
                            "Output"}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-text-muted">
                        {routeLabel(hop)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setProposalDialogOpen(false)}
                className="btn-ghost min-h-0 px-3 py-2 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteProposal()}
                disabled={
                  !proposalExecutable ||
                  isAllowanceLoading ||
                  proposalExecutionStep === "approving" ||
                  proposalExecutionStep === "approve-confirming" ||
                  proposalExecutionStep === "swapping" ||
                  proposalExecutionStep === "swap-confirming" ||
                  proposalExecutionStep === "done"
                }
                className="inline-flex min-h-0 items-center gap-2 rounded-md bg-primary px-3 py-2 font-mono text-xs text-background transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-text-muted"
              >
                {(proposalExecutionStep === "approving" ||
                  proposalExecutionStep === "approve-confirming" ||
                  proposalExecutionStep === "swapping" ||
                  proposalExecutionStep === "swap-confirming") && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {proposalActionLabel}
              </button>
            </div>
            {!proposalExecutable ? (
              <p className="text-xs text-text-muted">
                This proposal is not executable yet. Only live local swap routes
                with complete route data can be sent to the router from chat.
              </p>
            ) : null}
            {proposalExecutionError ? (
              <p className="text-xs text-danger">
                {proposalExecutionError.slice(0, 180)}
              </p>
            ) : null}
            {activeApproveTxHash || activeSwapTxHash ? (
              <div className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3">
                {activeApproveTxHash ? (
                  <a
                    href={`${CHAIN.blockExplorer}/tx/${activeApproveTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-xs text-primary hover:text-primary/80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Approval tx
                  </a>
                ) : null}
                {activeSwapTxHash ? (
                  <a
                    href={`${CHAIN.blockExplorer}/tx/${activeSwapTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-mono text-xs text-primary hover:text-primary/80"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Swap tx
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </ResponsiveModal>
    </>
  );
}
