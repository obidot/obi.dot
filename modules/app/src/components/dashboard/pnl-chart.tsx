"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

export function PnlChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInitialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current || chartInitialized.current) return;
    chartInitialized.current = true;

    // Dynamic import to avoid SSR issues with lightweight-charts
    import("lightweight-charts").then(({ createChart, ColorType }) => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#1e1e2e" },
          horzLines: { color: "#1e1e2e" },
        },
        width: containerRef.current.clientWidth,
        height: 300,
        crosshair: {
          vertLine: { color: "#00ff88", width: 1, style: 2, labelBackgroundColor: "#12121a" },
          horzLine: { color: "#00ff88", width: 1, style: 2, labelBackgroundColor: "#12121a" },
        },
        rightPriceScale: {
          borderColor: "#1e1e2e",
        },
        timeScale: {
          borderColor: "#1e1e2e",
          timeVisible: true,
        },
      });

      const areaSeries = chart.addAreaSeries({
        topColor: "rgba(0, 255, 136, 0.3)",
        bottomColor: "rgba(0, 255, 136, 0.02)",
        lineColor: "#00ff88",
        lineWidth: 2,
      });

      // Demo data — will be replaced with real PnL data from API
      const now = Math.floor(Date.now() / 1000);
      const day = 86400;
      const demoData = Array.from({ length: 30 }, (_, i) => ({
        time: (now - (30 - i) * day) as import("lightweight-charts").UTCTimestamp,
        value: 10000 + Math.random() * 2000 + i * 50,
      }));

      areaSeries.setData(demoData);
      chart.timeScale().fitContent();

      // Resize observer
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        chart.remove();
      };
    }).catch(() => {
      // Chart library failed to load
    });
  }, []);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Performance (PnL)
        </h3>
        <div className="flex gap-1">
          {["1D", "1W", "1M", "ALL"].map((period) => (
            <button
              key={period}
              type="button"
              className="rounded px-2 py-0.5 font-mono text-[10px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="min-h-[300px]">
        {!chartInitialized.current && (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        )}
      </div>
    </div>
  );
}
