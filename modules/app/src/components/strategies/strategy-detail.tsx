"use client";

import { useEffect, useRef } from "react";
import type { StrategyRecord } from "@/types";
import { formatUsd, truncateAddress, formatTimestamp, cn } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/strategy-config";
import { X, Copy, ExternalLink } from "lucide-react";

interface StrategyDetailProps {
  strategy: StrategyRecord;
  onClose: () => void;
}

const TITLE_ID = "strategy-detail-title";

export function StrategyDetail({ strategy, onClose }: StrategyDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const status = STATUS_CONFIG[strategy.status];
  const StatusIcon = status.icon;

  // Focus trap: on mount focus the panel; on Escape close
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    // Focus first focusable element inside the panel
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Trap focus within the panel
      if (e.key === "Tab") {
        if (focusable.length === 0) { e.preventDefault(); return; }
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={TITLE_ID} className="stat-number text-base text-text-primary">
            Strategy Detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Status badge */}
          <span
            className={cn(
              "pill text-xs",
              status.className,
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </span>

          {/* Fields */}
          <div className="mt-5 space-y-4">
            <DetailField label="Action" value={strategy.action} />
            <DetailField label="Amount" value={formatUsd(strategy.amount)} mono />
            <DetailField label="Time" value={formatTimestamp(strategy.timestamp)} />
            <DetailField
              label="Target"
              value={truncateAddress(strategy.target)}
              mono
              copyable={strategy.target}
            />

            {/* Reasoning */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                AI Reasoning
              </p>
              <div className="mt-1.5 rounded-md border border-border-subtle bg-background p-3">
                <p className="font-mono text-xs leading-relaxed text-text-secondary">
                  {strategy.reasoning}
                </p>
              </div>
            </div>

            {/* Transaction */}
            {strategy.txHash && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Transaction
                </p>
                <a
                  href={`https://blockscout-paseo.parity-chains.parity.io/tx/${strategy.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-2 font-mono text-xs text-accent hover:text-accent/80"
                >
                  {truncateAddress(strategy.txHash, 8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DetailField({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: string;
}) {
  const handleCopy = () => {
    if (copyable) navigator.clipboard.writeText(copyable);
  };

  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className={cn("text-sm text-text-primary", mono && "font-mono")}>
          {value}
        </p>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
