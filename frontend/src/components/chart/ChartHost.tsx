import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Maximize, Minimize, Share2, Camera, Download, Bell, Save } from "lucide-react";
import { getChart } from "../../charts/registry";
import { RANGE_PRESETS, autoGrain, type RangePreset, effectiveRange } from "../../charts/ranges";
import { parseChartState, serializeChartState, chartShareUrl } from "../../charts/urlState";
import type { ChartState } from "../../charts/types";
import { fetchChartCsv } from "../../charts/data";
import { useChartData } from "../../hooks/useChartData";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import TimeSeriesRenderer from "../../charts/renderers/TimeSeriesRenderer";
import DistributionRenderer from "../../charts/renderers/DistributionRenderer";
import PriceDistributionRenderer, {
  HeatmapRenderer,
  ScatterRenderer,
} from "../../charts/renderers/PriceDistributionRenderer";
import TableRenderer from "../../charts/renderers/TableRenderer";
import GaugeRenderer from "../../charts/renderers/GaugeRenderer";
import DashboardRenderer from "../../charts/renderers/DashboardRenderer";
import type { EChartHandle } from "../../charts/renderers/EChart";
import VariantTabs from "./VariantTabs";
import Legend from "./Legend";
import EmptyState from "./EmptyState";

const GRAINS = [
  ["auto", "Auto"],
  ["hourly", "Hour"],
  ["daily", "Day"],
  ["weekly", "Week"],
  ["monthly", "Month"],
] as const;

function TimeSeriesSwitch({ spec, data, state, onReady }: {
  spec: NonNullable<ReturnType<typeof getChart>>;
  data: NonNullable<ReturnType<typeof useChartData>["data"]>;
  state: ChartState;
  onReady: (handle: EChartHandle | null) => void;
}) {
  switch (spec.archetype) {
    case "dashboard_grid":
      return <DashboardRenderer spec={spec} data={data} state={state} />;
    case "table":
      return <TableRenderer spec={spec} data={data} state={state} />;
    case "heatmap":
      if (spec.id === "technical.monthly_returns") {
        return <TableRenderer spec={spec} data={data} state={state} />;
      }
      if (state.variant === "line") {
        return <TimeSeriesRenderer spec={spec} data={data} state={state} onReady={onReady} />;
      }
      return <HeatmapRenderer spec={spec} data={data} state={state} onReady={onReady} />;
    case "distribution_histogram":
      return <DistributionRenderer spec={spec} data={data} state={state} onReady={onReady} />;
    case "price_distribution":
      return <PriceDistributionRenderer spec={spec} data={data} state={state} onReady={onReady} />;
    case "scatter":
      return <ScatterRenderer spec={spec} data={data} state={state} onReady={onReady} />;
    case "gauge_composite":
      return <GaugeRenderer spec={spec} data={data} state={state} onReady={onReady} />;
    default:
      return <TimeSeriesRenderer spec={spec} data={data} state={state} onReady={onReady} />;
  }
}

export default function ChartHost({ chartId }: { chartId: string }) {
  const spec = getChart(chartId);
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(
    () => (spec ? parseChartState(searchParams.toString(), spec) : null),
    [searchParams, spec],
  );
  const [handle, setHandle] = useState<EChartHandle | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState("1");
  const [alertKind, setAlertKind] = useState("cross_up");
  const [alertMetric, setAlertMetric] = useState<string>("");
  const wrapRef = useRef<HTMLElement>(null);
  const [isFull, setIsFull] = useState(false);
  const { token } = useAuth();

  const range = state ? effectiveRange(state) : { from: null, to: null };
  const request = useMemo(
    () => ({
      variant: state?.variant,
      from: range.from,
      to: range.to,
      grain:
        state?.grain === "auto" ? autoGrain(state?.range ?? "all") : state?.grain ?? "auto",
      metrics: state?.series.length ? state.series : undefined,
    }),
    [state?.variant, state?.grain, state?.series, range.from, range.to],
  );
  const enabled = Boolean(spec && (spec.metrics.length > 0 || spec.series.length > 0));
  const query = useChartData(chartId, request, enabled);

  const update = useCallback(
    (patch: Partial<ChartState>) => {
      if (!state) return;
      setSearchParams(serializeChartState({ ...state, ...patch }), { replace: true });
    },
    [state, setSearchParams],
  );

  if (!spec || !state) {
    return <EmptyState title="Chart not found" detail="Pick another chart from the catalog." />;
  }

  const toggleHidden = (metric: string) =>
    update({
      hidden: state.hidden.includes(metric)
        ? state.hidden.filter((m) => m !== metric)
        : [...state.hidden, metric],
    });

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onScreenshot = () => {
    if (!handle) {
      setMessage("Screenshot is not ready yet.");
      return;
    }
    const url = handle.getDataURL();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chartId.replace(/\./g, "-")}.png`;
    a.click();
  };

  const onCsv = async () => {
    try {
      const csv = await fetchChartCsv(chartId, request, token ?? undefined);
      download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${chartId.replace(/\./g, "-")}.csv`);
      setMessage("CSV exported.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "CSV export failed.");
    }
  };

  const onShare = async () => {
    const url = chartShareUrl(chartId, state);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Share link copied.");
    } catch {
      setMessage(url);
    }
  };

  const onSaveLayout = async () => {
    const name = `${spec.title} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    try {
      if (token) {
        await apiFetch("/api/v1/charts/layouts", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, chart_id: chartId, spec: state }),
        });
        setMessage("Layout saved.");
      } else {
        const key = "cg-chart-layouts";
        const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
        saved.push({ name, chart_id: chartId, spec: state });
        localStorage.setItem(key, JSON.stringify(saved.slice(-30)));
        setMessage("Layout saved locally.");
      }
    } catch {
      setMessage("Could not save layout.");
    }
  };

  const onCreateAlert = async () => {
    const metric = alertMetric || query.data?.series[0]?.metric || spec.defaultMetric;
    if (!metric) {
      setMessage("This chart has no ingested metric to alert on.");
      return;
    }
    try {
      await apiFetch("/api/v1/alerts", token ?? undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chart_id: chartId,
          metric_id: metric,
          rule: { kind: alertKind, threshold: Number(alertThreshold) },
          delivery: { in_app: true },
          cooldown_seconds: 3600,
        }),
      });
      setAlertOpen(false);
      setMessage("Alert created.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create alert.");
    }
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().then(() => setIsFull(false)).catch(() => undefined);
    } else {
      void el.requestFullscreen().then(() => setIsFull(true)).catch(() => setMessage("Fullscreen blocked."));
    }
  };

  const dataRequired = spec.newMetrics.length > 0 && (!query.data || query.data.series.length === 0);

  return (
    <article className="chart-page" ref={wrapRef}>
      <header className="chart-page-head">
        <div>
          <p className="chart-breadcrumb">
            {spec.category} / {spec.archetype.replace(/_/g, " ")}
          </p>
          <h1>{spec.title}</h1>
          <p className="chart-question">{spec.question}</p>
        </div>
        <div className="chart-badges">
          <span className="badge">{spec.dataFreshness}</span>
          <span className={`badge status-${spec.status}`}>{spec.status}</span>
          {spec.priority === "P0" && <span className="badge badge-p0">P0</span>}
        </div>
      </header>

      <div className="chart-toolbar" role="toolbar" aria-label="Chart controls">
        <VariantTabs
          variants={spec.variants}
          active={state.variant}
          onChange={(variant) => update({ variant, series: [] })}
        />
        <div className="chart-range" role="group" aria-label="Time range">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`btn-segmented${state.range === r.id ? " is-active" : ""}`}
              aria-pressed={state.range === r.id}
              onClick={() => update({ range: r.id as RangePreset, from: undefined, to: undefined })}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className={`btn-segmented${state.range === "custom" ? " is-active" : ""}`}
            onClick={() => update({ range: "custom" })}
          >
            Custom
          </button>
        </div>
        {state.range === "custom" && (
          <div className="chart-custom-range">
            <label>
              From
              <input
                type="date"
                value={state.from ?? ""}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={state.to ?? ""}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
          </div>
        )}
        <label className="chart-select">
          Grain
          <select value={state.grain} onChange={(e) => update({ grain: e.target.value as ChartState["grain"] })}>
            {GRAINS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`btn-segmented${state.logLeft ? " is-active" : ""}`}
          aria-pressed={state.logLeft}
          onClick={() => update({ logLeft: !state.logLeft })}
        >
          Log left
        </button>
        {spec.axes.some((a) => a.id === "right") && (
          <button
            type="button"
            className={`btn-segmented${state.logRight ? " is-active" : ""}`}
            aria-pressed={state.logRight}
            onClick={() => update({ logRight: !state.logRight })}
          >
            Log right
          </button>
        )}
        {spec.controls.includes("percent_mode") && (
          <button
            type="button"
            className={`btn-segmented${state.percent ? " is-active" : ""}`}
            aria-pressed={state.percent}
            onClick={() => update({ percent: !state.percent })}
          >
            % mode
          </button>
        )}
        {spec.annotations.includes("halvings") && (
          <button
            type="button"
            className={`btn-segmented${state.showHalvings ? " is-active" : ""}`}
            aria-pressed={state.showHalvings}
            onClick={() => update({ showHalvings: !state.showHalvings })}
          >
            Halvings
          </button>
        )}
        {spec.controls.includes("thresholds") && (
          <button
            type="button"
            className={`btn-segmented${state.showThresholds ? " is-active" : ""}`}
            aria-pressed={state.showThresholds}
            onClick={() => update({ showThresholds: !state.showThresholds })}
          >
            Thresholds
          </button>
        )}
        <div className="chart-actions">
          <button type="button" className="btn-icon" onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen">
            {isFull ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button type="button" className="btn-icon" onClick={onScreenshot} aria-label="Screenshot" title="Screenshot">
            <Camera size={16} />
          </button>
          <button type="button" className="btn-icon" onClick={onCsv} aria-label="Export CSV" title="Export CSV">
            <Download size={16} />
          </button>
          <button type="button" className="btn-icon" onClick={onShare} aria-label="Share link" title="Copy share link">
            <Share2 size={16} />
          </button>
          <button type="button" className="btn-icon" onClick={onSaveLayout} aria-label="Save layout" title="Save layout">
            <Save size={16} />
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setAlertOpen((v) => !v)}
            aria-label="Create alert"
            title="Create alert"
          >
            <Bell size={16} />
          </button>
        </div>
      </div>

      {alertOpen && (
        <div className="chart-alert-form">
          <label>
            Series
            <select value={alertMetric} onChange={(e) => setAlertMetric(e.target.value)}>
              <option value="">Default</option>
              {(query.data?.series ?? []).map((s) => (
                <option key={s.metric} value={s.metric}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rule
            <select value={alertKind} onChange={(e) => setAlertKind(e.target.value)}>
              <option value="above">Above</option>
              <option value="below">Below</option>
              <option value="cross_up">Cross up</option>
              <option value="cross_down">Cross down</option>
              <option value="pct_change">% change</option>
            </select>
          </label>
          <label>
            Threshold
            <input
              type="number"
              step="any"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
            />
          </label>
          <button type="button" className="btn" onClick={onCreateAlert}>
            Create alert
          </button>
        </div>
      )}

      {message && (
        <p className="chart-message" role="status">
          {message}
        </p>
      )}

      {query.isLoading && <p className="chart-loading">Loading chart…</p>}
      {query.isError && (
        <EmptyState
          title="Chart data unavailable"
          detail={query.error instanceof Error ? query.error.message : "Request failed."}
          action={
            <button type="button" className="btn" onClick={() => void query.refetch()}>
              Retry
            </button>
          }
        />
      )}

      {!query.isLoading && !query.isError && dataRequired && (
        <EmptyState
          title="Data not ingested yet"
          detail={`This chart is designed and catalogued, but requires: ${spec.newMetrics.join(
            ", ",
          )}. The catalog keeps the page addressable so the contract is testable before ingest ships.`}
        />
      )}

      {!query.isLoading && !query.isError && !dataRequired && query.data && (
        <>
          {query.data.series.length === 0 ? (
            <EmptyState
              title="No rows in this range"
              detail="Try All history, a wider custom range, or check the ingestion status for this metric."
            />
          ) : (
            <TimeSeriesSwitch spec={spec} data={query.data} state={state} onReady={setHandle} />
          )}
          <Legend series={query.data.series} hidden={state.hidden} onToggle={toggleHidden} />
        </>
      )}

      <footer className="chart-page-foot">
        <div>
          <h2>How to read</h2>
          <p>{spec.expected.join(" ")}</p>
          {spec.newMetrics.length > 0 && (
            <p className="chart-data-note">
              <strong>Data requirement:</strong> {spec.newMetrics.join(", ")}
            </p>
          )}
        </div>
        <div>
          <h2>Parity</h2>
          <p>{spec.parity.join(", ") || "CypherGlass native"}</p>
          <p className="chart-meta">{spec.acceptance.length} acceptance checks</p>
        </div>
      </footer>
    </article>
  );
}
