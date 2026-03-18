"use client";

import { useState, useMemo } from "react";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { cn, formatTokenAmount } from "@/lib/format";
import { useRouteFinder } from "@/hooks/use-swap";
import { TOKENS } from "@/shared/trade/swap";
import type { SwapRouteResult } from "@/types";
import TokenPicker from "./token-picker";
import {
  Link2,
  Clock,
  ChevronDown,
  ArrowRight,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

// ── Chain definitions ─────────────────────────────────────────────────────

interface XCMChain {
  id: string;
  name: string;
  paraId: number | null;
  type: "xcm" | "bridge";
  icon: string;
  estTime: string;
}

const XCM_CHAINS: XCMChain[] = [
  { id: "relay", name: "Relay Teleport", paraId: null, type: "xcm", icon: "RL", estTime: "~12s" },
  { id: "hydration", name: "Hydration", paraId: 2034, type: "xcm", icon: "HY", estTime: "~30s" },
  { id: "bifrost", name: "Bifrost", paraId: 2030, type: "xcm", icon: "BI", estTime: "~30s" },
  { id: "karura", name: "Karura", paraId: 2000, type: "xcm", icon: "KA", estTime: "~30s" },
  { id: "interlay", name: "Interlay", paraId: 2032, type: "xcm", icon: "IN", estTime: "~30s" },
  { id: "moonbeam", name: "Moonbeam", paraId: 2004, type: "xcm", icon: "MO", estTime: "~30s" },
  { id: "assethub", name: "AssetHub", paraId: 1000, type: "xcm", icon: "AH", estTime: "~12s" },
  { id: "snowbridge", name: "Snowbridge (Ethereum)", paraId: null, type: "bridge", icon: "SN", estTime: "~20min" },
  { id: "chainflip", name: "ChainFlip (ETH)", paraId: null, type: "bridge", icon: "CF", estTime: "~3min" },
];

// ── Route-status to chain-id mapping ─────────────────────────────────────

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
  return (map[chainId] ?? []).some((kw) => label.includes(kw));
}

// ── Status badge ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SwapRouteResult["status"] }) {
  const s: Record<SwapRouteResult["status"], string> = {
    live: "bg-primary/10 text-primary border-primary/20",
    mainnet_only: "bg-warning/10 text-warning border-warning/20",
    coming_soon: "bg-surface-hover text-text-muted border-border",
  };
  const l: Record<SwapRouteResult["status"], string> = {
    live: "LIVE",
    mainnet_only: "MAINNET ONLY",
    coming_soon: "COMING SOON",
  };
  return (
    <span className={cn("font-mono text-[11px] border px-1.5 py-0.5 tracking-wide", s[status])}>
      {l[status]}
    </span>
  );
}

// ── Chain selector dropdown ────────────────────────────────────────────────

interface ChainSelectorProps {
  selected: XCMChain;
  options: XCMChain[];
  onSelect: (c: XCMChain) => void;
}

function ChainSelector({ selected, options, onSelect }: ChainSelectorProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border border-border bg-surface-hover px-3 py-2 hover:border-primary/50 transition-colors w-full"
      >
        <span className={cn("flex h-6 w-6 items-center justify-center text-[11px] font-bold rounded-full bg-primary/20 text-primary shrink-0")}>
          {selected.icon}
        </span>
        <span className="text-[14px] text-text-primary font-medium flex-1 text-left">{selected.name}</span>
        {selected.paraId && (
          <span className="font-mono text-[11px] text-text-muted">para {selected.paraId}</span>
        )}
        <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-surface border border-border shadow-lg mt-px max-h-60 overflow-y-auto">
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onSelect(c); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors",
                c.id === selected.id && "bg-primary/5",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center text-[10px] font-bold rounded-full bg-primary/20 text-primary shrink-0">
                {c.icon}
              </span>
              <span className="text-[13px] text-text-primary flex-1">{c.name}</span>
              {c.paraId && <span className="font-mono text-[11px] text-text-muted">para {c.paraId}</span>}
              <span className={cn("font-mono text-[10px] border px-1 py-0.5", c.type === "xcm" ? "text-primary border-primary/20" : "text-warning border-warning/20")}>
                {c.type.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CrossChainSwapPanel() {
  const [tokenInIdx, setTokenInIdx] = useState(0);
  const [tokenOutIdx, setTokenOutIdx] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [selectedChain, setSelectedChain] = useState<XCMChain>(XCM_CHAINS[0]);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const tokenIn = TOKENS[tokenInIdx];
  const tokenOut = TOKENS[tokenOutIdx];

  const isRelayTeleport = selectedChain.id === "relay";

  const parsedAmountIn = useMemo(() => {
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) return "";
    try {
      return parseUnits(amountIn, tokenIn.decimals).toString();
    } catch { return ""; }
  }, [amountIn, tokenIn.decimals]);

  const { routes, isLoading } = useRouteFinder({
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn: parsedAmountIn,
  });

  const xcmRoutes = routes.filter((r) => r.routeType !== "local");

  // Find route matching selected chain
  const activeRoute = xcmRoutes.find((r) => matchRouteToChain(r, selectedChain.id));

  // For RelayTeleport: 1:1 teleport (DOT Hub → relay DOT), minus ~0.1% XCM fee estimate
  const relayReceiveAmount = useMemo(() => {
    if (!isRelayTeleport || !parsedAmountIn) return null;
    try {
      const raw = BigInt(parsedAmountIn);
      const fee = raw / BigInt(1000); // ~0.1%
      return (raw - fee).toString();
    } catch { return null; }
  }, [isRelayTeleport, parsedAmountIn]);

  const handleAmountChange = (raw: string) => {
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) setAmountIn(raw);
  };

  const handleFlip = () => {
    setTokenInIdx(tokenOutIdx);
    setTokenOutIdx(tokenInIdx);
    setAmountIn("");
  };

  const handleExecute = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    // TODO: wire up XCM execution via SwapRouter adapter
    // RelayTeleport → adapter slot 5, no tokenOut (native relay DOT)
    // Other chains → execute via respective adapter
  };

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <span className="text-[13px] text-text-secondary font-medium">Route via Polkadot XCM / Bridge</span>
      </div>

      {/* Destination chain */}
      <div className="space-y-1.5">
        <p className="text-[12px] text-text-muted uppercase tracking-wider">Destination Chain</p>
        <ChainSelector
          selected={selectedChain}
          options={XCM_CHAINS}
          onSelect={setSelectedChain}
        />
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1 text-[12px] text-text-muted">
            <Clock className="h-3 w-3" />
            <span>Est. {selectedChain.estTime}</span>
          </div>
          {selectedChain.type === "bridge" && (
            <span className="text-[11px] text-warning font-mono border border-warning/20 px-1.5 py-0.5">BRIDGE</span>
          )}
          {selectedChain.type === "xcm" && (
            <span className="text-[11px] text-primary font-mono border border-primary/20 px-1.5 py-0.5">XCM</span>
          )}
        </div>
      </div>

      {/* Token inputs */}
      <div className="space-y-2">
        <div className="border border-border bg-background/60 p-4">
          <p className="text-[13px] text-text-muted mb-3">You Pay</p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={amountIn}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="input-trading text-xl font-semibold flex-1 bg-transparent border-0 focus:ring-0 p-0"
            />
            <TokenPicker selectedIdx={tokenInIdx} onSelect={setTokenInIdx} disabledIdx={tokenOutIdx} />
          </div>
        </div>

        <div className="flex justify-center -my-1 relative z-10">
          <button
            type="button"
            onClick={handleFlip}
            className="rounded-none border border-border bg-surface p-1.5 hover:border-primary hover:bg-primary/10 hover:text-primary transition-all"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="border border-border bg-background/60 p-4">
          <p className="text-[13px] text-text-muted mb-3">
            You Receive on {isRelayTeleport ? "Relay Chain" : selectedChain.name}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold text-text-secondary flex-1">
              {isLoading ? "..." : isRelayTeleport
                ? (relayReceiveAmount ? formatTokenAmount(relayReceiveAmount, tokenIn.decimals, 6) : "—")
                : (activeRoute?.amountOut && activeRoute.amountOut !== "0"
                    ? formatTokenAmount(activeRoute.amountOut, tokenOut.decimals, 6)
                    : "—")}
            </span>
            <TokenPicker selectedIdx={tokenOutIdx} onSelect={setTokenOutIdx} disabledIdx={tokenInIdx} />
          </div>
          {isRelayTeleport && parsedAmountIn && (
            <p className="text-[11px] text-text-muted mt-1.5">
              ~0.1% XCM fee deducted · 1:1 teleport, no exchange rate
            </p>
          )}
        </div>
      </div>

      {/* Active route details */}
      {activeRoute && (
        <div className="border border-border divide-y divide-border">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px] text-text-muted">Route</span>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-text-secondary font-medium">{activeRoute.id}</span>
              <StatusPill status={activeRoute.status} />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px] text-text-muted">Est. Time</span>
            <span className="font-mono text-[13px] text-text-secondary">{selectedChain.estTime}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[12px] text-text-muted">Protocol Fee</span>
            <span className="font-mono text-[13px] text-text-secondary">
              {activeRoute.totalFeeBps !== "0"
                ? `${(Number(activeRoute.totalFeeBps) / 100).toFixed(2)}%`
                : "—"}
            </span>
          </div>
          {isRelayTeleport && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[12px] text-text-muted">Exchange Rate</span>
              <span className="font-mono text-[13px] text-primary font-semibold">1:1 (teleport)</span>
            </div>
          )}
          {selectedChain.paraId && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[12px] text-text-muted">Parachain</span>
              <span className="font-mono text-[13px] text-text-secondary">#{selectedChain.paraId}</span>
            </div>
          )}
        </div>
      )}

      {/* Status-based action */}
      {!activeRoute && !isLoading && !isRelayTeleport && (
        <p className="text-[13px] text-text-muted text-center py-2">
          {parsedAmountIn ? "No route found for this chain" : "Enter an amount to see routes"}
        </p>
      )}

      {activeRoute?.status === "mainnet_only" && (
        <div className="flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
          <p className="text-[12px] text-text-secondary">
            {selectedChain.name} is available on Polkadot mainnet only. Connect to mainnet to execute this route.
          </p>
        </div>
      )}

      {activeRoute?.status === "coming_soon" && (
        <div className="flex items-start gap-2 border border-border px-3 py-2.5">
          <Clock className="h-3.5 w-3.5 text-text-muted mt-0.5 shrink-0" />
          <p className="text-[12px] text-text-muted">
            {selectedChain.name} integration is coming soon.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleExecute}
        disabled={isConnected && (isRelayTeleport ? !parsedAmountIn : (!activeRoute || activeRoute.status !== "live" || !parsedAmountIn))}
        className="btn-primary"
      >
        {!isConnected
          ? "CONNECT WALLET"
          : !parsedAmountIn
            ? "ENTER AMOUNT"
            : isRelayTeleport
              ? "TELEPORT DOT TO RELAY CHAIN"
              : !activeRoute
                ? "NO ROUTE AVAILABLE"
                : activeRoute.status === "live"
                  ? `SWAP VIA ${selectedChain.name.toUpperCase()}`
                  : activeRoute.status === "mainnet_only"
                    ? "MAINNET ONLY"
                    : "COMING SOON"}
      </button>

      <p className="text-center text-[11px] text-text-muted">
        Cross-chain execution powered by XCM precompile on Polkadot Hub
        <a
          href="https://blockscout-testnet.polkadot.io"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 inline-flex items-center gap-0.5 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </p>
    </div>
  );
}
