"use client";

import { useState, useMemo } from "react";
import type { ProtocolYield, BifrostYield } from "@/types";
import { ProtocolCard } from "@/components/yields/protocol-card";
import { cn } from "@/lib/format";
import { Search } from "lucide-react";

type SourceFilter = "all" | "bifrost" | "defi";
type SortKey = "apy" | "tvl" | "name";

const FILTER_TABS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All Sources" },
  { key: "bifrost", label: "Bifrost" },
  { key: "defi", label: "DeFi Protocols" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "apy", label: "APY" },
  { key: "tvl", label: "TVL" },
  { key: "name", label: "Name" },
];

interface YieldGridProps {
  yields: ProtocolYield[];
  bifrostYields: BifrostYield[];
}

export function YieldGrid({ yields, bifrostYields }: YieldGridProps) {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("apy");
  const [search, setSearch] = useState("");

  const combined = useMemo(() => {
    type YieldItem = {
      yield_: ProtocolYield | BifrostYield;
      isBifrost: boolean;
      category?: "SLP" | "DEX" | "Farming" | "SALP";
    };

    let items: YieldItem[] = [];

    if (filter !== "defi") {
      items.push(
        ...bifrostYields.map((y) => ({
          yield_: y,
          isBifrost: true,
          category: y.category as "SLP" | "DEX" | "Farming" | "SALP",
        })),
      );
    }
    if (filter !== "bifrost") {
      items.push(...yields.map((y) => ({ yield_: y, isBifrost: false })));
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
      switch (sortBy) {
        case "apy":
          return b.yield_.apyPercent - a.yield_.apyPercent;
        case "tvl":
          return b.yield_.tvlUsd - a.yield_.tvlUsd;
        case "name":
          return a.yield_.name.localeCompare(b.yield_.name);
        default:
          return 0;
      }
    });

    return items;
  }, [yields, bifrostYields, filter, sortBy, search]);

  if (yields.length === 0 && bifrostYields.length === 0) {
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
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

          <div className="flex items-center gap-1 border-l border-border pl-3">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Sort:
            </span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortBy(opt.key)}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[10px] transition-colors",
                  sortBy === opt.key
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search yields..."
            className="input-trading py-1.5 pl-9 pr-3 text-xs"
            style={{ width: "200px" }}
          />
        </div>
      </div>

      {/* Dense grid of cards */}
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
        {combined.map((item) => (
          <ProtocolCard
            key={`${item.yield_.protocol}-${item.yield_.name}-${item.isBifrost}`}
            yield_={item.yield_}
            isBifrost={item.isBifrost}
            category={item.category}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <p className="font-mono text-[10px] text-text-muted">
          Showing {combined.length} yield sources
        </p>
      </div>
    </div>
  );
}
