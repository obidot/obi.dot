"use client";

import { MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";
import { InteractiveChat } from "./interactive-chat";

export function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div className="fixed bottom-20 right-6 z-50 flex h-[560px] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Obidot AI
              </p>
              <p className="font-mono text-[11px] text-text-muted">
                Interactive execute chat
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <InteractiveChat
            variant="widget"
            className="h-full"
            autoFocus={open}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          open
            ? "border border-border bg-surface-hover text-text-muted"
            : "bg-primary text-background glow-green",
        )}
      >
        {open ? (
          <X className="h-4 w-4" />
        ) : (
          <MessageSquare className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
