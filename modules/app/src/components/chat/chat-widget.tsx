"use client";

import { Bot, Loader2, MessageSquare, Send, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { ChatMessage } from "@/types";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChatMessage(text, messages);
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[520px] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Obidot AI
                </p>
                <p className="font-mono text-[11px] text-text-muted">
                  GPT-5-mini
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Bot className="mx-auto h-6 w-6 text-text-muted" />
                  <p className="mt-2 font-mono text-sm text-text-muted">
                    Ask about vault state, yields, or strategies
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center self-end rounded bg-primary/10">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[82%] rounded-md px-3 py-2 font-mono text-sm",
                    msg.role === "user"
                      ? "bg-secondary/15 text-text-primary"
                      : "border border-border-subtle bg-background text-text-primary",
                  )}
                >
                  <p className="whitespace-pre-wrap leading-6">{msg.content}</p>
                </div>
                {msg.role === "user" && (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center self-end rounded bg-secondary/10">
                    <User className="h-3 w-3 text-secondary" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="rounded-md border border-border-subtle bg-background px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about vault, yields, strategies…"
                className="input-trading flex-1 py-2 text-sm"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-background transition-colors hover:bg-primary/90 disabled:bg-surface-hover disabled:text-text-muted"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          open
            ? "bg-surface-hover text-text-muted border border-border"
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
