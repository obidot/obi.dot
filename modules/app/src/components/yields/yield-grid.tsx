"use client";

import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { LP_PAIRS } from "@/lib/constants";
import { cn, formatApy, formatUsdNumber } from "@/lib/format";
import type {
  BifrostYield,
  LiquidityPairMeta,
  ProtocolYield,
  UniswapV2Yield,
} from "@/types";

type SourceFilter = "all" | "bifrost" | "defi" | "uniswap";
type SortKey = "apy" | "tvl" | "name";
type SortDir = "asc" | "desc";

const FILTER_TABS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All Sources" },
  { key: "bifrost", label: "Bifrost" },
  { key: "defi", label: "DeFi Protocols" },
  { key: "uniswap", label: "UniswapV2" },
];

// Protocol initials color palette (cycles through a set)
const PROTOCOL_COLORS = [
  "bg-primary/20 text-primary",
  "bg-secondary/20 text-secondary",
  "bg-accent/20 text-accent",
  "bg-warning/20 text-warning",
  "bg-bull/20 text-bull",
];

function protocolColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PROTOCOL_COLORS[Math.abs(hash) % PROTOCOL_COLORS.length];
}

// ── Sort icon ─────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col ml-1 opacity-40",
        active && "opacity-100",
      )}
    >
      <ChevronUp
        className={cn(
          "h-2.5 w-2.5 -mb-0.5",
          active && dir === "asc" ? "text-primary" : "text-text-muted",
        )}
      />
      <ChevronDown
        className={cn(
          "h-2.5 w-2.5",
          active && dir === "desc" ? "text-primary" : "text-text-muted",
        )}
      />
    </span>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  align = "left",
  onSort,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onSort: () => void;
}) {
  return (
    <th scope="col" className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-text-muted hover:text-text-secondary",
          align === "right" && "ml-auto flex",
        )}
      >
        {label}
        <SortIcon active={active} dir={dir} />
      </button>
    </th>
  );
}

// ── Type pill ─────────────────────────────────────────────────────────────

function TypePill({ category }: { category?: string }) {
  if (!category) return <span className="text-text-muted">—</span>;

  const styles: Record<string, string> = {
    SLP: "bg-primary/10 text-primary border-primary/20",
    DEX: "bg-accent/10 text-accent border-accent/20",
    Farming: "bg-bull/10 text-bull border-bull/20",
    SALP: "bg-secondary/10 text-secondary border-secondary/20",
    UniswapV2: "bg-warning/10 text-warning border-warning/20",
  };

  return (
    <span
      className={cn(
        "pill border text-[10px]",
        styles[category] ?? "bg-surface-hover text-text-muted border-border",
      )}
    >
      {category}
    </span>
  );
}

interface YieldGridProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
  uniswapV2Yields: UniswapV2Yield[];
  onEarn?: (name: string, apy: number, pairMeta?: LiquidityPairMeta) => void;
}

export function YieldGrid({
  yields,
  bifrostYields,
  uniswapV2Yields,
  onEarn,
}: YieldGridProps) {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("apy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }

  const combined = useMemo(() => {
    type YieldItem = {
      yield_: ProtocolYield | BifrostYield | UniswapV2Yield;
      isBifrost: boolean;
      isUniswap?: boolean;
      category?: "SLP" | "DEX" | "Farming" | "SALP" | "UniswapV2";
    };

    let items: YieldItem[] = [];

    if (filter !== "defi" && filter !== "uniswap") {
      items.push(
        ...bifrostYields.map((y) => ({
          yield_: y,
          isBifrost: true,
          category: y.category as "SLP" | "DEX" | "Farming" | "SALP",
        })),
      );
    }
    if (filter !== "bifrost" && filter !== "uniswap") {
      items.push(...yields.map((y) => ({ yield_: y, isBifrost: false })));
    }
    if (filter === "all" || filter === "uniswap") {
      items.push(
        ...uniswapV2Yields.map((y) => ({
          yield_: y,
          isBifrost: false,
          isUniswap: true,
          category: "UniswapV2" as const,
        })),
      );
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.yield_.name.toLowerCase().includes(q) ||
          item.yield_.protocol.toLowerCase().includes(q),
      );
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "apy":
          cmp = a.yield_.apyPercent - b.yield_.apyPercent;
          break;
        case "tvl":
          cmp = a.yield_.tvlUsd - b.yield_.tvlUsd;
          break;
        case "name":
          cmp = a.yield_.name.localeCompare(b.yield_.name);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return items;
  }, [yields, bifrostYields, uniswapV2Yields, filter, sortBy, sortDir, search]);

  if (
    yields.length === 0 &&
    bifrostYields.length === 0 &&
    uniswapV2Yields.length === 0
  ) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center rounded-lg p-8">
        <div className="text-center">
          <p className="font-mono text-sm text-text-muted">
            No yield data available
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Yield sources will appear once the agent fetches data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden rounded-lg">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className="panel-header-icon bg-accent">
            <Search className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="panel-heading">
            <p className="panel-kicker">Yield Radar</p>
            <h2 className="panel-title">Source Board</h2>
            <p className="panel-subtitle">
              Bifrost, DeFi, and UniswapV2 opportunities in a single retro
              ledger.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill bg-surface-hover text-text-secondary text-[10px]">
            {combined.length} visible
          </span>
          <span className="pill bg-warning/15 text-warning text-[10px]">
            {uniswapV2Yields.length} LP rows
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="tab-group">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn("tab-item", filter === tab.key && "active")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search yields..."
            aria-label="Search yield sources"
            className="input-trading py-1.5 pl-9 pr-3 text-xs"
            style={{ width: "200px" }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr>
              <SortableHeader
                label="Protocol"
                active={sortBy === "name"}
                dir={sortDir}
                onSort={() => handleSort("name")}
              />
              <th>Asset</th>
              <SortableHeader
                label="APR"
                active={sortBy === "apy"}
                dir={sortDir}
                align="right"
                onSort={() => handleSort("apy")}
              />
              <SortableHeader
                label="TVL"
                active={sortBy === "tvl"}
                dir={sortDir}
                align="right"
                onSort={() => handleSort("tvl")}
              />
              <th>Type</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {combined.map((item) => {
              const y = item.yield_;
              const displayLabel = y.protocolLabel ?? y.protocol;
              const initials = displayLabel.slice(0, 2).toUpperCase();
              const colors = protocolColor(displayLabel);
              const isHighApr = y.apyPercent >= 10;

              return (
                <tr key={`${y.protocol}-${y.name}-${item.isBifrost}`}>
                  {/* Protocol cell */}
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "retro-label flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border text-[0.8rem] font-bold",
                          colors,
                        )}
                      >
                        {initials}
                      </span>
                      <span className="text-text-secondary font-sans text-[12px] truncate max-w-[120px]">
                        {displayLabel}
                      </span>
                    </div>
                  </td>

                  {/* Asset cell */}
                  <td>
                    <span className="text-text-primary font-medium text-[12px]">
                      {y.name}
                    </span>
                  </td>

                  {/* APR cell */}
                  <td className="text-right">
                    <span
                      className={cn(
                        "font-mono font-semibold text-[13px]",
                        isHighApr ? "text-primary" : "text-bull",
                      )}
                    >
                      {formatApy(y.apyPercent)}
                    </span>
                  </td>

                  {/* TVL cell */}
                  <td className="text-right">
                    <span className="font-mono text-text-secondary text-[12px]">
                      {formatUsdNumber(y.tvlUsd, true)}
                    </span>
                  </td>

                  {/* Type cell */}
                  <td>
                    <TypePill
                      category={
                        item.isBifrost || item.isUniswap
                          ? item.category
                          : undefined
                      }
                    />
                  </td>

                  {/* Earn button */}
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        const pairMeta = item.isUniswap
                          ? LP_PAIRS.find((p) => p.label === y.name)
                          : undefined;
                        if (item.isUniswap && !pairMeta) {
                          console.warn(
                            `[YieldGrid] No LP_PAIRS entry for UV2 row "${y.name}"`,
                          );
                        }
                        onEarn?.(y.name, y.apyPercent, pairMeta);
                      }}
                      className={cn(
                        "retro-label border-[2px] border-border px-3 py-1 text-[0.85rem] shadow-[2px_2px_0_0_var(--border)] transition-transform",
                        onEarn
                          ? "bg-primary text-primary-foreground hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none cursor-pointer"
                          : "bg-surface-alt text-text-muted cursor-default",
                      )}
                    >
                      + Earn
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <p className="retro-label text-[0.8rem] text-text-muted">
          Showing {combined.length} yield sources
        </p>
      </div>
    </div>
  );
}
