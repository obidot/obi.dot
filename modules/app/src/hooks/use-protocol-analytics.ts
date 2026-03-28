"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getProtocolStats,
  getTopRoutes,
  type IndexedProtocolStats,
  type IndexedRouteStats,
} from "@/lib/graphql";

export interface ProtocolAnalyticsData {
  stats: IndexedProtocolStats;
  topRoutes: IndexedRouteStats[];
}

export function useProtocolAnalytics() {
  return useQuery<ProtocolAnalyticsData>({
    queryKey: ["protocol-analytics"],
    queryFn: async () => {
      const [stats, topRoutes] = await Promise.all([
        getProtocolStats(),
        getTopRoutes(6),
      ]);

      return { stats, topRoutes };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
