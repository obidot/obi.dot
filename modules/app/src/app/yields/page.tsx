"use client";

import { useYields, useBifrostYields } from "@/hooks/use-yields";
import { YieldGrid } from "@/components/yields/yield-grid";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";

export default function YieldsPage() {
  const { data: yields, isLoading: yLoading, error: yError, refetch: yRefetch } = useYields();
  const { data: bifrost, isLoading: bLoading } = useBifrostYields();

  const isLoading = yLoading || bLoading;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <PanelSkeleton rows={6} />
      ) : yError ? (
        <div className="panel rounded-lg p-8 text-center">
          <p className="font-mono text-sm text-danger">Failed to load yields</p>
          <button
            type="button"
            onClick={() => yRefetch()}
            className="btn-ghost mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <YieldGrid yields={yields ?? []} bifrostYields={bifrost ?? []} />
      )}
    </div>
  );
}
