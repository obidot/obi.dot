import { TrendingUp, Zap, ChevronRight } from "lucide-react";

function TokenPair({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex items-center shrink-0">
      <span className="flex h-5 w-5 items-center justify-center text-[10px] font-bold border z-10 bg-text-primary/10 border-text-primary/30 text-text-primary">
        {a}
      </span>
      <span className="flex h-5 w-5 items-center justify-center text-[10px] font-bold border -ml-1 bg-text-primary/15 border-text-primary/30 text-text-primary">
        {b}
      </span>
    </div>
  );
}

export default function InfoBanners() {
  return (
    <div className="flex border border-border bg-surface overflow-hidden divide-x divide-border">
      {/* ── TRENDING POOLS ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Label row */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border-b border-border">
          <TrendingUp className="h-3 w-3 text-text-muted shrink-0" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
            Trending Pools
          </span>
        </div>
        {/* Content */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TokenPair a="tD" b="tU" />
            <span className="text-[15px] font-semibold text-text-primary truncate">
              DOT/USDC
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono text-[13px] font-bold px-2 py-0.5 bg-bull/15 text-bull border border-bull/40">
              12.4% APR
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
          </div>
        </div>
      </div>

      {/* ── FARMING POOLS ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Label row */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border-b border-border">
          <Zap className="h-3 w-3 text-warning shrink-0" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-warning">
            Farming Pools
          </span>
        </div>
        {/* Content */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <TokenPair a="tD" b="tU" />
              <span className="text-[14px] font-semibold text-text-primary">DOT/USDC</span>
              <span className="font-mono text-[13px] font-bold text-warning">8.2%</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <TokenPair a="tE" b="tU" />
              <span className="text-[14px] font-semibold text-text-primary">ETH/USDC</span>
              <span className="font-mono text-[13px] font-bold text-warning">5.6%</span>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
        </div>
      </div>
    </div>
  );
}
