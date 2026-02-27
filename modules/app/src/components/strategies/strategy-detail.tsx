"use client";

import type { StrategyRecord } from "@/types";
import { formatUsd, truncateAddress, formatTimestamp, cn } from "@/lib/format";
import { X, Copy, ExternalLink, CheckCircle2, Clock, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  executed: { label: "Executed", icon: CheckCircle2, className: "bg-primary/10 text-primary" },
  pending: { label: "Pending", icon: Clock, className: "bg-warning/10 text-warning" },
  failed: { label: "Failed", icon: XCircle, className: "bg-danger/10 text-danger" },
} as const;

interface StrategyDetailProps {
  strategy: StrategyRecord;
  onClose: () => void;
}

export function StrategyDetail({ strategy, onClose }: StrategyDetailProps) {
  const status = STATUS_CONFIG[strategy.status];
  const StatusIcon = status.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close detail panel"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">
            Strategy Detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status badge */}
        <div className="mt-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
              status.className,
            )}
          >
            <StatusIcon className="h-4 w-4" />
            {status.label}
          </span>
        </div>

        {/* Fields */}
        <div className="mt-6 space-y-4">
          <DetailField label="Action" value={strategy.action} />
          <DetailField label="Amount" value={formatUsd(strategy.amount)} mono />
          <DetailField label="Time" value={formatTimestamp(strategy.timestamp)} />
          <DetailField
            label="Target Protocol"
            value={truncateAddress(strategy.targetProtocol)}
            mono
            copyable={strategy.targetProtocol}
          />
          <DetailField
            label="Parachain ID"
            value={String(strategy.targetParachain)}
            mono
          />

          {/* Reasoning */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              AI Reasoning
            </p>
            <div className="mt-1.5 rounded-lg bg-background p-3">
              <p className="text-sm leading-relaxed text-text-secondary">
                {strategy.reasoning}
              </p>
            </div>
          </div>

          {/* Transaction */}
          {strategy.txHash && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Transaction
              </p>
              <a
                href={`https://blockscout-paseo.parity-chains.parity.io/tx/${strategy.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-2 font-mono text-sm text-accent hover:text-accent/80"
              >
                {truncateAddress(strategy.txHash, 8)}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
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
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p
          className={cn(
            "text-sm text-text-primary",
            mono && "font-mono",
          )}
        >
          {value}
        </p>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-text-muted hover:text-text-secondary"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
