"use client";

import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";
import { ChevronDown, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const token = TOKENS[selectedIdx];
  const colors = tokenColor(token.symbol);

  // Position the portal dropdown below (or above) the trigger button
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedDropdownHeight = TOKENS.length * 56; // ~56px per row
    const spaceBelow = viewportHeight - rect.bottom;
    const openAbove = spaceBelow < estimatedDropdownHeight && rect.top > estimatedDropdownHeight;

    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width < 160 ? 160 : rect.width,
      zIndex: 9999,
      ...(openAbove
        ? { bottom: viewportHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open]);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  const dropdown = open && typeof document !== "undefined" && createPortal(
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="border border-border bg-surface shadow-lg overflow-hidden"
    >
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
    </div>,
    document.body,
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
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

      {dropdown}
    </div>
  );
}
