"use client";

import { useVaultPerformance } from "@/hooks/use-vault-state";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/format";

export function QuickStats() {
  const { data: perf } = useVaultPerformance();

  const stats = [
    {
      label: "Cumulative PnL",
      value: perf ? formatUsd(perf.cumulativePnL) : "--",
      positive: perf ? BigInt(perf.cumulativePnL || "0") >= 0n : true,
    },
    {
      label: "High Water Mark",
      value: perf ? formatUsd(perf.highWaterMark) : "--",
    },
    {
      label: "Fees Accrued",
      value: perf ? formatUsd(perf.feeAccrued) : "--",
    },
  ];

  return (
    <div className="card flex items-center divide-x divide-border px-2">
      {stats.map((stat) => (
        <div key={stat.label} className="flex-1 px-4 py-3 text-center">
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            {stat.label}
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold",
              stat.positive === false ? "text-danger" : "text-text-primary",
            )}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
