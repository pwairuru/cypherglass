/** Catalog-driven chart platform contract.
 *
 * The generated catalog in `generated/catalog.ts` is the only source of chart
 * pages. Components must never hand-write chart arrays.
 */

import type { RangePreset } from "./ranges";

export type ChartArchetype =
  | "candles"
  | "line_oscillator"
  | "line_dual_axis"
  | "bands_overlay"
  | "multi_series"
  | "stacked_area"
  | "bar_series"
  | "distribution_histogram"
  | "price_distribution"
  | "heatmap"
  | "scatter"
  | "table"
  | "gauge_composite"
  | "dashboard_grid"
  | "multi_pane";

export type AxisId = "left" | "right" | "volume" | "color" | "x" | "y" | "gauge";

export type ChartType =
  | "candles"
  | "line"
  | "area"
  | "step"
  | "columns"
  | "stacked_columns"
  | "stacked_area"
  | "band"
  | "histogram"
  | "heatmap"
  | "scatter"
  | "regression"
  | "table"
  | "gauge"
  | "grid";

export type ControlId =
  | "range"
  | "custom_range"
  | "grain"
  | "log_axis"
  | "price_overlay"
  | "ma_overlay"
  | "volume_pane"
  | "legend"
  | "crosshair"
  | "zoom"
  | "reset_zoom"
  | "fullscreen"
  | "screenshot"
  | "csv"
  | "saved_layout"
  | "thresholds"
  | "histogram_variant"
  | "smoothing"
  | "axis_toggle"
  | "dual_axis_labels"
  | "band_toggle"
  | "quantile_window"
  | "series_toggle"
  | "axis_assign"
  | "normalize"
  | "percent_mode"
  | "reorder"
  | "bar_mode"
  | "window"
  | "bins"
  | "log_y"
  | "percentile_markers"
  | "bin_size"
  | "color_scale"
  | "log_color"
  | "hover_detail"
  | "x_metric"
  | "y_metric"
  | "log_x"
  | "regression"
  | "quadrants"
  | "period"
  | "sort"
  | "export_csv"
  | "components"
  | "history_toggle"
  | "card_select"
  | "layout"
  | "sync_range"
  | "indicator_params";

export type AnnotationId = "halvings" | "crosshair" | "last_value";

export type SeriesStyle = "line" | "area" | "bar" | "candle" | "band" | "heat" | "gauge";

export type TransformId = "raw" | "pct" | "index" | "zscore" | "btc" | "sma7" | "sma30";

export interface AxisSpec {
  id: AxisId;
  unit: string;
  scale: "linear" | "log";
  min?: number | "auto";
  max?: number | "auto";
  decimals?: number;
  color?: string;
  title?: string;
}

export interface SeriesSpec {
  /** Composite OHLC series. */
  type?: "ohlc";
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  /** Single-metric series. */
  metric?: string;
  label?: string;
  axis: AxisId;
  style?: SeriesStyle;
  color?: string;
  width?: number;
  dash?: "solid" | "dashed" | "dotted";
  hiddenByDefault?: boolean;
  transform?: TransformId;
}

export interface VariantSpec {
  id: string;
  label: string;
  series: string[];
  cohort?: "all" | "sth" | "lth";
  unit?: "btc" | "usd" | "pct";
  note?: string;
}

export interface ChartSpec {
  id: string;
  title: string;
  category: string;
  status: "existing" | "new";
  implementation: "not_started" | "in_progress" | "shipped" | "blocked";
  phase: string;
  priority: "P0" | "P1" | "P2";
  question: string;
  parity: string[];
  archetype: ChartArchetype;
  chartTypes: ChartType[];
  panes: string[];
  axes: AxisSpec[];
  metrics: string[];
  legacyMetrics: string[];
  disabledMetrics: string[];
  newMetrics: string[];
  defaultMetric: string | null;
  series: SeriesSpec[];
  variants: VariantSpec[];
  controls: ControlId[];
  annotations: AnnotationId[];
  expected: string[];
  acceptance: string[];
  dataFreshness: string;
  dataRequirements?: string;
}

export type ChartSummary = Pick<
  ChartSpec,
  | "id"
  | "title"
  | "category"
  | "status"
  | "implementation"
  | "phase"
  | "priority"
  | "question"
  | "archetype"
  | "metrics"
  | "defaultMetric"
  | "newMetrics"
  | "controls"
>;

/** Chart page state encoded in the URL. */
export interface ChartState {
  range: RangePreset;
  from?: string;
  to?: string;
  grain: "auto" | "hourly" | "daily" | "weekly" | "monthly";
  variant?: string;
  logLeft: boolean;
  logRight: boolean;
  percent: boolean;
  hidden: string[];
  series: string[];
  timezone: "utc" | "local";
  showHalvings: boolean;
  showThresholds: boolean;
  layout?: string;
}

/** One fetched series. Null values are gaps, never zeros. */
export interface ChartPoint {
  t: string;
  v: number | null;
}

export interface OhlcBar {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface ChartSeriesData {
  metric: string;
  label: string;
  unit: string;
  axis: AxisId;
  style?: SeriesStyle;
  points: ChartPoint[];
  bars?: OhlcBar[];
  meta?: {
    proxy?: boolean;
    lastUpdated?: string | null;
    downsampled?: boolean;
  };
}

export interface ChartData {
  chartId: string;
  from: string | null;
  to: string | null;
  grain: string;
  series: ChartSeriesData[];
  generatedAt?: string;
}
