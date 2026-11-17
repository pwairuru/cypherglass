import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickChart, LineChart, LogOut, Maximize, Maximize2, Minimize, Minimize2 } from "lucide-react";
import type { QFChart } from "@qfo/qfchart";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import MetricList, { type MetricSummary } from "../components/MetricList";
import PriceChart, { type ChartMode, type OhlcBar } from "../components/PriceChart";
import OnchainChart, { type SeriesPoint } from "../components/OnchainChart";
import DrawingPanel from "../components/DrawingPanel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";
import { grainOf, groupMetrics } from "../lib/metricGroups";
import { PRICE_HERO_COPY, RISK_COPY, describeChart, explainMetric } from "../lib/metricCopy";
import {
  exportDrawings,
  importDrawings,
  loadDrawings,
  saveDrawings,
} from "../lib/drawings";
import MiniCard, { OVERVIEW_METRICS, useRiskSummary } from "../components/MiniCard";

const VIEW_TABS = [
  { id: "single", label: "Single" },
  { id: "overview", label: "Overview" },
  { id: "compare", label: "Compare" },
] as const;

type ViewId = (typeof VIEW_TABS)[number]["id"];

const PIN_KEY = "cg-pinned:v1";

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}
import {
  activateChartTool,
  clearChartDrawings,
  restoreDrawings,
  snapshotDrawings,
  undoChartDrawing,
} from "../lib/chartTools";

interface SeriesOut {
  points: SeriesPoint[];
  unit: string;
}

interface OhlcOut {
  bars: OhlcBar[];
}

const RANGES = [
  { label: "1D", days: 1, aria: "1 day" },
  { label: "1W", days: 7, aria: "1 week" },
  { label: "1M", days: 30, aria: "1 month" },
  { label: "3M", days: 90, aria: "3 months" },
  { label: "6M", days: 180, aria: "6 months" },
  { label: "1Y", days: 365, aria: "1 year" },
] as const;

const GRAIN_LABELS: Record<string, string> = {
  hourly: "Hour",
  daily: "Day",
  weekly: "Week",
};

// Compact single-letter grain buttons (full name stays in aria-label).
const GRAIN_SHORT: Record<string, string> = {
  hourly: "H",
  daily: "D",
  weekly: "W",
};

// Backend returns bar time in ms; QFChart renders x labels via
// new Date(m.time), so time MUST stay unix ms everywhere downstream.
// (A seconds conversion here shifts every axis into 1970.)
// Unit contract: OhlcBar.time is ms in PriceChart / OnchainChart / indicators.
// Heuristic: seconds are 10 digits (<1e11), ms are 13 digits (>=1e12).
// Far-future seconds (>2286) would misclassify, but backend never sends those.
export const toMsBars = (bars: OhlcBar[]): OhlcBar[] =>
  bars.map((b) => {
    if (!Number.isFinite(b.time)) return b;
    return { ...b, time: b.time < 1e11 ? b.time * 1000 : b.time };
  });

// Persist drawings on chart change events (chart:updated covers renders after
// drawing gestures; drawing:* covers select/delete flows).
const DRAWING_SAVE_EVENTS = [
  "chart:updated",
  "drawing:deleted",
  "drawing:selected",
  "drawing:deselected",
] as const;

function ChartCard({
  chartKey,
  title,
  description,
  headerRight,
  renderChart,
  supportsCandles = false,
  defaultMode = "line",
}: {
  chartKey: string;
  title: string;
  description?: string;
  headerRight?: ReactNode;
  renderChart: (onReady: (chart: QFChart) => void, mode: ChartMode) => ReactNode;
  /** Show the candles/line toggle (only for charts backed by real OHLC). */
  supportsCandles?: boolean;
  defaultMode?: ChartMode;
}) {
  const chartRef = useRef<QFChart | null>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const saveCleanup = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [ioError, setIoError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChartMode>(defaultMode);

  useEffect(() => {
    const onFs = () =>
      setIsFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Detach chart-event listeners on unmount (ChartCard persists across
  // chart rebuilds, and handleReady re-subscribes on every onReady).
  useEffect(
    () => () => {
      saveCleanup.current?.();
      saveCleanup.current = null;
    },
    [],
  );

  // Stable across renders (deps: chartKey) so chart effects listing onReady
  // in their deps arrays don't rebuild in a loop.
  const handleReady = useCallback((chart: QFChart) => {
    // A rebuilt chart fires onReady again: drop the previous chart's
    // listeners first, otherwise saves duplicate and dead charts leak.
    saveCleanup.current?.();
    chartRef.current = chart;
    restoreDrawings(chart, loadDrawings(chartKey));
    const save = () => saveDrawings(chartKey, snapshotDrawings(chart));
    for (const ev of DRAWING_SAVE_EVENTS) chart.events?.on(ev, save);
    saveCleanup.current = () => {
      for (const ev of DRAWING_SAVE_EVENTS) chart.events?.off?.(ev, save);
    };
  }, [chartKey]);

  const persist = () => {
    const chart = chartRef.current;
    if (chart) saveDrawings(chartKey, snapshotDrawings(chart));
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => setIoError("Could not exit fullscreen."));
    else void el.requestFullscreen().catch(() => setIoError("Fullscreen blocked by browser."));
  };

  const handleExport = () => {
    setIoError(null);
    const json = exportDrawings(chartKey);
    if (!json) {
      setIoError("No saved drawings to export yet.");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chartKey}-drawings.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setIoError(null);
    try {
      importDrawings(chartKey, await file.text());
    } catch {
      setIoError("Import failed: not a valid drawings file.");
      return;
    }
    const chart = chartRef.current;
    if (chart) {
      clearChartDrawings(chart);
      restoreDrawings(chart, loadDrawings(chartKey));
      persist();
    }
  };

  return (
    <section className="chart-card" ref={wrapRef}>
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="chart-filters">
          {headerRight}
          {supportsCandles && (
            <button
              className="btn btn-icon"
              type="button"
              onClick={() => setMode(mode === "candles" ? "line" : "candles")}
              aria-label={mode === "candles" ? "Switch to line chart" : "Switch to candlestick chart"}
              title={mode === "candles" ? "Switch to line chart" : "Switch to candlestick chart"}
              aria-pressed={mode === "candles"}
            >
              {mode === "candles" ? (
                <CandlestickChart size={16} aria-hidden="true" />
              ) : (
                <LineChart size={16} aria-hidden="true" />
              )}
            </button>
          )}
          <button
            className="btn btn-icon"
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFull ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFull ? (
              <Minimize size={16} aria-hidden="true" />
            ) : (
              <Maximize size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, minHeight: 0, flex: 1 }}>
        <DrawingPanel
          chartKey={chartKey}
          onTool={(name) => {
            const chart = chartRef.current;
            if (chart) activateChartTool(chart, name);
          }}
          onClear={() => {
            const chart = chartRef.current;
            if (chart) {
              clearChartDrawings(chart);
              persist();
            }
          }}
          onUndo={() => {
            const chart = chartRef.current;
            if (chart) {
              undoChartDrawing(chart);
              persist();
            }
          }}
          onExport={handleExport}
          onImport={() => fileRef.current?.click()}
        />
        <div className="chart-fill" style={{ flex: 1 }}>
          {renderChart(handleReady, mode)}
        </div>
      </div>
      {description && <p className="chart-desc chart-desc-below">{description}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Import drawings file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />
      {ioError && (
        <span role="alert" className="error">
          {ioError}
        </span>
      )}
    </section>
  );
}

function ChartStatus({
  title,
  loading,
  error,
  empty,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
}) {
  if (loading)
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={`Loading ${title}`}
        className="chart-skeleton"
      >
        <div className="chart-skeleton-bar" />
        <div className="chart-skeleton-plot" />
      </div>
    );
  if (error)
    return (
      <p role="alert" className="error chart-error">
        {error}
      </p>
    );
  if (empty) return <p className="chart-empty">No data for {title}.</p>;
  return null;
}

export default function Dashboard() {
  const { token, logout } = useAuth();
  const { density, setDensity } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [grain, setGrain] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [overlay, setOverlay] = useState<"none" | "price">("price");
  const [view, setView] = useState<ViewId>("single");
  const [pinned, setPinned] = useState<string[]>(() => loadPinned());

  const togglePin = (key: string) => {
    setPinned((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 4);
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const metricsQuery = useQuery({
    queryKey: ["metrics", token],
    queryFn: () => apiFetch<MetricSummary[]>("/api/v1/metrics", token ?? undefined),
    enabled: token !== null,
  });

  const coverageQuery = useQuery({
    queryKey: ["coverage", token],
    queryFn: () =>
      apiFetch<{ min_day: string; max_day: string }>(
        "/api/v1/metrics/coverage",
        token ?? undefined,
      ),
    enabled: token !== null,
    retry: false,
  });

  const metrics = metricsQuery.data ?? [];
  const groups = useMemo(() => groupMetrics(metrics), [metrics]);

  useEffect(() => {
    if (selected === null && groups.length > 0) {
      const first = groups.find((g) => g.variants.some((v) => !v.disabled));
      if (first) setSelected(first.key);
    }
  }, [groups, selected]);

  const selectedGroup = groups.find((g) => g.key === selected) ?? null;

  // Default grain to daily when available, else first variant; reset when
  // the current grain is missing from the newly selected group.
  useEffect(() => {
    if (!selectedGroup) return;
    const grains = selectedGroup.variants.map((v) => grainOf(v.id));
    if (grain === null || !grains.includes(grain)) {
      setGrain(grains.includes("daily") ? "daily" : grains[0]);
    }
  }, [selectedGroup, grain]);

  const activeMetric =
    selectedGroup?.variants.find((v) => grainOf(v.id) === grain) ??
    selectedGroup?.variants.find((v) => !v.disabled) ??
    selectedGroup?.variants[0] ??
    null;
  const seriesEnabled = token !== null && activeMetric !== null && activeMetric.disabled !== true;

  // Anchor range to data era (decoder still syncing early chain).
  const { to, from } = useMemo(() => {
    const anchor = coverageQuery.data?.max_day
      ? new Date(`${coverageQuery.data.max_day}T23:59:59Z`).getTime()
      : Date.now();
    const to = new Date(anchor).toISOString();
    const minT = coverageQuery.data?.min_day
      ? new Date(`${coverageQuery.data.min_day}T00:00:00Z`).getTime()
      : 0;
    const from = new Date(
      Math.max(anchor - rangeDays * 24 * 60 * 60 * 1000, minT),
    ).toISOString();
    return { to, from };
  }, [rangeDays, coverageQuery.data]);

  const seriesQuery = useQuery({
    queryKey: ["series", token, activeMetric?.id, from, to],
    queryFn: () =>
      apiFetch<SeriesOut>(
        `/api/v1/metrics/${activeMetric!.id}/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: seriesEnabled,
  });

  // Price hero follows the card grain; the OHLC endpoint serves daily/hourly.
  // Skip fetch when overlay is off and this isn't a price metric (saves OHLC).
  const priceGrain = grain === "hourly" ? "hourly" : "daily";
  const needOhlc = token !== null && (overlay === "price" || activeMetric?.category === "price");
  const ohlcQuery = useQuery({
    queryKey: ["ohlc", token, priceGrain, from, to],
    queryFn: () =>
      apiFetch<OhlcOut>(
        `/api/v1/metrics/price_ohlc_${priceGrain}/ohlc?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: needOhlc,
  });

  const priceBars = useMemo(
    () => toMsBars(ohlcQuery.data?.bars ?? []),
    [ohlcQuery.data],
  );
  const overlayBars = overlay === "price" ? priceBars : undefined;
  const isPriceMetric = activeMetric?.category === "price";

  const grains = selectedGroup?.variants.map((v) => grainOf(v.id)) ?? [];
  const seriesError =
    seriesQuery.isError && seriesEnabled
      ? seriesQuery.error instanceof Error
        ? seriesQuery.error.message
        : "Failed to load series"
      : null;
  const ohlcError =
    ohlcQuery.isError
      ? ohlcQuery.error instanceof Error
        ? ohlcQuery.error.message
        : "Failed to load price bars"
      : null;

  const risk = useRiskSummary(token, from, to);
  const pinnedGroups = pinned
    .map((k) => groups.find((g) => g.key === k))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const metricById = useMemo(() => {
    const m = new Map<string, MetricSummary>();
    for (const item of metrics) m.set(item.id, item);
    return m;
  }, [metrics]);

  const seriesPoints = seriesQuery.data?.points ?? [];
  const seriesUnit = seriesQuery.data?.unit ?? activeMetric?.unit ?? "";
  const mainDescription = activeMetric
    ? seriesPoints.length > 0
      ? describeChart({
          metricId: activeMetric.id,
          category: activeMetric.category,
          backendDesc: activeMetric.description,
          points: seriesPoints,
          unit: seriesUnit,
        })
      : explainMetric(activeMetric.id, activeMetric.category, activeMetric.description)
    : undefined;

  return (
    <div className="dashboard">
      <header>
        <h1>CypherGlass Analytics</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="chart-segmented" role="group" aria-label="View">
            {VIEW_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn-segmented${view === t.id ? " is-active" : ""}`}
                aria-pressed={view === t.id}
                onClick={() => setView(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="chart-meta" aria-label={`${metrics.length} metrics`}>
            {metrics.length} metrics
          </span>
          <ThemeSwitcher />
          <button
            className="btn btn-icon"
            type="button"
            aria-pressed={density === "compact"}
            aria-label={density === "compact" ? "Roomy density" : "Compact density"}
            title={density === "compact" ? "Roomy density" : "Compact density"}
            onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
          >
            {density === "compact" ? (
              <Maximize2 size={16} aria-hidden="true" />
            ) : (
              <Minimize2 size={16} aria-hidden="true" />
            )}
          </button>
          <button
            className="btn btn-icon"
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={logout}
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {metricsQuery.isPending && <p>Loading metrics…</p>}
      {metricsQuery.isError && (
        <p className="error">
          {metricsQuery.error instanceof Error ? metricsQuery.error.message : "Failed to load metrics"}
        </p>
      )}
      <div className="dashboard-body">
        <aside className="metric-rail">
          <MetricList metrics={metrics} selected={selected} onSelect={setSelected} />
          {selectedGroup && (
            <button
              type="button"
              className="btn"
              onClick={() => togglePin(selectedGroup.key)}
              aria-pressed={pinned.includes(selectedGroup.key)}
              title="Pin to Compare (max 4)"
              style={{ marginTop: 8 }}
            >
              {pinned.includes(selectedGroup.key) ? "Unpin from Compare" : "Pin to Compare"}
            </button>
          )}
          {pinned.length > 0 && (
            <p className="chart-meta">Pinned: {pinned.join(", ")}</p>
          )}
        </aside>
        <main className="chart-area" style={{ flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {view === "overview" && (
            <>
              <section className="chart-card" aria-label="Market risk">
                <div className="chart-head">
                  <div>
                    <h2>Market risk {risk.latest !== null ? `${risk.latest.toFixed(1)}/100` : "—"}</h2>
                  </div>
                  <span className="chart-meta">{risk.regime}</span>
                </div>
                <p className="chart-desc chart-desc-below">
                  {RISK_COPY}
                </p>
              </section>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {OVERVIEW_METRICS.map((m) => {
                  const meta = metricById.get(m.id);
                  return (
                    <MiniCard
                      key={m.id}
                      metricId={m.id}
                      title={m.title}
                      category={meta?.category}
                      description={meta?.description}
                      token={token}
                      from={from}
                      to={to}
                      priceBars={undefined}
                    />
                  );
                })}
              </div>
            </>
          )}
          {view === "compare" && (
            <>
              {pinnedGroups.length === 0 && <p>Pin up to 4 metric groups from the left rail to compare them side-by-side.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {pinnedGroups.map((g) => {
                  const best = g.variants.find((v) => grainOf(v.id) === "daily") ?? g.variants.find((v) => !v.disabled) ?? g.variants[0];
                  return <MiniCard key={g.key} metricId={best.id} title={g.label} category={best.category} description={best.description} token={token} from={from} to={to} priceBars={overlayBars} />;
                })}
              </div>
            </>
          )}
          {view === "single" && (
          <>
          {isPriceMetric && (
          <ChartCard
            chartKey={`price-${priceGrain}`}
            title="BTC/USDT"
            description={PRICE_HERO_COPY}
            supportsCandles
            defaultMode="candles"
            renderChart={(onReady, mode) => (
              <>
                <ChartStatus
                  title="BTC/USDT"
                  loading={ohlcQuery.isPending && token !== null}
                  error={ohlcError}
                  empty={!ohlcQuery.isPending && priceBars.length === 0 && ohlcError === null}
                />
                {priceBars.length > 0 && (
                  <PriceChart
                    bars={priceBars}
                    chartKey={`price-${priceGrain}`}
                    mode={mode}
                    onReady={onReady}
                  />
                )}
              </>
            )}
          />
          )}
          {activeMetric && !isPriceMetric && (
            <ChartCard
              chartKey={activeMetric.id}
              title={activeMetric.title}
              description={mainDescription}
              supportsCandles={overlay === "price" && (overlayBars?.length ?? 0) > 0}
              defaultMode="line"
              headerRight={
                <>
                  {grains.length > 1 && (
                    <div className="filter-label">
                      <span aria-hidden="true">Grain</span>
                      <div className="chart-segmented" role="group" aria-label="Grain">
                        {selectedGroup!.variants.map((v) => {
                          const g = grainOf(v.id);
                          return (
                            <button
                              key={g}
                              type="button"
                              className={`btn-segmented${grain === g ? " is-active" : ""}`}
                              aria-label={GRAIN_LABELS[g] ?? g}
                              aria-pressed={grain === g}
                              onClick={() => setGrain(g)}
                            >
                              {GRAIN_SHORT[g] ?? g}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="filter-label">
                    <span aria-hidden="true">Range</span>
                    <div className="chart-segmented" role="group" aria-label="Range">
                      {RANGES.map((r) => (
                        <button
                          key={r.days}
                          type="button"
                          className={`btn-segmented${rangeDays === r.days ? " is-active" : ""}`}
                          aria-label={r.aria}
                          aria-pressed={rangeDays === r.days}
                          onClick={() => setRangeDays(r.days)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="filter-label">
                    Overlay{" "}
                    <select
                      className="input input-select"
                      aria-label="Overlay"
                      value={overlay}
                      onChange={(e) => setOverlay(e.target.value as "none" | "price")}
                    >
                      <option value="price">Price</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                </>
              }
              renderChart={(onReady, mode) => (
                <>
                  <ChartStatus
                    title={activeMetric.title}
                    loading={seriesQuery.isPending && seriesEnabled}
                    error={seriesError}
                    empty={
                      !seriesQuery.isPending &&
                      (seriesQuery.data?.points.length ?? 0) === 0 &&
                      seriesError === null
                    }
                  />
                  {(seriesQuery.data?.points.length ?? 0) > 0 && (
                    <OnchainChart
                      chartKey={activeMetric.id}
                      title={activeMetric.title}
                      points={seriesQuery.data!.points}
                      priceBars={overlayBars}
                      mode={mode}
                      onReady={onReady}
                    />
                  )}
                </>
              )}
            />
          )}
          </>
          )}
        </main>
      </div>
    </div>
  );
}
