"use client";

import { useVaultPerformance } from "@/hooks/use-vault-state";
import { formatTokenAmount } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function QuickStats() {
  const { data: perf, isLoading } = useVaultPerformance();

  if (isLoading) {
    return (
      <div className="flex items-center border-b border-border divide-x divide-border" aria-busy="true" aria-label="Loading stats...">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 px-4 py-2.5">
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
    <dl className="flex items-center border-b border-border divide-x divide-border">
      {items.map((item) => (
        <div key={item.label} className="flex-1 px-4 py-2.5">
          <dt className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            {item.label}
          </dt>
          <dd className={`mt-0.5 font-mono text-[13px] font-semibold ${
            item.positive === false
              ? "text-danger"
              : "text-text-primary"
          }`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
