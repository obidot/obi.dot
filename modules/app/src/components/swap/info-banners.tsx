import React from "react";
import { TrendingUp, Zap, ChevronRight } from "lucide-react";

// ── Overlapping token circles (KyberSwap style) ───────────────────────────

function TokenPair({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex items-center shrink-0">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-[9px] font-bold text-primary z-10">
        {a}
      </span>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 border border-accent/30 text-[9px] font-bold text-accent -ml-2">
        {b}
      </span>
    </div>
  );
}

export default function InfoBanners() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
      {/* Trending Pools */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TrendingUp className="h-4 w-4 text-primary shrink-0" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-semibold shrink-0">
            Trending
          </span>
          <TokenPair a="tD" b="tU" />
          <span className="text-[12px] font-semibold text-text-primary truncate">
            DOT/USDC
          </span>
          <span className="pill bg-primary/15 text-primary border border-primary/20 font-mono text-[10px] shrink-0">
            12.4% APR
          </span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-primary/50 shrink-0" />
      </div>

      {/* Farming Pools */}
      <div className="rounded-lg border border-secondary/20 bg-secondary/5 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Zap className="h-4 w-4 text-secondary shrink-0" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-secondary font-semibold shrink-0">
            Farming
          </span>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <TokenPair a="tD" b="tU" />
              <span className="pill bg-secondary/15 text-secondary border border-secondary/20 font-mono text-[10px]">
                8.2%
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <TokenPair a="tE" b="tU" />
              <span className="pill bg-secondary/15 text-secondary border border-secondary/20 font-mono text-[10px]">
                5.6%
              </span>
            </div>
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-secondary/50 shrink-0" />
      </div>
    </div>
  );
}
