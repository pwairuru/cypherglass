import { getChart, listCharts, chartsByCategory } from "../registry";
import { describe, expect, it } from "vitest";

describe("chart catalog", () => {
  it("loads all 109 charts", () => expect(listCharts()).toHaveLength(109));
  it("finds MVRV", () =>
    expect(getChart("valuation.mvrv")?.title).toContain("MVRV"));
  it("rejects unknown charts", () => expect(getChart("nope")).toBeUndefined());
  it("includes every registry category", () => {
    const groups = chartsByCategory();
    expect(groups.price.length).toBeGreaterThan(0);
    expect(groups.valuation.length).toBeGreaterThan(0);
    expect(groups.platform.length).toBeGreaterThan(0);
  });
  it("default metrics belong to the chart", () => {
    for (const chart of listCharts()) {
      if (!chart.defaultMetric) continue;
      expect(chart.metrics).toContain(chart.defaultMetric);
    }
  });
});
