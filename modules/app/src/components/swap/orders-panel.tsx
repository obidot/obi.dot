"use client";

import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useWebSocket } from "@/hooks/use-websocket";
import { ERC20_APPROVE_ABI, SWAP_ROUTER_ABI } from "@/lib/abi";
import { cancelLimitOrder, getLimitOrders } from "@/lib/api";
import { CHAIN, CONTRACTS, GAS_LIMITS, ZERO_BYTES32 } from "@/lib/constants";
import { cn, formatTokenAmount } from "@/lib/format";
import { TOKENS } from "@/shared/trade/swap";
import type { PendingOrder, WsEvent } from "@/types";
import { POOL_TYPE_LABELS, resolvePoolType } from "@/types";

function formatExpiry(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function priceDelta(target: string, market: string): number {
  const t = Number(target);
  const m = Number(market);
  if (!m || !t) return 0;
  return ((t - m) / m) * 100;
}

type ProposalExecutionStep =
  | "idle"
  | "approving"
  | "approve-confirming"
  | "swapping"
  | "swap-confirming"
  | "done";

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
  if (token.startsWith("0x")) return `${token.slice(0, 6)}…${token.slice(-4)}`;
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

function routeLabel(poolType?: string) {
  if (!poolType) return "Route hop";
  const resolved = resolvePoolType(poolType);
  if (resolved !== undefined) return POOL_TYPE_LABELS[resolved];
  return poolType;
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

function buildExecutableRoute(order: PendingOrder | null) {
  const route = order?.proposedRoute;
  if (!route?.hops.length || !route.tokenIn || !route.tokenOut) {
    return null;
  }

  const amountIn = parseBigIntValue(route.amountIn);
  const minAmountOut = parseBigIntValue(route.minAmountOut ?? route.amountOut);
  if (amountIn === null || minAmountOut === null) return null;

  const routes = route.hops
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
    .filter((hop): hop is NonNullable<typeof hop> => hop !== null);

  if (routes.length !== route.hops.length || routes.length === 0) return null;

  return {
    tokenIn: route.tokenIn as Address,
    tokenOut: route.tokenOut as Address,
    amountIn,
    minAmountOut,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
    routes,
  };
}

function FilledRow({ order }: { order: PendingOrder }) {
  return (
    <div className="border border-border bg-surface p-3 flex items-start justify-between gap-2 opacity-80">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[13px] text-text-primary font-semibold">
            {order.amountIn} {order.tokenInSymbol} → {order.tokenOutSymbol}
          </span>
          <span className="font-mono text-[11px] text-bull border border-bull/30 px-1 py-0.5 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            FILLED
          </span>
        </div>
        <p className="text-[12px] text-text-muted font-mono">
          At: {Number(order.targetPrice).toFixed(6)} {order.tokenOutSymbol} /{" "}
          {order.tokenInSymbol}
        </p>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  onCancel,
  onReview,
}: {
  order: PendingOrder;
  onCancel: (id: string) => void;
  onReview: (order: PendingOrder) => void;
}) {
  const delta = priceDelta(order.targetPrice, order.marketPriceAtOrder);
  const showDelta = Math.abs(delta) >= 0.01;

  return (
    <div className="border border-border bg-surface p-3 flex items-start justify-between gap-2">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[13px] text-text-primary font-semibold">
            {order.amountIn} {order.tokenInSymbol} → {order.tokenOutSymbol}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] border px-1 py-0.5",
              order.status === "triggered"
                ? "border-warning/30 text-warning"
                : order.status === "expired"
                  ? "border-border text-text-muted"
                  : order.status === "cancelled"
                    ? "border-destructive/30 text-danger"
                    : "border-primary/20 text-primary",
            )}
          >
            {(order.status ?? "pending").toUpperCase()}
          </span>
        </div>

        <p className="text-[12px] text-text-muted font-mono">
          At: {Number(order.targetPrice).toFixed(6)} {order.tokenOutSymbol} /{" "}
          {order.tokenInSymbol}
          {showDelta && (
            <span
              className={cn("ml-2", delta > 0 ? "text-bull" : "text-danger")}
            >
              ({delta > 0 ? "+" : ""}
              {delta.toFixed(1)}% vs placed)
            </span>
          )}
        </p>

        {order.status === "triggered" && order.currentPrice && (
          <p className="text-[12px] text-warning font-mono">
            Triggered at {Number(order.currentPrice).toFixed(6)}{" "}
            {order.tokenOutSymbol} / {order.tokenInSymbol}
          </p>
        )}

        <div className="flex items-center gap-1 text-[11px] text-text-muted">
          <Clock3 className="h-3 w-3" />
          <span>Expires in {formatExpiry(order.expiry)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {order.status === "triggered" && order.proposedRoute ? (
          <button
            type="button"
            onClick={() => onReview(order)}
            className="btn-ghost min-h-0 px-2 py-1 text-[11px]"
          >
            Review
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onCancel(order.id)}
          className="text-text-muted hover:text-danger transition-colors shrink-0 p-1"
          aria-label="Cancel order"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function OrdersPanel() {
  const { address, isConnected } = useAccount();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);
  const [selectedTriggeredOrder, setSelectedTriggeredOrder] =
    useState<PendingOrder | null>(null);
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
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
  const routerAddress = CONTRACTS.SWAP_ROUTER as Address;
  const executableRoute = useMemo(
    () => buildExecutableRoute(selectedTriggeredOrder),
    [selectedTriggeredOrder],
  );

  const reload = useCallback(() => {
    if (!address) {
      setOrders([]);
      return;
    }

    setLoading(true);
    setErrorText(null);

    void getLimitOrders(address)
      .then((next) => setOrders(next))
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to load orders";
        setErrorText(message);
      })
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    reload();
    window.addEventListener("obidot:order-created", reload as EventListener);
    return () =>
      window.removeEventListener(
        "obidot:order-created",
        reload as EventListener,
      );
  }, [reload]);

  const handleCancel = useCallback(
    (id: string) => {
      if (!address) return;

      void cancelLimitOrder(id, address)
        .then(() => reload())
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Failed to cancel order";
          setErrorText(message);
        });
    },
    [address, reload],
  );

  const openTriggeredOrder = useCallback((order: PendingOrder) => {
    setSelectedTriggeredOrder(order);
    setProposalDialogOpen(true);
    setProposalExecutionStep("idle");
    setProposalExecutionError(null);
    setActiveApproveTxHash(undefined);
    setActiveSwapTxHash(undefined);
  }, []);

  const { data: proposalAllowance, isLoading: isAllowanceLoading } =
    useReadContract({
      address: executableRoute?.tokenIn,
      abi: ERC20_APPROVE_ABI,
      functionName: "allowance",
      args:
        address && executableRoute
          ? [address as Address, routerAddress]
          : undefined,
      query: {
        enabled: !!address && !!executableRoute,
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
    if (!executableRoute) return false;
    if (isAllowanceLoading || proposalAllowance === undefined) return true;
    return (proposalAllowance as bigint) < executableRoute.amountIn;
  }, [executableRoute, isAllowanceLoading, proposalAllowance]);

  const executeProposalSwap = useCallback(() => {
    if (!address || !executableRoute) return;

    if (executableRoute.routes.length > 1) {
      writeSwap({
        address: routerAddress,
        abi: SWAP_ROUTER_ABI,
        functionName: "swapMultiHop",
        gas: GAS_LIMITS.SWAP,
        args: [
          executableRoute.routes,
          executableRoute.amountIn,
          executableRoute.minAmountOut,
          address as Address,
          executableRoute.deadline,
        ],
      });
      return;
    }

    const [route] = executableRoute.routes;
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
        executableRoute.amountIn,
        executableRoute.minAmountOut,
        address as Address,
        executableRoute.deadline,
      ],
    });
  }, [address, executableRoute, writeSwap]);

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

  const handleExecuteTriggeredOrder = useCallback(() => {
    if (!selectedTriggeredOrder || !executableRoute) return;

    setProposalExecutionError(null);

    if (!address) {
      setProposalExecutionError(
        "Connect your wallet to execute this proposal.",
      );
      return;
    }

    if (needsProposalApproval) {
      setProposalExecutionStep("approving");
      writeApprove({
        address: executableRoute.tokenIn,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        gas: GAS_LIMITS.APPROVE,
        args: [routerAddress, executableRoute.amountIn],
      });
      return;
    }

    setProposalExecutionStep("swapping");
    executeProposalSwap();
  }, [
    address,
    executableRoute,
    executeProposalSwap,
    needsProposalApproval,
    selectedTriggeredOrder,
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

  const { connected } = useWebSocket(
    useCallback(
      (event: WsEvent) => {
        if (
          event.type !== "limit_order:triggered" ||
          !address ||
          event.data.ownerAddress.toLowerCase() !== address.toLowerCase()
        ) {
          return;
        }

        setTriggerNotice(
          `${event.data.tokenInSymbol} → ${event.data.tokenOutSymbol} hit ${event.data.currentPrice}. Approval is still required.`,
        );
        let triggeredOrder: PendingOrder | null = null;
        setOrders((prev) =>
          prev.map((order) => {
            if (order.id !== event.data.orderId) return order;

            triggeredOrder = {
              ...order,
              status: "triggered",
              triggeredAt: event.data.timestamp,
              currentPrice: event.data.currentPrice,
              proposedRoute: event.data.proposedRoute,
            };
            return triggeredOrder;
          }),
        );
        if (triggeredOrder) {
          openTriggeredOrder(triggeredOrder);
        }
      },
      [address, openTriggeredOrder],
    ),
  );

  const filledOrders = orders.filter((o) => o.status === "filled");
  const activeOrders = orders.filter(
    (o) => (o.status ?? "pending") === "pending" || o.status === "triggered",
  );
  const expiredOrders = orders.filter((o) => o.status === "expired");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  if (!isConnected || !address) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-[14px] font-semibold text-text-secondary">
            Connect your wallet to view monitored orders
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            Limit orders are keyed by wallet address on the agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-text-muted" />
          <span className="text-[15px] font-semibold text-text-primary">
            Open Positions
          </span>
          {activeOrders.length > 0 && (
            <span className="font-mono text-[11px] bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5">
              {activeOrders.length}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono text-[11px] px-1.5 py-0.5 border",
            connected
              ? "border-primary/30 text-primary"
              : "border-border text-text-muted",
          )}
        >
          {connected ? "WS LIVE" : "WS OFFLINE"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px] font-mono">
              Loading monitored orders…
            </span>
          </div>
        )}

        {errorText && (
          <div className="border border-danger/30 bg-destructive/10 p-3 text-[12px] text-danger">
            {errorText}
          </div>
        )}

        {triggerNotice && (
          <div className="border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning">
            {triggerNotice}
          </div>
        )}

        {orders.length === 0 && filledOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-full py-16 text-center">
            <div className="h-12 w-12 border border-border bg-surface-hover flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-text-muted" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-text-secondary">
                No open orders
              </p>
              <p className="text-[12px] text-text-muted mt-1 max-w-[200px]">
                Place a limit order to get started
              </p>
            </div>
          </div>
        )}

        {filledOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-bull uppercase tracking-wider">
              Filled ({filledOrders.length})
            </p>
            {filledOrders.map((o) => (
              <FilledRow key={o.id} order={o} />
            ))}
          </div>
        )}

        {activeOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-muted uppercase tracking-wider">
              Active ({activeOrders.length})
            </p>
            {activeOrders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                onCancel={handleCancel}
                onReview={openTriggeredOrder}
              />
            ))}
          </div>
        )}

        {expiredOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-muted uppercase tracking-wider">
              Expired ({expiredOrders.length})
            </p>
            {expiredOrders.map((o) => (
              <div key={o.id} className="opacity-50">
                <OrderRow
                  order={o}
                  onCancel={handleCancel}
                  onReview={openTriggeredOrder}
                />
              </div>
            ))}
          </div>
        )}

        {cancelledOrders.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-text-muted uppercase tracking-wider">
              Cancelled ({cancelledOrders.length})
            </p>
            {cancelledOrders.map((o) => (
              <div key={o.id} className="opacity-50">
                <OrderRow
                  order={o}
                  onCancel={handleCancel}
                  onReview={openTriggeredOrder}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 py-3 border-t border-border">
        <p className="text-[11px] text-text-muted text-center">
          Orders monitored by Obidot Agent · trigger events still require user
          approval
        </p>
      </div>

      <ResponsiveModal
        open={proposalDialogOpen}
        onOpenChange={setProposalDialogOpen}
        title="Triggered Limit Order"
      >
        {selectedTriggeredOrder ? (
          <div className="space-y-4 p-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-warning">
                Approval required
              </p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {selectedTriggeredOrder.tokenInSymbol} →{" "}
                {selectedTriggeredOrder.tokenOutSymbol}
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                Your target price was reached. Review the routed execution and
                approve it to fill this limit order.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Amount in
                </p>
                <p className="mt-1 text-text-primary">
                  {formatProposalAmount(
                    selectedTriggeredOrder.proposedRoute?.amountIn ??
                      selectedTriggeredOrder.amountIn,
                    selectedTriggeredOrder.tokenInSymbol,
                  )}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Expected out
                </p>
                <p className="mt-1 text-text-primary">
                  {formatProposalAmount(
                    selectedTriggeredOrder.proposedRoute?.amountOut,
                    selectedTriggeredOrder.tokenOutSymbol,
                  )}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Target price
                </p>
                <p className="mt-1 text-text-primary">
                  {Number(selectedTriggeredOrder.targetPrice).toFixed(6)}{" "}
                  {selectedTriggeredOrder.tokenOutSymbol} /{" "}
                  {selectedTriggeredOrder.tokenInSymbol}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Trigger price
                </p>
                <p className="mt-1 text-text-primary">
                  {selectedTriggeredOrder.currentPrice
                    ? Number(selectedTriggeredOrder.currentPrice).toFixed(6)
                    : "n/a"}{" "}
                  {selectedTriggeredOrder.tokenOutSymbol} /{" "}
                  {selectedTriggeredOrder.tokenInSymbol}
                </p>
              </div>
            </div>

            {selectedTriggeredOrder.proposedRoute?.hops.length ? (
              <div className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Route
                </p>
                <div className="space-y-2">
                  {selectedTriggeredOrder.proposedRoute.hops.map(
                    (hop, index) => (
                      <div
                        key={`${selectedTriggeredOrder.id}-${index}`}
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
                          {routeLabel(hop.poolType)}
                        </div>
                      </div>
                    ),
                  )}
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
                onClick={() => handleExecuteTriggeredOrder()}
                disabled={
                  !selectedTriggeredOrder.proposedRoute ||
                  selectedTriggeredOrder.proposedRoute.status !== "live" ||
                  !executableRoute ||
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
            {selectedTriggeredOrder.proposedRoute?.status !== "live" ? (
              <p className="text-xs text-text-muted">
                This triggered order is not executable yet. Only live local
                routes can be sent to the router from the limit-order panel.
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
    </div>
  );
}
