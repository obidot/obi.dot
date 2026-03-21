"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useVaultPerformance } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";

export function QuickStats() {
  const { data: perf, isLoading } = useVaultPerformance();

  if (isLoading) {
    return (
      <div
        className="grid border-b-[3px] border-border md:grid-cols-3"
        aria-busy="true"
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-b border-border-subtle px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <Skeleton className="h-2.5 w-20 mb-1.5" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "Cumulative P&L",
      value: perf ? formatTokenAmount(perf.cumulativePnL ?? "0") : "--",
      positive: perf ? BigInt(perf.cumulativePnL ?? "0") >= 0n : true,
    },
    {
      label: "High Water Mark",
      value: perf ? formatTokenAmount(perf.highWaterMark ?? "0") : "--",
      positive: undefined,
    },
    {
      label: "Fees Accrued",
      value: perf ? formatTokenAmount(perf.feeAccrued ?? "0") : "--",
      positive: undefined,
    },
  ];

  return (
    <dl className="grid border-b-[3px] border-border bg-surface-alt md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="border-b border-border-subtle px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
        >
          <dt className="retro-label text-[0.82rem] text-text-muted">
            {item.label}
          </dt>
          <dd
            className={`mt-2 text-[13px] font-semibold ${
              item.positive === false ? "text-danger" : "text-text-primary"
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
