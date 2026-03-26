"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { resolveTokenAssetId } from "@/lib/asset-registry";
import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";

function TokenVisual({
  symbol,
  size = "default",
}: {
  symbol: string;
  size?: "default" | "compact";
}) {
  const assetId = resolveTokenAssetId(symbol);
  const colors = tokenColor(symbol);

  if (assetId) {
    return (
      <AssetIcon
        assetId={assetId}
        size={size === "compact" ? "sm" : "md"}
        variant="tile"
        className="h-8 w-8 rounded-full bg-surface border-[2px] shadow-[2px_2px_0_0_var(--border)]"
        imageClassName="p-1"
      />
    );
  }

  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-border text-[13px] font-bold",
        colors.circle,
        colors.text,
      )}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}

interface TokenPickerProps {
  selectedIdx: number;
  onSelect: (idx: number) => void;
  disabledIdx?: number;
  label?: string;
}

export default function TokenPicker({
  selectedIdx,
  onSelect,
  disabledIdx,
  label = "Select token",
}: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const token = TOKENS[selectedIdx];

  const filtered = search.trim()
    ? TOKENS.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search.toLowerCase()) ||
          t.name.toLowerCase().includes(search.toLowerCase()),
      )
    : TOKENS;

  function handleClose() {
    setOpen(false);
    setSearch("");
  }

  return (
    <div>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-w-[128px] items-center gap-2 border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)] transition",
          "hover:bg-surface-hover hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--border)]",
        )}
      >
        <TokenVisual symbol={token.symbol} />
        <span className="flex-1 text-left font-mono text-[15px] font-semibold text-text-primary">
          {token.symbol}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={(v) => {
          if (!v) handleClose();
          else setOpen(true);
        }}
        title={label}
      >
        {/* Search */}
        <div className="border-b-[3px] border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              // biome-ignore lint/a11y/noAutofocus: intentional focus for modal search
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tokens..."
              aria-label="Search tokens"
              className="input-trading py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {/* Token list */}
        <div role="listbox" aria-label={label}>
          {filtered.map((item) => {
            const idx = TOKENS.indexOf(item);
            const isSelected = idx === selectedIdx;
            const isDisabled = idx === disabledIdx;

            return (
              <button
                key={item.address}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(idx);
                  handleClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border-subtle px-3 py-3 text-left transition-colors last:border-b-0",
                  isSelected
                    ? "bg-primary/14"
                    : "bg-popover hover:bg-surface-hover",
                  isDisabled && "cursor-not-allowed opacity-45",
                )}
              >
                <TokenVisual symbol={item.symbol} size="compact" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-semibold text-text-primary">
                    {item.symbol}
                  </p>
                  <p className="truncate text-[12px] text-text-muted">
                    {item.name}
                  </p>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-text-muted">
              No tokens match "{search}"
            </p>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
}
