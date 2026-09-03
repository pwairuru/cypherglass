import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

export interface SeriesPoint {
  t: string;
  v: number;
}

interface ChartPaneProps {
  title: string;
  unit: string;
  series: { points: SeriesPoint[]; unit: string } | undefined;
  loading: boolean;
  error: string | null;
}

export default function ChartPane({ title, unit, series, loading, error }: ChartPaneProps) {
  if (loading) return <p>Loading {title}…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!series || series.points.length === 0) return <p>No data for {title}.</p>;

  const option: EChartsOption = {
    tooltip: { trigger: "axis" },
    xAxis: { type: "time" },
    yAxis: { type: "value", name: unit },
    dataZoom: [{ type: "inside" }, { type: "slider" }],
    series: [
      {
        type: "line",
        showSymbol: false,
        data: series.points.map((p) => [p.t, p.v]),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 400 }} />;
}
