"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  Clock,
  ExternalLink,
  Link2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useRouteFinder } from "@/hooks/use-swap";
import { ERC20_APPROVE_ABI, SWAP_ROUTER_ABI } from "@/lib/abi";
import { CONTRACTS, GAS_LIMITS, ZERO_BYTES32 } from "@/lib/constants";
import { cn, formatTokenAmount } from "@/lib/format";
import { TOKENS } from "@/shared/trade/swap";
import { PoolType, type SwapRouteResult } from "@/types";
import TokenPicker from "./token-picker";

interface XCMChain {
  id: string;
  name: string;
  paraId: number | null;
  type: "xcm" | "bridge";
  icon: string;
  estTime: string;
}

const XCM_CHAINS: XCMChain[] = [
  {
    id: "relay",
    name: "Relay Teleport",
    paraId: null,
    type: "xcm",
    icon: "RL",
    estTime: "~12s",
  },
  {
    id: "hydration",
    name: "Hydration",
    paraId: 2034,
    type: "xcm",
    icon: "HY",
    estTime: "~30s",
  },
  {
    id: "bifrost",
    name: "Bifrost",
    paraId: 2030,
    type: "xcm",
    icon: "BI",
    estTime: "~30s",
  },
  {
    id: "karura",
    name: "Karura",
    paraId: 2000,
    type: "xcm",
    icon: "KA",
    estTime: "~30s",
  },
  {
    id: "interlay",
    name: "Interlay",
    paraId: 2032,
    type: "xcm",
    icon: "IN",
    estTime: "~30s",
  },
  {
    id: "moonbeam",
    name: "Moonbeam",
    paraId: 2004,
    type: "xcm",
    icon: "MO",
    estTime: "~30s",
  },
  {
    id: "assethub",
    name: "AssetHub",
    paraId: 1000,
    type: "xcm",
    icon: "AH",
    estTime: "~12s",
  },
  {
    id: "snowbridge",
    name: "Snowbridge (Ethereum)",
    paraId: null,
    type: "bridge",
    icon: "SN",
    estTime: "~20min",
  },
  {
    id: "chainflip",
    name: "ChainFlip (ETH)",
    paraId: null,
    type: "bridge",
    icon: "CF",
    estTime: "~3min",
  },
];

function matchRouteToChain(route: SwapRouteResult, chainId: string): boolean {
  const label = route.id.toLowerCase();
  const map: Record<string, string[]> = {
    hydration: ["hydration"],
    bifrost: ["bifrost"],
    assethub: ["assethub", "asset hub"],
    relay: ["relay", "teleport"],
    karura: ["karura"],
    moonbeam: ["moonbeam"],
    interlay: ["interlay"],
    snowbridge: ["snowbridge"],
    chainflip: ["chainflip"],
  };
  return (map[chainId] ?? []).some((keyword) => label.includes(keyword));
}

function StatusPill({ status }: { status: SwapRouteResult["status"] }) {
  const classes: Record<SwapRouteResult["status"], string> = {
    live: "bg-accent text-accent-foreground",
    mainnet_only: "bg-primary text-primary-foreground",
    coming_soon: "bg-surface-alt text-text-secondary",
    no_liquidity: "bg-destructive text-white",
  };

  const labels: Record<SwapRouteResult["status"], string> = {
    live: "Live",
    mainnet_only: "Mainnet Only",
    coming_soon: "Coming Soon",
    no_liquidity: "No Liquidity",
  };

  return <span className={cn("pill", classes[status])}>{labels[status]}</span>;
}

interface ChainSelectorProps {
  selected: XCMChain;
  options: XCMChain[];
  onSelect: (chain: XCMChain) => void;
}

function ChainSelector({ selected, options, onSelect }: ChainSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 border-[3px] border-border bg-surface px-4 py-3 shadow-[3px_3px_0_0_var(--border)] transition hover:bg-surface-hover"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border-[2px] border-border bg-secondary/25 font-mono text-[13px] font-bold text-text-primary">
          {selected.icon}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="retro-label text-[0.95rem] text-text-primary">
            {selected.name}
          </p>
          <p className="text-[12px] text-text-muted">
            {selected.paraId
              ? `Parachain ${selected.paraId}`
              : "Relay or external bridge route"}
          </p>
        </div>
        <span
          className={cn(
            "pill",
            selected.type === "xcm"
              ? "bg-accent text-accent-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {selected.type}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Destination chain"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto border-[3px] border-border bg-popover shadow-[6px_6px_0_0_var(--border)]"
        >
          {options.map((chain) => (
            <button
              key={chain.id}
              type="button"
              role="option"
              aria-selected={chain.id === selected.id}
              onClick={() => {
                onSelect(chain);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left transition last:border-b-0",
                chain.id === selected.id
                  ? "bg-primary/15"
                  : "bg-popover hover:bg-surface-hover",
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border-[2px] border-border bg-secondary/20 font-mono text-[12px] font-bold text-text-primary">
                {chain.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px] font-semibold text-text-primary">
                  {chain.name}
                </p>
                <p className="text-[12px] text-text-muted">
                  {chain.paraId
                    ? `Parachain ${chain.paraId}`
                    : "Relay or external route"}
                </p>
              </div>
              <span
                className={cn(
                  "pill",
                  chain.type === "xcm"
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {chain.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CrossChainSwapPanel() {
  const [tokenInIdx, setTokenInIdx] = useState(0);
  const [tokenOutIdx, setTokenOutIdx] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [selectedChain, setSelectedChain] = useState<XCMChain>(XCM_CHAINS[0]);
  const [xcmStep, setXcmStep] = useState<
    "idle" | "approving" | "swapping" | "done"
  >("idle");

  const amountInputId = useId();
  const inputStateKeyRef = useRef("");
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: approveWalletPending,
  } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  const {
    writeContract: writeSwap,
    data: swapTxHash,
    isPending: swapWalletPending,
  } = useWriteContract();
  const { isSuccess: swapConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash,
  });

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];
  const isRelayTeleport = selectedChain.id === "relay";
  const isRelayTokenSupported =
    tokenIn.address.toLowerCase() === CONTRACTS.TEST_DOT.toLowerCase();

  const { data: allowance } = useReadContract({
    address: tokenIn.address as Address,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: address
      ? [address as Address, CONTRACTS.SWAP_ROUTER as Address]
      : undefined,
    query: { enabled: !!address },
  });

  const parsedAmountIn = useMemo(() => {
    if (!amountIn || Number.isNaN(Number(amountIn)) || Number(amountIn) <= 0) {
      return "";
    }

    try {
      return parseUnits(amountIn, tokenIn.decimals).toString();
    } catch {
      return "";
    }
  }, [amountIn, tokenIn.decimals]);

  const needsApproval =
    !allowance || (parsedAmountIn ? allowance < BigInt(parsedAmountIn) : false);

  const { routes, isLoading } = useRouteFinder({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: parsedAmountIn,
  });

  const xcmRoutes = routes.filter((route) => route.routeType !== "local");
  const activeRoute = xcmRoutes.find((route) =>
    matchRouteToChain(route, selectedChain.id),
  );

  const relayReceiveAmount = useMemo(() => {
    if (!isRelayTeleport || !parsedAmountIn) return null;

    try {
      const rawAmount = BigInt(parsedAmountIn);
      const fee = rawAmount / BigInt(1000);
      return (rawAmount - fee).toString();
    } catch {
      return null;
    }
  }, [isRelayTeleport, parsedAmountIn]);

  const displayedReceiveAmount = isRelayTeleport
    ? relayReceiveAmount
      ? formatTokenAmount(relayReceiveAmount, tokenIn.decimals, 6)
      : "—"
    : activeRoute?.amountOut && activeRoute.amountOut !== "0"
      ? formatTokenAmount(activeRoute.amountOut, tokenOut.decimals, 6)
      : isLoading
        ? "…"
        : "—";

  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmountIn(raw);
  };

  const handleFlip = () => {
    setTokenInIdx(tokenOutIdx);
    setTokenOutIdx(tokenInIdx);
    setAmountIn("");
  };

  const executeXcmSwap = useCallback(() => {
    if (!parsedAmountIn || !address) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    setXcmStep("swapping");
    writeSwap({
      address: CONTRACTS.SWAP_ROUTER as Address,
      abi: SWAP_ROUTER_ABI,
      functionName: "swapFlat",
      gas: GAS_LIMITS.SWAP,
      args: [
        PoolType.RelayTeleport,
        CONTRACTS.XCM_EXECUTOR as Address,
        tokenIn.address as Address,
        "0x0000000000000000000000000000000000000000" as Address,
        0n,
        ZERO_BYTES32,
        BigInt(parsedAmountIn),
        0n,
        address as Address,
        deadline,
      ],
    });
  }, [address, parsedAmountIn, tokenIn.address, writeSwap]);

  useEffect(() => {
    if (xcmStep === "approving" && approveConfirmed) {
      executeXcmSwap();
    }
  }, [approveConfirmed, executeXcmSwap, xcmStep]);

  useEffect(() => {
    if (swapConfirmed) setXcmStep("done");
  }, [swapConfirmed]);

  useEffect(() => {
    const nextKey = `${amountIn}:${selectedChain.id}:${tokenInIdx}:${tokenOutIdx}`;
    if (!inputStateKeyRef.current) {
      inputStateKeyRef.current = nextKey;
      return;
    }

    if (inputStateKeyRef.current !== nextKey) {
      inputStateKeyRef.current = nextKey;
      if (xcmStep === "done") setXcmStep("idle");
    }
  }, [amountIn, selectedChain.id, tokenInIdx, tokenOutIdx, xcmStep]);

  const handleExecute = useCallback(() => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!parsedAmountIn || !address) return;
    if (xcmStep !== "idle" && xcmStep !== "done") return;

    if (isRelayTeleport) {
      if (!isRelayTokenSupported) return;

      if (needsApproval) {
        setXcmStep("approving");
        writeApprove({
          address: tokenIn.address as Address,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          gas: GAS_LIMITS.APPROVE,
          args: [CONTRACTS.SWAP_ROUTER as Address, BigInt(parsedAmountIn)],
        });
        return;
      }

      executeXcmSwap();
    }
  }, [
    address,
    executeXcmSwap,
    isConnected,
    isRelayTeleport,
    isRelayTokenSupported,
    needsApproval,
    openConnectModal,
    parsedAmountIn,
    tokenIn.address,
    writeApprove,
    xcmStep,
  ]);

  const relayBusy = xcmStep !== "idle" && xcmStep !== "done";
  const routePreviewOnly = !isRelayTeleport;
  const buttonDisabled =
    isConnected &&
    (!parsedAmountIn ||
      routePreviewOnly ||
      (isRelayTeleport && (!isRelayTokenSupported || relayBusy)));

  const buttonLabel = (() => {
    if (!isConnected) return "Connect Wallet";
    if (!parsedAmountIn) return "Enter Amount";

    if (isRelayTeleport) {
      if (!isRelayTokenSupported) return "DOT Only For Relay Teleport";
      if (xcmStep === "approving" || approveWalletPending) {
        return `Approving ${tokenIn.symbol}…`;
      }
      if (xcmStep === "swapping" || swapWalletPending) return "Teleporting…";
      if (needsApproval) return `Approve ${tokenIn.symbol}`;
      return "Teleport DOT To Relay Chain";
    }

    if (!activeRoute) return "No Route Available";
    if (activeRoute.status === "mainnet_only") return "Mainnet Only";
    if (activeRoute.status === "coming_soon") return "Coming Soon";
    if (activeRoute.status === "no_liquidity") return "No Liquidity";
    return "Preview Only";
  })();

  return (
    <div className="space-y-5 p-5">
      <section className="overflow-hidden border-[3px] border-border bg-surface shadow-[3px_3px_0_0_var(--border)]">
        <header className="panel-header">
          <div className="panel-header-block">
            <div className="panel-header-icon">
              <Link2 className="h-5 w-5 text-text-primary" />
            </div>
            <div className="panel-heading">
              <p className="panel-kicker">Cross-Chain</p>
              <h3 className="panel-title">XCM Route Console</h3>
              <p className="panel-subtitle">
                Stage teleport or bridge execution from Polkadot Hub TestNet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-primary text-primary-foreground">
              {selectedChain.estTime}
            </span>
            <span
              className={cn(
                "pill",
                selectedChain.type === "xcm"
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {selectedChain.type}
            </span>
          </div>
        </header>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <p className="retro-label text-[0.95rem] text-text-secondary">
              Destination Chain
            </p>
            <ChainSelector
              selected={selectedChain}
              options={XCM_CHAINS}
              onSelect={setSelectedChain}
            />
            <p className="text-[12px] text-text-muted">
              Estimated settlement: {selectedChain.estTime}
            </p>
          </div>

          <div className="grid gap-3">
            <label
              htmlFor={amountInputId}
              className="block space-y-2 border-[3px] border-border bg-background/80 p-4 shadow-[2px_2px_0_0_var(--border)]"
            >
              <span className="retro-label text-[0.95rem] text-text-secondary">
                You Pay
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={amountInputId}
                  type="text"
                  inputMode="decimal"
                  value={amountIn}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="input-trading min-w-[180px] flex-1 border-0 bg-transparent p-0 text-2xl font-semibold shadow-none focus:shadow-none"
                />
                <TokenPicker
                  selectedIdx={tokenInIdx}
                  onSelect={setTokenInIdx}
                  disabledIdx={tokenOutIdx}
                  label="Cross-chain input token"
                />
              </div>
            </label>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleFlip}
                className="flex h-11 w-11 items-center justify-center border-[3px] border-border bg-primary/15 shadow-[2px_2px_0_0_var(--border)] transition hover:bg-primary/25"
                aria-label="Swap input and output tokens"
              >
                <ArrowDown className="h-4 w-4 text-text-primary" />
              </button>
            </div>

            <div className="space-y-2 border-[3px] border-border bg-background/80 p-4 shadow-[2px_2px_0_0_var(--border)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="retro-label text-[0.95rem] text-text-secondary">
                  You Receive
                </span>
                <span className="pill bg-surface-alt text-text-secondary">
                  {isRelayTeleport ? "Relay Chain" : selectedChain.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-[180px] flex-1 text-2xl font-semibold text-text-primary">
                  {displayedReceiveAmount}
                </span>
                {isRelayTeleport ? (
                  <span className="pill bg-surface-alt text-text-secondary">
                    {tokenIn.symbol} (Relay)
                  </span>
                ) : (
                  <TokenPicker
                    selectedIdx={tokenOutIdx}
                    onSelect={setTokenOutIdx}
                    disabledIdx={tokenInIdx}
                    label="Cross-chain output token"
                  />
                )}
              </div>
              {isRelayTeleport && !isRelayTokenSupported && (
                <p className="text-[12px] text-warning">
                  Relay teleport currently supports tDOT input only.
                </p>
              )}
              {isRelayTeleport && parsedAmountIn && isRelayTokenSupported && (
                <p className="text-[12px] text-text-muted">
                  Approximately 0.1% XCM fee is deducted from a 1:1 relay
                  teleport.
                </p>
              )}
            </div>
          </div>

          {activeRoute && (
            <div className="overflow-hidden border-[3px] border-border bg-surface-alt shadow-[2px_2px_0_0_var(--border)]">
              <div className="section-strip flex flex-wrap items-center justify-between gap-2 border-t-0 bg-surface-alt">
                <span className="retro-label text-[0.95rem] text-text-secondary">
                  Active Route
                </span>
                <StatusPill status={activeRoute.status} />
              </div>
              <dl className="divide-y divide-border-subtle">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[12px] text-text-muted">Route</dt>
                  <dd className="font-mono text-[14px] text-text-primary">
                    {activeRoute.id}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[12px] text-text-muted">Settlement</dt>
                  <dd className="font-mono text-[14px] text-text-primary">
                    {selectedChain.estTime}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[12px] text-text-muted">Protocol Fee</dt>
                  <dd className="font-mono text-[14px] text-text-primary">
                    {activeRoute.totalFeeBps !== "0"
                      ? `${(Number(activeRoute.totalFeeBps) / 100).toFixed(2)}%`
                      : "—"}
                  </dd>
                </div>
                {isRelayTeleport && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="text-[12px] text-text-muted">
                      Exchange Rate
                    </dt>
                    <dd className="font-mono text-[14px] text-text-primary">
                      1:1 teleport
                    </dd>
                  </div>
                )}
                {selectedChain.paraId && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="text-[12px] text-text-muted">Parachain</dt>
                    <dd className="font-mono text-[14px] text-text-primary">
                      #{selectedChain.paraId}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </section>

      {!activeRoute && !isLoading && !isRelayTeleport && (
        <div className="border-[3px] border-border bg-surface-alt px-4 py-3 shadow-[3px_3px_0_0_var(--border)]">
          <p className="text-[13px] text-text-secondary">
            {parsedAmountIn
              ? "No route is available for the selected destination yet."
              : "Enter an amount to inspect available cross-chain routes."}
          </p>
        </div>
      )}

      {activeRoute?.status === "mainnet_only" && (
        <div className="border-[3px] border-border bg-primary/20 px-4 py-3 shadow-[3px_3px_0_0_var(--border)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" />
            <p className="text-[13px] leading-relaxed text-text-secondary">
              {selectedChain.name} is available on Polkadot mainnet only. Switch
              environments before attempting this route.
            </p>
          </div>
        </div>
      )}

      {activeRoute?.status === "coming_soon" && (
        <div className="border-[3px] border-border bg-surface-alt px-4 py-3 shadow-[3px_3px_0_0_var(--border)]">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" />
            <p className="text-[13px] text-text-secondary">
              {selectedChain.name} integration is staged but not live yet.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleExecute}
        disabled={buttonDisabled}
        className="btn-primary"
      >
        {buttonLabel}
      </button>

      <p className="text-center text-[12px] leading-relaxed text-text-muted">
        Cross-chain execution is powered by the XCM precompile on Polkadot Hub
        TestNet.
        <a
          href="https://blockscout-testnet.polkadot.io"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 inline-flex items-center gap-1 underline-offset-2 transition-colors hover:text-text-primary hover:underline"
        >
          View explorer
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
