import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";
import { ChevronDown, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TokenPickerProps {
  selectedIdx: number;
  onSelect: (idx: number) => void;
  disabledIdx?: number;
}

export default function TokenPicker({
  selectedIdx,
  onSelect,
  disabledIdx,
}: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const token = TOKENS[selectedIdx];
  const colors = tokenColor(token.symbol);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 border border-border bg-surface-hover px-3 py-2",
          "hover:border-primary/40 transition-colors min-w-[110px]",
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
            colors.circle,
            colors.text,
          )}
        >
          {token.symbol.slice(0, 2)}
        </span>
        <span className="font-mono text-[15px] font-semibold text-text-primary flex-1 text-left">
          {token.symbol}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[160px] border border-border bg-surface shadow-lg overflow-hidden">
          {TOKENS.map((t, i) => {
            const c = tokenColor(t.symbol);
            const isSelected = i === selectedIdx;
            const isDisabled = i === disabledIdx;
            return (
              <button
                key={t.address}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect(i);
                    setOpen(false);
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-surface-hover",
                  isDisabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                    c.circle,
                    c.text,
                  )}
                >
                  {t.symbol.slice(0, 2)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[14px] font-semibold text-text-primary">
                    {t.symbol}
                  </p>
                  <p className="text-[12px] text-text-muted truncate">
                    {t.name}
                  </p>
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
