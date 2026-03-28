"use client";

import {
  type CandlestickData,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  Activity,
  CandlestickChart,
  ChartColumn,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type PriceHistoryWindow,
  usePriceHistory,
} from "@/hooks/use-price-history";
import { cn } from "@/lib/format";
import { TOKENS, tokenColor } from "@/shared/trade/swap";

type PairPreset = {
  key: string;
  tokenIn: string;
  tokenOut: string;
  label: string;
  volumeLabel: string;
};

const PAIR_PRESETS: PairPreset[] = [
  {
    key: "tdot-tusdc",
    tokenIn: TOKENS[0]?.address ?? "",
    tokenOut: TOKENS[1]?.address ?? "",
    label: "tDOT / tUSDC",
    volumeLabel: "tDOT",
  },
  {
    key: "teth-tusdc",
    tokenIn: TOKENS[2]?.address ?? "",
    tokenOut: TOKENS[1]?.address ?? "",
    label: "tETH / tUSDC",
    volumeLabel: "tETH",
  },
  {
    key: "tka-tkb",
    tokenIn: TOKENS[3]?.address ?? "",
    tokenOut: TOKENS[4]?.address ?? "",
    label: "TKA / TKB",
    volumeLabel: "TKA",
  },
].filter((pair) => pair.tokenIn && pair.tokenOut);

const WINDOWS: PriceHistoryWindow[] = ["24H", "7D"];

function formatDecimal(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "n/a";

  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: value < 10 ? Math.min(2, digits) : 0,
  });
}

function formatSignedPercent(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function toNumeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="metric-cell flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center border-[3px] border-border",
          tone,
        )}
      >
        {icon}
      </div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value mt-3 text-[1.35rem]">{value}</p>
      </div>
    </div>
  );
}

export function PriceHistoryPanel() {
  const [selectedPairKey, setSelectedPairKey] = useState(
    PAIR_PRESETS[0]?.key ?? "",
  );
  const [selectedWindow, setSelectedWindow] =
    useState<PriceHistoryWindow>("24H");
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Callback ref: called when the chart container enters/leaves the DOM.
  // Fixes the bug where useEffect([], []) ran while the container div was not
  // yet mounted (guarded behind the data conditional), leaving chartRef null forever.
  const chartContainerRef = useCallback((container: HTMLDivElement | null) => {
    if (!container) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(120, 132, 146, 0.95)",
      },
      grid: {
        vertLines: { color: "rgba(109, 125, 143, 0.12)" },
        horzLines: { color: "rgba(109, 125, 143, 0.12)" },
      },
      crosshair: {
        vertLine: { color: "rgba(35, 206, 107, 0.35)" },
        horzLine: { color: "rgba(35, 206, 107, 0.35)" },
      },
      rightPriceScale: {
        borderColor: "rgba(109, 125, 143, 0.2)",
      },
      timeScale: {
        borderColor: "rgba(109, 125, 143, 0.2)",
        timeVisible: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#23ce6b",
      downColor: "#ff6b6b",
      wickUpColor: "#23ce6b",
      wickDownColor: "#ff6b6b",
      borderVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
  }, []);

  const selectedPair =
    PAIR_PRESETS.find((pair) => pair.key === selectedPairKey) ??
    PAIR_PRESETS[0];

  const { data, isLoading, error, isFetching } = usePriceHistory(
    selectedPair?.tokenIn ?? "",
    selectedPair?.tokenOut ?? "",
    selectedWindow,
  );

  const chartData = useMemo<CandlestickData<Time>[]>(() => {
    return (data ?? [])
      .map((bar) => {
        const open = toNumeric(bar.open);
        const high = toNumeric(bar.high);
        const low = toNumeric(bar.low);
        const close = toNumeric(bar.close);
        if (open === null || high === null || low === null || close === null) {
          return null;
        }

        return {
          time: bar.timestamp as Time,
          open,
          high,
          low,
          close,
        };
      })
      .filter((bar): bar is CandlestickData<Time> => bar !== null);
  }, [data]);

  const summary = useMemo(() => {
    if (!data?.length) return null;

    const first = data[0];
    const last = data[data.length - 1];
    if (!first || !last) return null;

    const firstOpen = toNumeric(first.open);
    const lastClose = toNumeric(last.close);
    if (firstOpen === null || lastClose === null || firstOpen === 0) {
      return null;
    }

    const highs = data
      .map((bar) => toNumeric(bar.high))
      .filter((value) => value !== null);
    const lows = data
      .map((bar) => toNumeric(bar.low))
      .filter((value) => value !== null);
    const totalVolumeIn = data.reduce(
      (sum, bar) => sum + (toNumeric(bar.volumeIn) ?? 0),
      0,
    );
    const totalTrades = data.reduce((sum, bar) => sum + bar.trades, 0);

    return {
      lastClose,
      changePct: ((lastClose - firstOpen) / firstOpen) * 100,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      totalVolumeIn,
      totalTrades,
    };
  }, [data]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  if (!selectedPair) {
    return (
      <div className="panel retro-empty">
        <p className="font-mono text-sm text-danger">
          Price-history presets are unavailable.
        </p>
      </div>
    );
  }

  const accent = tokenColor(
    selectedPair.label.split(" / ")[0] ?? selectedPair.label,
  );

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="panel-header-block">
          <div className={cn("panel-header-icon", accent.circle)}>
            <CandlestickChart className={cn("h-4 w-4", accent.text)} />
          </div>
          <div className="panel-heading">
            <span className="panel-kicker">Indexed Price Feed</span>
            <h3 className="panel-title">Price History</h3>
            <p className="panel-subtitle">
              Hourly OHLCV bars pulled from `obi.index` for the most active
              testnet pairs.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="tab-group">
            {PAIR_PRESETS.map((pair) => (
              <button
                key={pair.key}
                type="button"
                onClick={() => setSelectedPairKey(pair.key)}
                className={cn(
                  "tab-item",
                  pair.key === selectedPair.key && "active",
                )}
              >
                {pair.label}
              </button>
            ))}
          </div>
          <div className="tab-group">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => setSelectedWindow(window)}
                className={cn(
                  "tab-item",
                  selectedWindow === window && "active",
                )}
              >
                {window}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="retro-empty min-h-[320px]">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : error ? (
        <div className="retro-empty min-h-[320px]">
          <p className="font-mono text-sm text-danger">
            Failed to load indexed price history
          </p>
          <p className="mt-2 max-w-md text-center text-sm text-text-muted">
            {error.message}
          </p>
        </div>
      ) : !data?.length ? (
        <div className="retro-empty min-h-[320px]">
          <p className="font-mono text-sm text-text-secondary">
            No indexed candles for this pair yet
          </p>
          <p className="mt-2 max-w-md text-center text-sm text-text-muted">
            The chart will populate once swap executions have been indexed for
            this window.
          </p>
        </div>
      ) : (
        <>
          <div className="metric-grid grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Last Price"
              value={summary ? formatDecimal(summary.lastClose, 5) : "n/a"}
              tone="bg-primary/10"
            />
            <StatCard
              icon={<Activity className="h-4 w-4 text-accent" />}
              label="Window Change"
              value={summary ? formatSignedPercent(summary.changePct) : "n/a"}
              tone="bg-accent/10"
            />
            <StatCard
              icon={<ChartColumn className="h-4 w-4 text-secondary" />}
              label={`Volume (${selectedPair.volumeLabel})`}
              value={summary ? formatDecimal(summary.totalVolumeIn, 2) : "n/a"}
              tone="bg-secondary/10"
            />
            <StatCard
              icon={<CandlestickChart className="h-4 w-4 text-warning" />}
              label="Trades"
              value={summary ? summary.totalTrades.toLocaleString() : "n/a"}
              tone="bg-warning/10"
            />
          </div>

          <div className="border-t-[3px] border-border px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill bg-surface-hover text-[10px] text-text-secondary">
                  {selectedPair.label}
                </span>
                <span className="pill bg-primary/10 text-[10px] text-primary">
                  {selectedWindow} window
                </span>
                {isFetching ? (
                  <span className="pill bg-accent/10 text-[10px] text-accent">
                    Refreshing
                  </span>
                ) : null}
              </div>
              <div className="font-mono text-xs text-text-muted">
                High{" "}
                {summary?.high != null ? formatDecimal(summary.high, 5) : "n/a"}{" "}
                · Low{" "}
                {summary?.low != null ? formatDecimal(summary.low, 5) : "n/a"}
              </div>
            </div>
            <div
              ref={chartContainerRef}
              className="min-h-[320px] border-[3px] border-border bg-surface px-2 py-2 shadow-[3px_3px_0_0_var(--border)]"
            />
          </div>
        </>
      )}
    </div>
  );
}
