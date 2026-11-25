import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart, { type EChartHandle } from "./EChart";
import type { ChartData, ChartSeriesData, ChartPoint, ChartSpec, ChartState } from "../types";
import { chartTextColor, gridLineColor, metricLineColor } from "../../lib/chartTheme";
import { formatValue } from "../format";

/** Price-distribution charts (URPD) need bin data, not a time series. */
export default function PriceDistributionRenderer({
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
  const option = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 30, bottom: 56 },
      xAxis: {
        type: "value",
        name: "price (USD)",
        nameTextStyle: { color: text },
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: gridLineColor() } },
      },
      yAxis: {
        type: "value",
        name: "supply",
        nameTextStyle: { color: text },
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: gridLineColor() } },
      },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "bar",
          data: (series?.points ?? []).map((p) => [p.v, p.v]),
          itemStyle: { color: metricLineColor() },
        },
      ],
    };
  }, [series]);

  if (!series || series.points.length === 0) {
    return (
      <p className="chart-empty">
        Price-distribution bins are not ingested yet. The chart contract is ready; see{" "}
        <code>new_metrics</code> in the catalog.
      </p>
    );
  }
  return <EChart option={option} ariaLabel={`${spec.title} price distribution`} onReady={onReady} />;
}

export function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; r2: number } | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  const ssTot = points.reduce((a, p) => a + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}

export function ScatterRenderer({
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
  const [xSeries, ySeries] = data.series.filter((s) => !state.hidden.includes(s.metric));
  const aligned = useMemo(() => {
    if (!xSeries || !ySeries) return [];
    const byTime = new Map(xSeries.points.map((p) => [p.t, p.v]));
    return ySeries.points
      .map((p) => ({ x: byTime.get(p.t), y: p.v, t: p.t }))
      .filter((p): p is { x: number; y: number; t: string } => p.x !== null && p.y !== null);
  }, [xSeries, ySeries]);
  const regression = useMemo(() => linearRegression(aligned), [aligned]);

  if (!xSeries || !ySeries || aligned.length === 0) {
    return <p className="chart-empty">Two series with overlapping dates are required for a scatter chart.</p>;
  }

  const option: EChartsOption = {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 64, right: 24, top: 30, bottom: 56 },
    xAxis: {
      type: state.logLeft ? "log" : "value",
      name: `${xSeries.label} (${xSeries.unit})`,
      nameTextStyle: { color: chartTextColor() },
      axisLabel: { color: chartTextColor() },
      splitLine: { lineStyle: { color: gridLineColor() } },
    },
    yAxis: {
      type: state.logRight ? "log" : "value",
      name: `${ySeries.label} (${ySeries.unit})`,
      nameTextStyle: { color: chartTextColor() },
      axisLabel: { color: chartTextColor() },
      splitLine: { lineStyle: { color: gridLineColor() } },
    },
    tooltip: {
      formatter: (p: unknown) => {
        const item = p as { data?: [number, number, string] };
        if (!item.data) return "";
        return `${item.data[2]}<br/>${xSeries.label}: ${formatValue(item.data[0], xSeries.unit)}<br/>${ySeries.label}: ${formatValue(item.data[1], ySeries.unit)}`;
      },
    },
    series: [
      {
        type: "scatter",
        data: aligned.map((p) => [p.x, p.y, p.t]),
        symbolSize: 6,
        itemStyle: { color: metricLineColor(), opacity: 0.7 },
      },
      ...(regression
        ? [
            {
              type: "line" as const,
              data: [
                [Math.min(...aligned.map((p) => p.x)), regression.intercept + regression.slope * Math.min(...aligned.map((p) => p.x))],
                [Math.max(...aligned.map((p) => p.x)), regression.intercept + regression.slope * Math.max(...aligned.map((p) => p.x))],
              ],
              showSymbol: false,
              lineStyle: { color: "#F59E0B", type: "dashed" as const },
              silent: true,
            },
          ]
        : []),
    ],
  };

  return (
    <div>
      <EChart option={option} ariaLabel={`${spec.title} scatter`} onReady={onReady} />
      {regression && (
        <p className="chart-meta">
          Regression: y = {regression.slope.toPrecision(3)}x + {regression.intercept.toPrecision(3)} · R² ={" "}
          {regression.r2.toFixed(3)} · n = {aligned.length}
        </p>
      )}
    </div>
  );
}

export function HeatmapRenderer({
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
  const series =
    data.series.find(
      (s) => !state.hidden.includes(s.metric) && (s.axis === "color" || s.style === "heat"),
    ) ??
    data.series.find((s) => !state.hidden.includes(s.metric)) ??
    data.series[0];
  const values = (series?.points ?? [])
    .map((p) => p.v)
    .filter((v): v is number => v !== null);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;

  const option = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 56, right: 80, top: 24, bottom: 48 },
      xAxis: {
        type: "time",
        axisLabel: { color: text },
        splitLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: [series?.label ?? "value"],
        axisLabel: { color: text },
      },
      visualMap: {
        min,
        max,
        calculable: false,
        orient: "vertical",
        right: 8,
        top: "middle",
        textStyle: { color: text, fontSize: 10 },
        inRange: { color: ["#12313a", "#0EA5A0", "#F59E0B", "#EF4444"] },
      },
      tooltip: {
        formatter: (p: unknown) => {
          const item = p as { value?: [number, number, number] };
          if (!item.value) return "";
          return `${new Date(item.value[0]).toISOString().slice(0, 10)}<br/>${formatValue(
            item.value[2],
            series?.unit ?? "",
          )}`;
        },
      },
      series: [
        {
          type: "scatter",
          data: (series?.points ?? [])
            .filter((p) => p.v !== null)
            .map((p) => [Date.parse(p.t.includes("T") ? p.t : `${p.t}T00:00:00Z`), 0, p.v]),
          symbol: "rect",
          symbolSize: [10, 32],
          itemStyle: { borderWidth: 0 },
        },
      ],
    };
  }, [series, min, max]);

  if (!series || series.points.length === 0) {
    return (
      <p className="chart-empty">
        Heatmap bins are not ingested yet. The chart contract is ready; see <code>new_metrics</code> in
        the catalog.
      </p>
    );
  }
  return <EChart option={option} ariaLabel={`${spec.title} heatmap`} onReady={onReady} />;
}
