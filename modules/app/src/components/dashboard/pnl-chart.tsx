"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Period = "1D" | "1W" | "1M" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "ALL"];

const PERIOD_DAYS: Record<Period, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  ALL: 60,
};

export function PnlChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<
    typeof import("lightweight-charts").createChart
  > | null>(null);
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

    import("lightweight-charts")
      .then(({ createChart, ColorType, CrosshairMode }) => {
        if (cancelled || !containerRef.current) return;

        const styles = getComputedStyle(document.documentElement);
        const palette = {
          textMuted:
            styles.getPropertyValue("--text-muted").trim() || "#6a6254",
          border: styles.getPropertyValue("--border").trim() || "#17120f",
          borderSubtle:
            styles.getPropertyValue("--border-subtle").trim() ||
            "rgba(23, 18, 15, 0.18)",
          surface: styles.getPropertyValue("--surface").trim() || "#fffdf2",
          primary: styles.getPropertyValue("--primary").trim() || "#f4cd32",
          secondary: styles.getPropertyValue("--secondary").trim() || "#61a8ff",
          bull: styles.getPropertyValue("--bull").trim() || "#2a9d60",
          danger: styles.getPropertyValue("--danger").trim() || "#ef5d62",
        };

        const chart = createChart(containerRef.current, {
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: palette.textMuted,
            fontFamily: "var(--font-atlas), monospace",
            fontSize: 10,
          },
          grid: {
            vertLines: { color: palette.borderSubtle },
            horzLines: { color: palette.borderSubtle },
          },
          width: containerRef.current.clientWidth,
          height: 380,
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: {
              color: `${palette.secondary}80`,
              width: 1,
              style: 2,
              labelBackgroundColor: palette.surface,
            },
            horzLine: {
              color: `${palette.secondary}80`,
              width: 1,
              style: 2,
              labelBackgroundColor: palette.surface,
            },
          },
          rightPriceScale: {
            borderColor: palette.border,
            scaleMargins: { top: 0.1, bottom: 0.2 },
          },
          timeScale: {
            borderColor: palette.border,
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5,
            barSpacing: 8,
          },
        });

        chartRef.current = chart;

        // Candlestick series for vault TVL / performance
        const candleSeries = chart.addCandlestickSeries({
          upColor: palette.bull,
          downColor: palette.danger,
          borderUpColor: palette.bull,
          borderDownColor: palette.danger,
          wickUpColor: palette.bull,
          wickDownColor: palette.danger,
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
          const time = (now -
            i * day) as import("lightweight-charts").UTCTimestamp;
          const isUp = close >= open;

          candleData.push({ time, open, high, low, close });
          volumeData.push({
            time,
            value: 500 + Math.random() * 2000,
            color: isUp ? `${palette.primary}66` : `${palette.danger}55`,
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
      })
      .catch(() => {
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-border pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="retro-label text-[0.9rem] text-text-primary">
            Vault Performance
          </h3>
          <span className="pill bg-surface-hover text-text-secondary text-[10px]">
            TVL (DOT)
          </span>
          <span className="pill bg-warning/15 text-warning text-[10px]">
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
          <div
            className="absolute inset-0 flex flex-col gap-2 border-[3px] border-border bg-surface p-2 shadow-[3px_3px_0_0_var(--border)]"
            aria-busy="true"
          >
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        )}
        <div
          ref={containerRef}
          className="min-h-[380px] border-[3px] border-border bg-[linear-gradient(180deg,rgba(255,253,242,0.96),rgba(246,239,208,0.96))] p-2 shadow-[3px_3px_0_0_var(--border)]"
          role="img"
          aria-label="Candlestick chart showing vault TVL performance over time (demo data)"
        />
      </div>
    </div>
  );
}
