import { describe, expect, it } from "vitest";
import { buildTimeSeriesOption } from "../renderers/TimeSeriesRenderer";
import { buildHistogram } from "../renderers/DistributionRenderer";
import { drawdownEpisodes, monthlyReturns, seasonalityRows } from "../renderers/TableRenderer";
import { getChart } from "../registry";
import { defaultChartState } from "../urlState";
import type { ChartData, ChartPoint } from "../types";

const mvrv = getChart("valuation.mvrv")!;

const data: ChartData = {
  chartId: "valuation.mvrv",
  from: null,
  to: null,
  grain: "daily",
  series: [
    {
      metric: "mvrv_daily",
      label: "MVRV",
      unit: "ratio",
      axis: "left",
      style: "line",
      points: [
        { t: "2024-01-01", v: 1.2 },
        { t: "2024-01-02", v: 1.4 },
      ],
    },
    {
      metric: "price_close_daily",
      label: "BTC price",
      unit: "USD",
      axis: "right",
      style: "line",
      points: [
        { t: "2024-01-01", v: 42000 },
        { t: "2024-01-02", v: 43000 },
      ],
    },
  ],
};

describe("time series option", () => {
  it("builds dual axes with units", () => {
    const option = buildTimeSeriesOption({ spec: mvrv, data, state: defaultChartState(mvrv) });
    const axes = option.yAxis as Array<{ name: string; type: string }>;
    expect(axes).toHaveLength(2);
    expect(axes[0].name).toBe("ratio");
    expect(axes[1].name).toBe("USD");
  });

  it("honours per-axis log toggles", () => {
    const state = { ...defaultChartState(mvrv), logLeft: true, logRight: true };
    const option = buildTimeSeriesOption({ spec: mvrv, data, state });
    const axes = option.yAxis as Array<{ type: string }>;
    expect(axes[0].type).toBe("log");
    expect(axes[1].type).toBe("log");
  });

  it("drops hidden series without touching the others", () => {
    const state = { ...defaultChartState(mvrv), hidden: ["price_close_daily"] };
    const option = buildTimeSeriesOption({ spec: mvrv, data, state });
    const series = option.series as Array<{ name: string }>;
    expect(series.map((s) => s.name)).not.toContain("BTC price");
  });

  it("keeps null gaps", () => {
    const withGap: ChartData = {
      ...data,
      series: [
        {
          ...data.series[0],
          points: [
            { t: "2024-01-01", v: 1.2 },
            { t: "2024-01-02", v: null },
            { t: "2024-01-03", v: 1.5 },
          ],
        },
      ],
    };
    const option = buildTimeSeriesOption({
      spec: mvrv,
      data: withGap,
      state: defaultChartState(mvrv),
    });
    const series = option.series as Array<{ data: Array<[number, number | null]> }>;
    expect(series[0].data[1][1]).toBeNull();
  });
});

describe("histogram", () => {
  it("bins values and reports the current point", () => {
    const points: ChartPoint[] = [
      { t: "a", v: 1 },
      { t: "b", v: 2 },
      { t: "c", v: 3 },
    ];
    const out = buildHistogram(points, 4);
    expect(out.bins).toHaveLength(4);
    expect(out.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(out.current).toBe(3);
    expect(out.percentiles?.p50).toBe(2);
  });
});

describe("tables", () => {
  const monthly: ChartPoint[] = [
    { t: "2023-12-31", v: 100 },
    { t: "2024-01-31", v: 110 },
    { t: "2024-02-29", v: 99 },
  ];

  it("computes calendar-month returns", () => {
    const out = monthlyReturns(monthly);
    expect(out).toHaveLength(2);
    expect(out[0].ret).toBeCloseTo(10);
    expect(out[1].ret).toBeCloseTo(-10);
  });

  it("aggregates seasonality by month", () => {
    const rows = seasonalityRows(monthlyReturns(monthly));
    expect(rows[0].n).toBe(1);
    expect(rows[0].average).toBeCloseTo(10);
  });

  it("finds drawdown episodes", () => {
    const episodes = drawdownEpisodes([
      { t: "d1", v: 0 },
      { t: "d2", v: -5 },
      { t: "d3", v: -12 },
      { t: "d4", v: 0 },
    ]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].depth).toBe(-12);
    expect(episodes[0].end).toBe("d4");
  });
});
