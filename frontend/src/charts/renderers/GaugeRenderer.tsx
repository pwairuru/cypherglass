import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart, { type EChartHandle } from "./EChart";
import type { ChartData, ChartSeriesData, ChartSpec, ChartState } from "../types";
import { chartTextColor, gridLineColor, metricLineColor } from "../../lib/chartTheme";
import { formatValue } from "../format";
import { lastValue } from "../overlays";

function latestSeries(data: ChartData, state: ChartState): ChartSeriesData | undefined {
  return data.series.find((s) => !state.hidden.includes(s.metric)) ?? data.series[0];
}

export default function GaugeRenderer({
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
  const series = latestSeries(data, state);
  const value = series ? lastValue(series) : null;
  const option = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      series: [
        {
          type: "gauge",
          min: 0,
          max: 100,
          startAngle: 210,
          endAngle: -30,
          radius: "88%",
          center: ["50%", "58%"],
          axisLine: {
            lineStyle: {
              width: 18,
              color: [
                [0.35, "#22c55e"],
                [0.6, "#F59E0B"],
                [1, "#EF4444"],
              ],
            },
          },
          splitLine: { length: 10, lineStyle: { color: text } },
          axisLabel: { color: text, fontSize: 10, distance: 18 },
          pointer: { itemStyle: { color: text } },
          detail: {
            valueAnimation: false,
            formatter: (v: number) => v.toFixed(1),
            color: text,
            fontSize: 26,
            offsetCenter: [0, "62%"],
          },
          title: { color: text, fontSize: 11, offsetCenter: [0, "88%"] },
          data: [{ value: value ?? 0, name: spec.title }],
        },
      ],
    };
  }, [spec.title, value]);

  const historyOption = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: "time",
        axisLabel: { color: text, fontSize: 9 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: text, fontSize: 9 },
        splitLine: { lineStyle: { color: gridLineColor() } },
      },
      series: [
        {
          type: "line",
          data: (series?.points ?? []).map((p) => [
            Date.parse(p.t.includes("T") ? p.t : `${p.t}T00:00:00Z`),
            p.v,
          ]),
          showSymbol: false,
          lineStyle: { color: metricLineColor(), width: 2 },
          connectNulls: false,
        },
      ],
    };
  }, [series]);

  if (!series || value === null) {
    return <p className="chart-empty">No gauge data yet.</p>;
  }

  return (
    <div className="chart-gauge">
      <EChart option={option} ariaLabel={`${spec.title} gauge`} height={280} onReady={onReady} />
      <p className="chart-meta">
        {series.label}: {formatValue(value, series.unit)}
      </p>
      {spec.variants.some((v) => v.id === "components") && (
        <ul className="chart-components">
          {data.series
            .filter((s) => s.metric !== series.metric)
            .map((s) => (
              <li key={s.metric}>
                <span>{s.label}</span>
                <strong>{formatValue(lastValue(s), s.unit)}</strong>
              </li>
            ))}
        </ul>
      )}
      <EChart option={historyOption} ariaLabel={`${spec.title} history`} height={180} />
    </div>
  );
}
