"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { YieldGrid } from "@/components/yields/yield-grid";
import { Loader2 } from "lucide-react";

export default function YieldsPage() {
  const { data: yields, isLoading: yLoading } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();

  const isLoading = yLoading || bLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Yield Explorer
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Cross-chain yield opportunities from Bifrost, DeFiLlama, and more
        </p>
      </div>

      {isLoading ? (
        <div className="card flex min-h-[400px] items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        </div>
      ) : (
        <YieldGrid yields={yields ?? []} bifrostYields={bifrost ?? []} />
      )}
    </div>
  );
}
