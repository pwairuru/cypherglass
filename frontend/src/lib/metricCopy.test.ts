import { describe, expect, it } from "vitest";
import { describeChart, explainMetric } from "./metricCopy";

describe("metricCopy", () => {
  it("explains known metrics in plain words", () => {
    const text = explainMetric("mvrv_daily", "valuation", "MVRV / day");
    expect(text).toMatch(/MVRV divides/);
    expect(text).not.toContain("—");
  });

  it("falls back to category copy for unknown ids", () => {
    const text = explainMetric("unknown_x", "mining", "whatever");
    expect(text.toLowerCase()).toContain("mining");
  });

  it("appends the current reading and range change", () => {
    const text = describeChart({
      metricId: "mvrv_daily",
      category: "valuation",
      points: [
        { t: "2024-01-01T00:00:00Z", v: 1 },
        { t: "2024-01-02T00:00:00Z", v: 2 },
      ],
      unit: "ratio",
    });
    expect(text).toContain("Now at");
    expect(text).not.toContain("—");
  });
});
