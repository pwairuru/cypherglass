import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart, { type EChartHandle } from "./EChart";
import type {
  ChartData,
  ChartPoint,
  ChartSeriesData,
  ChartSpec,
  ChartState,
} from "../types";
import { formatAxis, formatValue, logSafe } from "../format";
import { bandDiff, halvingMarkers, thresholdsFor } from "../overlays";
import {
  candleDownColor,
  candleUpColor,
  chartTextColor,
  gridLineColor,
  metricLineColor,
  priceLineColor,
  smaLineColor,
} from "../../lib/chartTheme";

const PALETTE = ["#0EA5A0", "#8B5CF6", "#22C55E", "#38BDF8", "#E879F9", "#A3E635"];

function toMs(t: string): number {
  const normalized = t.includes("T") ? t : t.replace(" ", "T") + (t.length === 10 ? "T00:00:00Z" : "Z");
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : Date.parse(t);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seriesColor(series: ChartSeriesData, index: number): string {
  if (series.unit === "USD" && /price|close|open|high|low/.test(series.metric)) {
    return priceLineColor();
  }
  if (/sma|ema|ma[0-9]|_ma|moving/i.test(series.metric) || /SMA|EMA|MA /.test(series.label)) {
    return smaLineColor();
  }
  if (index === 0) return metricLineColor();
  return PALETTE[index % PALETTE.length];
}

function visibleSeries(data: ChartData, state: ChartState): ChartSeriesData[] {
  return data.series.filter((s) => !state.hidden.includes(s.metric));
}

function subtractSeries(upper: ChartSeriesData, lower: ChartSeriesData): ChartPoint[] {
  return bandDiff(upper.points, lower.points);
}

function percentNormalise(series: ChartSeriesData[]): ChartSeriesData[] {
  const times = new Map<string, number>();
  for (const s of series) {
    for (const p of s.points) {
      if (p.v === null) continue;
      times.set(p.t, (times.get(p.t) ?? 0) + Math.max(p.v, 0));
    }
  }
  return series.map((s) => ({
    ...s,
    points: s.points.map((p) => ({
      t: p.t,
      v:
        p.v === null || !times.get(p.t)
          ? null
          : (Math.max(p.v, 0) / (times.get(p.t) as number)) * 100,
    })),
  }));
}

export interface TimeSeriesBuildOptions {
  spec: ChartSpec;
  data: ChartData;
  state: ChartState;
}

export function buildTimeSeriesOption({
  spec,
  data,
  state,
}: TimeSeriesBuildOptions): EChartsOption {
  let seriesData = visibleSeries(data, state);
  const variantIsPercent =
    spec.variants.find((v) => v.id === state.variant)?.label.includes("%") ?? false;
  if (
    (state.percent || variantIsPercent) &&
    (spec.archetype === "stacked_area" || spec.controls.includes("percent_mode"))
  ) {
    seriesData = percentNormalise(seriesData);
  }

  const text = chartTextColor();
  const grid = gridLineColor();
  const leftAxis = spec.axes.find((a) => a.id === "left") ?? {
    id: "left" as const,
    unit: seriesData[0]?.unit ?? "value",
    scale: "linear" as const,
  };
  const rightAxis = spec.axes.find((a) => a.id === "right");
  const hasRight = seriesData.some((s) => s.axis === "right");
  const ohlc = seriesData.find((s) => s.bars && s.bars.length > 0);
  const hasVolume = Boolean(ohlc?.bars?.some((b) => b.volume !== null));

  const yAxis: any[] = [
    {
      type: state.logLeft ? "log" : "value",
      name: leftAxis.unit,
      nameTextStyle: { color: text, fontSize: 11 },
      axisLabel: {
        color: text,
        formatter: (v: number) => formatAxis(v, leftAxis.unit),
      },
      splitLine: { lineStyle: { color: grid } },
      min: leftAxis.min === "auto" ? undefined : (leftAxis.min as number | undefined),
      max: leftAxis.max === "auto" ? undefined : (leftAxis.max as number | undefined),
    },
  ];
  const rightAxisIndex = hasRight || (rightAxis && seriesData.some((s) => s.axis === "right")) ? 1 : -1;
  if (rightAxisIndex === 1) {
    yAxis.push({
      type: state.logRight ? "log" : "value",
      name: rightAxis?.unit ?? "USD",
      nameTextStyle: { color: priceLineColor(), fontSize: 11 },
      axisLabel: {
        color: priceLineColor(),
        formatter: (v: number) => formatAxis(v, rightAxis?.unit ?? "USD"),
      },
      splitLine: { show: false },
      position: "right",
    });
  }
  let volumeAxisIndex = -1;
  if (hasVolume) {
    volumeAxisIndex = yAxis.length;
    yAxis.push({
      type: "value",
      name: "Volume",
      gridIndex: 1,
      axisLabel: { show: false },
      splitLine: { show: false },
    });
  }

  const xAxis: any[] = [
    {
      type: "time",
      axisLabel: { color: text },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { show: false },
    },
  ];
  if (hasVolume) {
    xAxis.push({
      type: "time",
      gridIndex: 1,
      axisLabel: { color: text },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { show: false },
    });
  }

  const series: NonNullable<EChartsOption["series"]> = [];
  const legendNames: string[] = [];

  const upper = seriesData.find((s) => /upper|top band/i.test(s.label));
  const lower = seriesData.find((s) => /lower|bottom band/i.test(s.label));
  let bandStack: string | undefined;
  if (upper && lower && upper.axis === lower.axis) {
    bandStack = `band-${upper.metric}`;
    series.push({
      name: `${upper.label} fill`,
      type: "line",
      data: lower.points.map((p) => [toMs(p.t), p.v]),
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      stack: bandStack,
      symbol: "none",
      connectNulls: false,
      silent: true,
      yAxisIndex: upper.axis === "right" ? 1 : 0,
    });
    series.push({
      name: `${upper.label} fill`,
      type: "line",
      data: subtractSeries(upper, lower).map((p) => [toMs(p.t), p.v]),
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0.14, color: seriesColor(upper, 2) },
      stack: bandStack,
      symbol: "none",
      connectNulls: false,
      silent: true,
      yAxisIndex: upper.axis === "right" ? 1 : 0,
    });
  }

  let colorIndex = 0;
  seriesData.forEach((s) => {
    const axisIndex = s.axis === "right" && rightAxisIndex === 1 ? 1 : 0;
    const color = seriesColor(s, s.unit === "USD" ? 0 : colorIndex++);
    const isCandle =
      Boolean(s.bars?.length) &&
      spec.chartTypes.includes("candles") &&
      state.variant !== "line";
    if (isCandle && s.bars) {
      series.push({
        name: s.label,
        type: "candlestick",
        data: s.bars
          .filter((b) => b.open !== null && b.close !== null && b.low !== null && b.high !== null)
          .map((b) => [b.time, b.open, b.close, b.low, b.high]),
        itemStyle: {
          color: candleUpColor(),
          color0: candleDownColor(),
          borderColor: candleUpColor(),
          borderColor0: candleDownColor(),
        },
        yAxisIndex: 0,
      });
      legendNames.push(s.label);
      if (hasVolume && volumeAxisIndex >= 0) {
        series.push({
          name: `${s.label} volume`,
          type: "bar",
          data: s.bars.map((b) => [b.time, b.volume]),
          itemStyle: { color: grid, opacity: 0.55 },
          xAxisIndex: 1,
          yAxisIndex: volumeAxisIndex,
          barMaxWidth: 6,
          silent: true,
        });
      }
      return;
    }

    let points = s.points;
    if ((axisIndex === 0 && state.logLeft) || (axisIndex === 1 && state.logRight)) {
      points = logSafe(points);
    }
    const style = s.style === "bar" || spec.chartTypes.includes("columns") && spec.archetype === "bar_series"
      ? "bar"
      : s.style === "area" || spec.archetype === "stacked_area"
        ? "line"
        : "line";
    const isArea = s.style === "area" || spec.archetype === "stacked_area";
    const stacked = spec.archetype === "stacked_area" ? `${spec.id}-stack` : undefined;
    series.push({
      name: s.label,
      type: style,
      data: points.map((p) => [toMs(p.t), p.v]),
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { width: s.unit === "USD" ? 1.5 : 2, color },
      itemStyle: { color },
      areaStyle: isArea ? { opacity: 0.2, color } : undefined,
      stack: stacked,
      yAxisIndex: axisIndex,
      barMaxWidth: 14,
      emphasis: { focus: "series" },
    });
    legendNames.push(s.label);
  });

  const thresholds = state.showThresholds ? thresholdsFor(spec) : [];
  const primary = seriesData.find((s) => s.axis !== "right");
  if (primary && thresholds.length > 0) {
    const thresholdSeries = series.find((s) => s.name === primary.label);
    if (thresholdSeries && thresholdSeries.type === "line") {
      (thresholdSeries as { markLine?: unknown }).markLine = {
        silent: true,
        symbol: "none",
        lineStyle: { color: text, type: "dashed", width: 1, opacity: 0.65 },
        label: { color: text, fontSize: 10, formatter: (p: { name: string }) => p.name },
        data: thresholds.map((t) => ({ yAxis: t.value, name: `${t.label} ${t.value}` })),
      };
    }
  }

  if (state.showHalvings) {
    const anchor = series.find((s) => s.type === "candlestick") ?? series[0];
    if (anchor) {
      (anchor as { markLine?: unknown }).markLine = {
        ...((anchor as { markLine?: object }).markLine ?? {}),
        silent: true,
        symbol: "none",
        lineStyle: { color: grid, type: "dotted", width: 1 },
        label: { color: text, fontSize: 9, rotate: 90, formatter: "{b}" },
        data: [
          ...((((anchor as { markLine?: { data?: unknown[] } }).markLine?.data as unknown[]) ?? [])),
          ...halvingMarkers().map((h) => ({
            xAxis: Date.parse(`${h.date}T00:00:00Z`),
            name: h.label,
          })),
        ],
      };
    }
  }

  const volumeGrid = hasVolume
    ? [
        { left: 56, right: hasRight ? 62 : 24, top: 24, bottom: 150 },
        { left: 56, right: hasRight ? 62 : 24, top: "78%", height: "12%" },
      ]
    : [{ left: 56, right: hasRight ? 62 : 24, top: 28, bottom: 74 }];

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: text, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
    aria: { enabled: true, decal: { show: false } },
    grid: volumeGrid,
    xAxis: xAxis as EChartsOption["xAxis"],
    yAxis: yAxis as EChartsOption["yAxis"],
    series,
    dataZoom: [
      { type: "inside", xAxisIndex: hasVolume ? [0, 1] : [0], filterMode: "none" },
      {
        type: "slider",
        xAxisIndex: hasVolume ? [0, 1] : [0],
        bottom: 8,
        height: 18,
        borderColor: "transparent",
        backgroundColor: "transparent",
        fillerColor: "rgba(14,165,160,0.15)",
        handleStyle: { color: metricLineColor() },
        textStyle: { color: text, fontSize: 9 },
      },
    ],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { backgroundColor: "#334155" } },
      backgroundColor: "rgba(15,23,42,0.94)",
      borderColor: grid,
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: (raw: unknown) => {
        const items = Array.isArray(raw) ? raw : [raw];
        const first = items[0] as { axisValue?: number | string } | undefined;
        const stamp = first?.axisValue ? new Date(first.axisValue as number) : null;
        const heading = stamp
          ? stamp.toISOString().slice(0, 16).replace("T", " ")
          : "";
        const rows = items
          .map((item) => {
            const p = item as {
              seriesName?: string;
              seriesType?: string;
              value?: unknown;
              color?: string;
            };
            if (!p.seriesName || /fill|volume/.test(p.seriesName)) return "";
            const s = data.series.find((x) => x.label === p.seriesName);
            const unit = s?.unit ?? "";
            if (p.seriesType === "candlestick" && Array.isArray(p.value)) {
              const [, open, close, low, high] = p.value as number[];
              return `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span> ${escapeHtml(
                p.seriesName,
              )}<br/><span style="opacity:.8">O ${escapeHtml(formatValue(open, unit))} · H ${escapeHtml(
                formatValue(high, unit),
              )} · L ${escapeHtml(formatValue(low, unit))} · C ${escapeHtml(
                formatValue(close, unit),
              )}</span></div>`;
            }
            const value = Array.isArray(p.value) ? p.value[1] : p.value;
            const numeric = typeof value === "number" ? value : Number(value);
            return `<div style="display:flex;gap:8px;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span> ${escapeHtml(p.seriesName)}</span><strong>${escapeHtml(formatValue(Number.isFinite(numeric) ? numeric : null, unit))}</strong></div>`;
          })
          .filter(Boolean)
          .join("");
        return `<div style="min-width:220px"><div style="opacity:.7;margin-bottom:6px">${escapeHtml(heading)}</div>${rows}</div>`;
      },
    },
    legend: { show: false, data: legendNames },
  };
}

export default function TimeSeriesRenderer({
  spec,
  data,
  state,
  onReady,
  height,
}: {
  spec: ChartSpec;
  data: ChartData;
  state: ChartState;
  onReady?: (handle: EChartHandle | null) => void;
  height?: number;
}) {
  const option = useMemo(
    () => buildTimeSeriesOption({ spec, data, state }),
    [spec, data, state],
  );
  return (
    <EChart
      option={option}
      height={height}
      ariaLabel={`${spec.title} time series chart`}
      onReady={onReady}
    />
  );
}
