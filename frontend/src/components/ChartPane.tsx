import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTheme } from "../context/ThemeContext";

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
  const { theme } = useTheme();
  if (loading) return <p>Loading {title}…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!series || series.points.length === 0) return <p>No data for {title}.</p>;

  const css = (name: string, fallback: string) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? `hsl(${v})` : fallback;
  };
  const fg = css("--foreground", "#111");
  const border = css("--border", "#e5e5e5");
  const line = css("--chart-1", "#2563eb");

  const option: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { color: fg },
    tooltip: { trigger: "axis" },
    xAxis: { type: "time", axisLabel: { color: fg }, axisLine: { lineStyle: { color: border } } },
    yAxis: {
      type: "value",
      name: unit,
      nameTextStyle: { color: fg },
      axisLabel: { color: fg },
      splitLine: { lineStyle: { color: border } },
    },
    dataZoom: [{ type: "inside" }, { type: "slider" }],
    series: [
      {
        type: "line",
        showSymbol: false,
        lineStyle: { color: line },
        itemStyle: { color: line },
        data: series.points.map((p) => [p.t, p.v]),
      },
    ],
  };

  return <ReactECharts key={theme} option={option} style={{ height: 400 }} notMerge={true} />;
}
