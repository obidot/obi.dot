"use client";

import { Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { CHAIN } from "@/lib/constants";
import { cn, formatTimestamp, formatUsd, truncateAddress } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/strategy-config";
import type { StrategyRecord } from "@/types";

interface StrategyDetailProps {
  strategy: StrategyRecord;
  onClose: () => void;
}

const TITLE_ID = "strategy-detail-title";

export function StrategyDetail({ strategy, onClose }: StrategyDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const status = STATUS_CONFIG[strategy.status];
  const StatusIcon = status.icon;
  const txHash = strategy.txHash;

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
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
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
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l-[4px] border-border bg-background shadow-[10px_0_0_0_var(--border)]"
      >
        <div className="panel-header sticky top-0 z-10">
          <div className="panel-header-block">
            <div className={cn("panel-header-icon", status.className)}>
              <StatusIcon className="h-4 w-4" />
            </div>
            <div className="panel-heading">
              <p className="panel-kicker">Execution Detail</p>
              <h2 id={TITLE_ID} className="panel-title">
                Strategy Ticket
              </h2>
              <p className="panel-subtitle">
                Full action context, reasoning trace, and settlement link.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="btn-ghost h-11 w-11 p-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("pill text-xs", status.className)}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
            <span className="pill bg-surface-hover text-text-secondary text-[10px]">
              {strategy.action}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Action" value={strategy.action} />
              <DetailField
                label="Amount"
                value={formatUsd(strategy.amount)}
                mono
              />
              <DetailField
                label="Executed"
                value={formatTimestamp(strategy.timestamp)}
              />
              <DetailField
                label="Target"
                value={truncateAddress(strategy.target)}
                mono
                copyable={strategy.target}
              />
            </div>

            <div className="border-[3px] border-border bg-surface px-4 py-4 shadow-[3px_3px_0_0_var(--border)]">
              <p className="retro-label text-[0.8rem] text-text-muted">
                AI Reasoning
              </p>
              <p className="mt-3 font-mono text-xs leading-relaxed text-text-secondary">
                {strategy.reasoning}
              </p>
            </div>

            {txHash && (
              <div className="border-[3px] border-border bg-surface-alt px-4 py-4 shadow-[3px_3px_0_0_var(--border)]">
                <p className="retro-label text-[0.8rem] text-text-muted">
                  Settlement Receipt
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`${CHAIN.blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    {truncateAddress(txHash, 8)}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(txHash ?? "")}
                    className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Tx Hash
                  </button>
                </div>
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
    <div className="border-[3px] border-border bg-surface px-4 py-3 shadow-[3px_3px_0_0_var(--border)]">
      <p className="retro-label text-[0.8rem] text-text-muted">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <p
          className={cn(
            "text-sm font-semibold text-text-primary",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            className="btn-ghost h-7 w-7 p-0"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
