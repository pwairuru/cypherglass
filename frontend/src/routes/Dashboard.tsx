import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QFChart } from "@qfo/qfchart";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import MetricList, { type MetricSummary } from "../components/MetricList";
import PriceChart, { type OhlcBar } from "../components/PriceChart";
import OnchainChart, { type SeriesPoint } from "../components/OnchainChart";
import DrawingPanel from "../components/DrawingPanel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { grainOf, groupMetrics } from "../lib/metricGroups";
import {
  exportDrawings,
  importDrawings,
  loadDrawings,
  saveDrawings,
} from "../lib/drawings";
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

const RANGES = [7, 30, 90, 180, 365] as const;

const GRAIN_LABELS: Record<string, string> = {
  hourly: "Hour",
  daily: "Day",
  weekly: "Week",
};

// Backend returns bar time in ms; QFChart expects unix seconds.
// Unit contract: OhlcBar.time is seconds everywhere downstream of here
// (PriceChart / OnchainChart priceBars assume seconds, never convert).
export const toSecBars = (bars: OhlcBar[]): OhlcBar[] =>
  bars.map((b) => ({ ...b, time: Math.floor(b.time / 1000) }));

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
}: {
  chartKey: string;
  title: string;
  description?: string;
  headerRight?: ReactNode;
  renderChart: (onReady: (chart: QFChart) => void) => ReactNode;
}) {
  const chartRef = useRef<QFChart | null>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const saveCleanup = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [ioError, setIoError] = useState<string | null>(null);

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
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
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
          {description && <p className="chart-desc">{description}</p>}
        </div>
        <div className="chart-filters">
          {headerRight}
          <button
            className="btn"
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFull ? "Exit full" : "Full"}
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
        />
        <div className="chart-fill" style={{ flex: 1 }}>
          {renderChart(handleReady)}
        </div>
      </div>
      <div className="chart-filters" style={{ marginTop: 8 }}>
        <button className="btn" type="button" onClick={handleExport}>
          Export drawings
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => fileRef.current?.click()}
        >
          Import drawings
        </button>
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
      </div>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [grain, setGrain] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [overlay, setOverlay] = useState<"none" | "price">("price");

  const metricsQuery = useQuery({
    queryKey: ["metrics"],
    queryFn: () => apiFetch<MetricSummary[]>("/api/v1/metrics", token ?? undefined),
    enabled: token !== null,
  });

  const coverageQuery = useQuery({
    queryKey: ["coverage"],
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
    queryKey: ["series", activeMetric?.id, from, to],
    queryFn: () =>
      apiFetch<SeriesOut>(
        `/api/v1/metrics/${activeMetric!.id}/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: seriesEnabled,
  });

  // Price hero follows the card grain; the OHLC endpoint serves daily/hourly.
  const priceGrain = grain === "hourly" ? "hourly" : "daily";
  const ohlcQuery = useQuery({
    queryKey: ["ohlc", priceGrain, from, to],
    queryFn: () =>
      apiFetch<OhlcOut>(
        `/api/v1/metrics/price_ohlc_${priceGrain}/ohlc?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: token !== null,
  });

  const priceBars = useMemo(
    () => toSecBars(ohlcQuery.data?.bars ?? []),
    [ohlcQuery.data],
  );
  const overlayBars = overlay === "price" ? priceBars : undefined;

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

  return (
    <div className="dashboard">
      <header>
        <h1>CypherGlass Analytics</h1>
        <div>
          <ThemeSwitcher />
          <button className="btn" type="button" onClick={logout}>
            Sign out
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
        </aside>
        <main className="chart-area" style={{ flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <ChartCard
            chartKey={`price-${priceGrain}`}
            title="BTC/USDT"
            description="Price hero: candles, volume and SMA overlay."
            renderChart={(onReady) => (
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
                    onReady={onReady}
                  />
                )}
              </>
            )}
          />
          {activeMetric && (
            <ChartCard
              chartKey={activeMetric.id}
              title={activeMetric.title}
              description={activeMetric.description}
              headerRight={
                <>
                  {grains.length > 1 && (
                    <label className="filter-label">
                      Grain{" "}
                      <select
                        className="input input-select"
                        aria-label="Grain"
                        value={grain ?? ""}
                        onChange={(e) => setGrain(e.target.value)}
                      >
                        {selectedGroup!.variants.map((v) => {
                          const g = grainOf(v.id);
                          return (
                            <option key={g} value={g}>
                              {GRAIN_LABELS[g] ?? g}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}
                  <label className="filter-label">
                    Range{" "}
                    <select
                      className="input input-select"
                      aria-label="Range"
                      value={rangeDays}
                      onChange={(e) => setRangeDays(Number(e.target.value))}
                    >
                      {RANGES.map((d) => (
                        <option key={d} value={d}>
                          {d}D
                        </option>
                      ))}
                    </select>
                  </label>
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
              renderChart={(onReady) => (
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
                      onReady={onReady}
                    />
                  )}
                </>
              )}
            />
          )}
        </main>
      </div>
    </div>
  );
}
