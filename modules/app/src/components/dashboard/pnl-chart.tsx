"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Period = "1D" | "1W" | "1M" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "ALL"];

const PERIOD_DAYS: Record<Period, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "ALL": 60,
};

export function PnlChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any previous chart instance synchronously
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      chartRef.current = null;
    }

    setLoading(true);

    // Abort flag: if this effect is cleaned up before the async import resolves
    // (e.g. navigating away then back), the stale .then() callback must not
    // create a second chart in the now-live container.
    let cancelled = false;

    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode }) => {
      if (cancelled || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#8b949e",
          fontFamily: "JetBrains Mono, SF Mono, monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(27, 35, 50, 0.5)" },
          horzLines: { color: "rgba(27, 35, 50, 0.5)" },
        },
        width: containerRef.current.clientWidth,
        height: 380,
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(0, 220, 130, 0.3)",
            width: 1,
            style: 2,
            labelBackgroundColor: "#0d1117",
          },
          horzLine: {
            color: "rgba(0, 220, 130, 0.3)",
            width: 1,
            style: 2,
            labelBackgroundColor: "#0d1117",
          },
        },
        rightPriceScale: {
          borderColor: "#1b2332",
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
          borderColor: "#1b2332",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 8,
        },
      });

      chartRef.current = chart;

      // Candlestick series for vault TVL / performance
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#00dc82",
        downColor: "#ef4444",
        borderUpColor: "#00dc82",
        borderDownColor: "#ef4444",
        wickUpColor: "#00dc82",
        wickDownColor: "#ef4444",
      });

      // Volume histogram
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      // Generate demo candlestick data filtered by selected period
      const now = Math.floor(Date.now() / 1000);
      const day = 86400;
      const totalDays = PERIOD_DAYS[period];
      let price = 10000;

      const candleData: Array<{
        time: import("lightweight-charts").UTCTimestamp;
        open: number;
        high: number;
        low: number;
        close: number;
      }> = [];
      const volumeData: Array<{
        time: import("lightweight-charts").UTCTimestamp;
        value: number;
        color: string;
      }> = [];

      for (let i = totalDays; i >= 0; i--) {
        const open = price;
        const change = (Math.random() - 0.45) * 400;
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * 200;
        const low = Math.min(open, close) - Math.random() * 200;
        const time = (now - i * day) as import("lightweight-charts").UTCTimestamp;
        const isUp = close >= open;

        candleData.push({ time, open, high, low, close });
        volumeData.push({
          time,
          value: 500 + Math.random() * 2000,
          color: isUp ? "rgba(0, 220, 130, 0.25)" : "rgba(239, 68, 68, 0.25)",
        });

        price = close;
      }

      candleSeries.setData(candleData);
      volumeSeries.setData(volumeData);
      chart.timeScale().fitContent();

      // Resize observer
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      // Store cleanup in ref so we can call it on period change AND on unmount
      cleanupRef.current = () => {
        observer.disconnect();
        chart.remove();
      };

      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      // Mark this effect instance as cancelled so any in-flight .then() is a no-op
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        chartRef.current = null;
      }
    };
  }, [period]);

  return (
    <div className="flex-1 p-4 pt-0">
      {/* Chart header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[13px] font-semibold text-text-primary">
            Vault Performance
          </h3>
          <span className="font-mono text-[11px] text-text-muted">TVL (DOT)</span>
          <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-warning">
            Demo Data
          </span>
        </div>
        <div className="tab-group">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`tab-item ${period === p ? "active" : ""}`}
              aria-pressed={period === p}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-[380px]">
        {loading && (
          <div className="absolute inset-0 flex flex-col gap-2 p-2" aria-busy="true" aria-label="Loading chart...">
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        )}
        <div
          ref={containerRef}
          className="min-h-[380px]"
          role="img"
          aria-label="Candlestick chart showing vault TVL performance over time (demo data)"
        />
      </div>
    </div>
  );
}
