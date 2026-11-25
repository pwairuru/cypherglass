import type { QFChart } from "@qfo/qfchart";

/** Read a space-syntax HSL var (e.g. "217 91% 60%") and return comma-syntax
 *  `hsl(217, 91%, 60%)`. ECharts/zrender strips whitespace before parsing, so
 *  space-syntax colors corrupt on hover emphasis (series goes invisible).
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  if (v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl")) return v;
  if (v.includes(",")) return `hsl(${v})`;
  return `hsl(${v.split(/\s+/).join(", ")})`;
}

/**
 * CypherGlass brand chart theme.
 *
 * One palette for all charts so price, onchain and compare cards read as
 * the same product. Teal carries the selected metric, amber carries the
 * BTC price overlay, violet carries averages. Candles stay close to
 * TradingView green/red so regulars feel at home.
 */
export const CYPHERGLASS_FALLBACKS = {
  metric: "#0EA5A0",
  price: "#F59E0B",
  sma: "#8B5CF6",
  up: "#26A69A",
  down: "#EF5350",
  grid: "rgba(148, 163, 184, 0.18)",
  text: "#64748B",
  lastPrice: "#0EA5A0",
} as const;

export function metricLineColor(): string {
  return cssVar("--cg-metric", CYPHERGLASS_FALLBACKS.metric);
}

export function priceLineColor(): string {
  return cssVar("--cg-price", CYPHERGLASS_FALLBACKS.price);
}

export function smaLineColor(): string {
  return cssVar("--cg-sma", CYPHERGLASS_FALLBACKS.sma);
}

export function candleUpColor(): string {
  return cssVar("--cg-up", CYPHERGLASS_FALLBACKS.up);
}

export function candleDownColor(): string {
  return cssVar("--cg-down", CYPHERGLASS_FALLBACKS.down);
}

export function gridLineColor(): string {
  return cssVar("--cg-grid", CYPHERGLASS_FALLBACKS.grid);
}

export function chartTextColor(): string {
  return cssVar("--cg-text", CYPHERGLASS_FALLBACKS.text);
}

export interface CypherGlassChartOptions {
  upColor: string;
  downColor: string;
  fontColor: string;
  backgroundColor: string;
  fontFamily: string;
  grid: { show: boolean; lineColor: string; lineOpacity: number; borderShow: boolean };
  lastPriceLine: { visible: boolean; color: string; lineStyle: "dashed" };
  layout: { left: string; right: string };
  dataZoom: { visible: boolean; zoomOnTouch: boolean; pannable: boolean };
}

/** Shared QFChart options for every CypherGlass chart. */
export function cypherGlassChartOptions(lineMode: boolean): CypherGlassChartOptions {
  const base = {
    backgroundColor: "transparent",
    fontColor: chartTextColor(),
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    grid: {
      show: true,
      lineColor: gridLineColor(),
      lineOpacity: 1,
      borderShow: false,
    },
    lastPriceLine: {
      visible: true,
      color: cssVar("--cg-metric", CYPHERGLASS_FALLBACKS.lastPrice),
      lineStyle: "dashed" as const,
    },
    layout: { left: "2%", right: "7%" },
    // Slider hidden, but inside zoom stays live: wheel zooms time, drag pans.
    dataZoom: { visible: false, zoomOnTouch: true, pannable: true },
  };
  if (lineMode) {
    return {
      ...base,
      upColor: "transparent",
      downColor: "transparent",
    };
  }
  return {
    ...base,
    upColor: candleUpColor(),
    downColor: candleDownColor(),
  };
}

/** Line width scale shared by all indicators. Thin enough to stay readable. */
export const CYPHERGLASS_LINE_WIDTH = {
  metric: 2,
  overlay: 1.5,
  average: 1.5,
} as const;

// Keep the old default import surface small: callers that only need cssVar
// keep working, new charts use the helpers above.
export function applyBrandToChart(_chart: QFChart): void {
  // Brand lives in QFChart constructor options + per-indicator colors.
  // No post-hoc mutation needed today; helper kept so call sites read well.
  void _chart;
}
