import type { ChartPoint, ChartSeriesData, ChartSpec } from "./types";

export interface HalvingMarker {
  date: string;
  label: string;
}

export function halvingMarkers(): HalvingMarker[] {
  return [
    { date: "2012-11-28", label: "Halving 1" },
    { date: "2016-07-09", label: "Halving 2" },
    { date: "2020-05-11", label: "Halving 3" },
    { date: "2024-04-20", label: "Halving 4" },
  ];
}

/** Upper minus lower for a stacked area band. Null on either side stays null,
 *  so an ECharts stacked fill never closes across a data gap. */
export function bandDiff(upper: ChartPoint[], lower: ChartPoint[]): ChartPoint[] {
  const byTime = new Map(lower.map((p) => [p.t, p.v]));
  return upper.map((p) => {
    const low = byTime.get(p.t);
    return {
      t: p.t,
      v: p.v === null || low === null || low === undefined ? null : p.v - low,
    };
  });
}

export function alignByTime(series: ChartSeriesData[]): Map<string, Array<number | null>> {
  const times = new Set<string>();
  for (const s of series) for (const p of s.points) times.add(p.t);
  const ordered = [...times].sort();
  const maps = series.map((s) => new Map(s.points.map((p) => [p.t, p.v])));
  return new Map(
    ordered.map((t) => [t, maps.map((m) => m.get(t) ?? null)]),
  );
}

export interface ThresholdLine {
  value: number;
  label: string;
}

/** Chart-family thresholds that answer the chart's question. */
export function thresholdsFor(spec: ChartSpec): ThresholdLine[] {
  const id = spec.id;
  if (id.includes("sopr")) return [{ value: 1, label: "Break-even" }];
  if (id.includes("rsi")) {
    return [
      { value: 30, label: "Oversold" },
      { value: 70, label: "Overbought" },
    ];
  }
  if (id.includes("risk")) {
    return [
      { value: 35, label: "Risk-off" },
      { value: 60, label: "Risk-on" },
    ];
  }
  if (id.includes("mayer")) return [{ value: 2.4, label: "2.4" }];
  if (id.includes("nupl")) return [{ value: 0, label: "Break-even" }];
  if (id.includes("puell")) {
    return [
      { value: 0.5, label: "Low" },
      { value: 4, label: "High" },
    ];
  }
  if (id.includes("funding")) return [{ value: 0, label: "Neutral" }];
  if (id.includes("fear_greed")) {
    return [
      { value: 25, label: "Fear" },
      { value: 75, label: "Greed" },
    ];
  }
  if (id === "valuation.mvrv") {
    return [
      { value: 1, label: "Cost basis" },
      { value: 3.5, label: "Cycle high" },
    ];
  }
  return [];
}

export function lastValue(series: ChartSeriesData): number | null {
  for (let i = series.points.length - 1; i >= 0; i -= 1) {
    const v = series.points[i].v;
    if (v !== null) return v;
  }
  return null;
}
