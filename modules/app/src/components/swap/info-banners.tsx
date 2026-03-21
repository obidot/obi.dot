import { ChevronRight, TrendingUp, Zap } from "lucide-react";

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
    <div className="grid gap-3 md:grid-cols-2">
      {/* ── TRENDING POOLS ── */}
      <div className="card flex min-w-0 flex-col">
        {/* Label row */}
        <div className="flex items-center gap-1.5 border-b-[3px] border-border bg-surface-alt px-3 py-2">
          <TrendingUp className="h-3 w-3 text-text-muted shrink-0" />
          <span className="retro-label text-[0.85rem] text-text-muted">
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
            <span className="pill bg-bull/15 text-bull">12.4% APR</span>
            <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
          </div>
        </div>
      </div>

      {/* ── FARMING POOLS ── */}
      <div className="card flex min-w-0 flex-col">
        {/* Label row */}
        <div className="flex items-center gap-1.5 border-b-[3px] border-border bg-surface-alt px-3 py-2">
          <Zap className="h-3 w-3 text-warning shrink-0" />
          <span className="retro-label text-[0.85rem] text-warning">
            Farming Pools
          </span>
        </div>
        {/* Content */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <TokenPair a="tD" b="tU" />
              <span className="text-[14px] font-semibold text-text-primary">
                DOT/USDC
              </span>
              <span className="font-mono text-[13px] font-bold text-warning">
                8.2%
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <TokenPair a="tE" b="tU" />
              <span className="text-[14px] font-semibold text-text-primary">
                ETH/USDC
              </span>
              <span className="font-mono text-[13px] font-bold text-warning">
                5.6%
              </span>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-text-muted shrink-0" />
        </div>
      </div>
    </div>
  );
}
