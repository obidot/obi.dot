"use client";

import { Check, ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";

interface TokenPickerProps {
  selectedIdx: number;
  onSelect: (idx: number) => void;
  disabledIdx?: number;
  label?: string;
}

const MENU_GUTTER = 12;
const MENU_MIN_WIDTH = 220;

export default function TokenPicker({
  selectedIdx,
  onSelect,
  disabledIdx,
  label = "Select token",
}: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const token = TOKENS[selectedIdx];
  const colors = tokenColor(token.symbol);

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const width = Math.max(rect.width, MENU_MIN_WIDTH);
    const estimatedDropdownHeight = TOKENS.length * 58;
    const spaceBelow = viewportHeight - rect.bottom;
    const openAbove =
      spaceBelow < estimatedDropdownHeight &&
      rect.top > estimatedDropdownHeight;
    const left = Math.min(
      Math.max(MENU_GUTTER, rect.left),
      viewportWidth - width - MENU_GUTTER,
    );

    setDropdownStyle({
      position: "fixed",
      left,
      width,
      zIndex: 9999,
      ...(openAbove
        ? { bottom: viewportHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updateDropdownPosition();

    function handleOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handleReposition() {
      updateDropdownPosition();
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition, { passive: true });
    window.addEventListener("scroll", handleReposition, {
      passive: true,
      capture: true,
    });

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, {
        capture: true,
      });
    };
  }, [open, updateDropdownPosition]);

  const dropdown =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={dropdownRef}
        id={listboxId}
        role="listbox"
        aria-label={label}
        style={dropdownStyle}
        className="max-h-[320px] overflow-y-auto border-[3px] border-border bg-popover shadow-[6px_6px_0_0_var(--border)]"
      >
        {TOKENS.map((item, idx) => {
          const optionColors = tokenColor(item.symbol);
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
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border-subtle px-3 py-3 text-left transition-colors last:border-b-0",
                isSelected
                  ? "bg-primary/14"
                  : "bg-popover hover:bg-surface-hover",
                isDisabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-border text-[13px] font-bold",
                  optionColors.circle,
                  optionColors.text,
                )}
              >
                {item.symbol.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px] font-semibold text-text-primary">
                  {item.symbol}
                </p>
                <p className="text-[12px] text-text-muted truncate">
                  {item.name}
                </p>
              </div>
              {isSelected && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
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
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex min-w-[128px] items-center gap-2 border-[3px] border-border bg-surface px-3 py-2 shadow-[3px_3px_0_0_var(--border)] transition",
          "hover:bg-surface-hover hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_var(--border)]",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-border text-[13px] font-bold",
            colors.circle,
            colors.text,
          )}
        >
          {token.symbol.slice(0, 2)}
        </span>
        <span className="flex-1 text-left font-mono text-[15px] font-semibold text-text-primary">
          {token.symbol}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {dropdown}
    </div>
  );
}
