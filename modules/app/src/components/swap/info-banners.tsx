import { TrendingUp, Flame, ChevronRight, Zap } from "lucide-react";

// ── Overlapping token squares (no radius — Paradigm style) ─────────────────

function TokenPair({
  a,
  b,
  colorA,
  colorB,
}: {
  a: string;
  b: string;
  colorA: string;
  colorB: string;
}) {
  return (
    <div className="flex items-center shrink-0">
      <span
        className={`flex h-5 w-5 items-center justify-center text-[10px] font-bold border z-10 ${colorA}`}
      >
        {a}
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center text-[10px] font-bold border -ml-1 ${colorB}`}
      >
        {b}
      </span>
    </div>
  );
}

// ── APR badge ──────────────────────────────────────────────────────────────

function AprBadge({
  value,
  color,
}: {
  value: string;
  color: "primary" | "secondary" | "accent";
}) {
  const styles = {
    primary: "bg-primary text-white border-primary",
    secondary: "bg-secondary text-white border-secondary",
    accent: "bg-accent text-white border-accent",
  };
  return (
    <span
      className={`font-mono text-[13px] font-bold px-2.5 py-0.5 border shrink-0 ${styles[color]}`}
    >
      {value}
    </span>
  );
}

export default function InfoBanners() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* ── TRENDING POOLS ── */}
      <div className="border border-primary/25 bg-primary/5 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-primary/15">
          <TrendingUp className="h-3 w-3 text-primary shrink-0" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
            Trending Pools
          </span>
        </div>
        {/* Content */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TokenPair
              a="tD"
              b="tU"
              colorA="bg-primary/20 border-primary/40 text-primary"
              colorB="bg-accent/20 border-accent/40 text-accent"
            />
            <span className="text-[15px] font-semibold text-text-primary tracking-tight">
              DOT/USDC
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AprBadge value="12.4% APR" color="primary" />
            <ChevronRight className="h-3.5 w-3.5 text-primary/40" />
          </div>
        </div>
      </div>

      {/* ── FARMING POOLS ── */}
      <div className="border border-secondary/25 bg-secondary/5 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-secondary/15">
          <Zap className="h-3 w-3 text-secondary shrink-0" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-secondary">
            Farming Pools
          </span>
        </div>
        {/* Content — multiple pairs */}
        <div className="flex items-center justify-between px-3 py-2.5 gap-3">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <TokenPair
                a="tD"
                b="tU"
                colorA="bg-secondary/20 border-secondary/40 text-secondary"
                colorB="bg-accent/20 border-accent/40 text-accent"
              />
              <span className="text-[14px] font-semibold text-text-primary">
                DOT/USDC
              </span>
              <span className="font-mono text-[13px] font-bold text-secondary">
                8.2%
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <TokenPair
                a="tE"
                b="tU"
                colorA="bg-secondary/20 border-secondary/40 text-secondary"
                colorB="bg-accent/20 border-accent/40 text-accent"
              />
              <span className="text-[14px] font-semibold text-text-primary">
                ETH/USDC
              </span>
              <span className="font-mono text-[13px] font-bold text-secondary">
                5.6%
              </span>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-secondary/40 shrink-0" />
        </div>
      </div>
    </div>
  );
}
