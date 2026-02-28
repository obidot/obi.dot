import { cn } from "@/lib/format";

interface SkeletonProps {
  className?: string;
}

/** Animated shimmer skeleton placeholder */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** Full-panel skeleton for loading states */
export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel rounded-lg p-4 space-y-3" aria-busy="true" aria-label="Loading...">
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
