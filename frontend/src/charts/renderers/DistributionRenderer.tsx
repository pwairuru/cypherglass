import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart, { type EChartHandle } from "./EChart";
import type { ChartData, ChartPoint, ChartSpec, ChartState } from "../types";
import { chartTextColor, gridLineColor, metricLineColor } from "../../lib/chartTheme";
import { formatValue } from "../format";

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export function buildHistogram(
  points: ChartPoint[],
  bins = 40,
): {
  bins: HistogramBin[];
  current: number | null;
  percentiles: { p10: number; p50: number; p90: number } | null;
} {
  const values = points.map((p) => p.v).filter((v): v is number => v !== null);
  const current = [...points].reverse().find((p) => p.v !== null)?.v ?? null;
  if (values.length === 0) return { bins: [], current: null, percentiles: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = max === min ? 1 : (max - min) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    out[idx].count += 1;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    bins: out,
    current,
    percentiles: { p10: at(0.1), p50: at(0.5), p90: at(0.9) },
  };
}

export default function DistributionRenderer({
  spec,
  data,
  state,
  onReady,
}: {
  spec: ChartSpec;
  data: ChartData;
  state: ChartState;
  onReady?: (handle: EChartHandle | null) => void;
}) {
  const series = data.series.find((s) => !state.hidden.includes(s.metric)) ?? data.series[0];
  const hist = useMemo(() => buildHistogram(series?.points ?? [], 40), [series]);
  const option = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 52, right: 24, top: 30, bottom: 48 },
      xAxis: {
        type: "category",
        data: hist.bins.map((b) => b.from.toPrecision(4)),
        axisLabel: { color: text, fontSize: 9, rotate: 35 },
        axisLine: { lineStyle: { color: gridLineColor() } },
        name: series?.unit ?? "",
        nameTextStyle: { color: text },
      },
      yAxis: {
        type: "value",
        name: "count",
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: gridLineColor() } },
      },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "bar",
          data: hist.bins.map((b) => b.count),
          itemStyle: { color: metricLineColor() },
          barMaxWidth: 18,
        },
      ],
    };
  }, [hist, series?.unit]);

  if (!series || hist.bins.length === 0) {
    return <p className="chart-empty">No data for this distribution yet.</p>;
  }

  return (
    <div>
      <EChart option={option} ariaLabel={`${spec.title} distribution`} onReady={onReady} />
      <p className="chart-meta">
        {hist.bins.length} bins · latest {formatValue(hist.current, series.unit)}
        {hist.percentiles
          ? ` · p10 ${formatValue(hist.percentiles.p10, series.unit)} · median ${formatValue(
              hist.percentiles.p50,
              series.unit,
            )} · p90 ${formatValue(hist.percentiles.p90, series.unit)}`
          : ""}
      </p>
    </div>
  );
}
