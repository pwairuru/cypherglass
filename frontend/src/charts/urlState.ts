import type { ChartSpec, ChartState } from "./types";
import { isRangePreset, type RangePreset } from "./ranges";

const GRAINS = ["auto", "hourly", "daily", "weekly", "monthly"] as const;

export function defaultChartState(spec: ChartSpec): ChartState {
  const right = spec.axes.find((a) => a.id === "right");
  return {
    range: "all",
    grain: "auto",
    variant: spec.variants[0]?.id,
    logLeft: false,
    logRight: right?.scale === "log",
    percent: false,
    hidden: spec.series
      .filter((s) => s.hiddenByDefault && s.metric)
      .map((s) => s.metric as string),
    series: [],
    timezone: "utc",
    showHalvings: spec.annotations.includes("halvings"),
    showThresholds: spec.controls.includes("thresholds"),
  };
}

function split(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseChartState(search: string, spec: ChartSpec): ChartState {
  const defaults = defaultChartState(spec);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const rangeRaw = params.get("range");
  const range: RangePreset =
    rangeRaw && isRangePreset(rangeRaw) ? rangeRaw : defaults.range;

  const grainRaw = params.get("grain");
  const grain = (GRAINS as readonly string[]).includes(grainRaw ?? "")
    ? (grainRaw as ChartState["grain"])
    : defaults.grain;

  const variantRaw = params.get("variant");
  const variant = spec.variants.some((v) => v.id === variantRaw)
    ? (variantRaw as string)
    : defaults.variant;

  const log = split(params.get("log"));
  const logLeft = params.has("log") ? log.includes("left") : defaults.logLeft;
  const logRight = params.has("log") ? log.includes("right") : defaults.logRight;

  const knownMetrics = new Set([
    ...spec.metrics,
    ...spec.series.map((s) => s.metric).filter((s): s is string => Boolean(s)),
  ]);
  const series = split(params.get("series")).filter((m) => knownMetrics.has(m));
  const hidden = split(params.get("hidden"));

  const tz = params.get("tz") === "local" ? "local" : "utc";

  return {
    range,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    grain,
    variant,
    logLeft,
    logRight,
    percent: params.get("percent") === "1",
    hidden,
    series,
    timezone: tz,
    showHalvings: params.has("halvings")
      ? params.get("halvings") !== "0"
      : defaults.showHalvings,
    showThresholds: params.has("thresholds")
      ? params.get("thresholds") !== "0"
      : defaults.showThresholds,
    layout: params.get("layout") ?? undefined,
  };
}

export function serializeChartState(state: ChartState): string {
  const params = new URLSearchParams();
  params.set("range", state.range);
  if (state.range === "custom") {
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
  }
  if (state.grain !== "auto") params.set("grain", state.grain);
  if (state.variant) params.set("variant", state.variant);
  const log = [state.logLeft ? "left" : "", state.logRight ? "right" : ""].filter(Boolean);
  if (log.length > 0) params.set("log", log.join(","));
  if (state.percent) params.set("percent", "1");
  if (state.hidden.length > 0) params.set("hidden", state.hidden.join(","));
  if (state.series.length > 0) params.set("series", state.series.join(","));
  if (state.timezone === "local") params.set("tz", "local");
  if (!state.showHalvings) params.set("halvings", "0");
  if (!state.showThresholds) params.set("thresholds", "0");
  if (state.layout) params.set("layout", state.layout);
  return params.toString();
}

/** Copyable absolute URL for the current chart state. */
export function chartShareUrl(chartId: string, state: ChartState): string {
  const base =
    typeof window === "undefined"
      ? `http://localhost/charts/${chartId}`
      : `${window.location.origin}/charts/${chartId}`;
  return `${base}?${serializeChartState(state)}`;
}
