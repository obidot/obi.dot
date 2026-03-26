"use client";

const PERIODS = ["1D", "1W", "1M", "ALL"] as const;
const DEFAULT_PERIOD = "1M";

export function PnlChart() {
  return (
    <div className="flex-1 p-4 pt-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-border pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="retro-label text-[0.9rem] text-text-primary">
            Vault Performance
          </h3>
          <span className="pill bg-surface-hover text-[10px] text-text-secondary">
            TVL (DOT)
          </span>
          <span className="pill bg-warning/15 text-[10px] text-warning">
            History Pending
          </span>
        </div>
        <div className="tab-group">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              className={`tab-item ${period === DEFAULT_PERIOD ? "active" : ""}`}
              aria-pressed={period === DEFAULT_PERIOD}
              aria-disabled="true"
              disabled
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <output
        className="retro-empty min-h-[380px] border-[3px] border-border p-6 shadow-[3px_3px_0_0_var(--border)]"
        style={{
          background:
            "linear-gradient(180deg, var(--surface) 0%, var(--surface-alt) 100%)",
        }}
        aria-live="polite"
      >
        <div className="max-w-md text-center">
          <p className="retro-label text-[0.85rem] text-text-secondary">
            Performance history is not indexed yet
          </p>
          <p className="mt-3 text-balance text-[14px] leading-relaxed text-text-muted">
            The vault dashboard only shows live accounting today. Historical PnL
            candles will appear here once the indexed performance feed is wired
            into the app.
          </p>
        </div>
      </output>
    </div>
  );
}
