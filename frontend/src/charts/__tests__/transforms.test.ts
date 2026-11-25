import { describe, expect, it } from "vitest";
import { applyTransform } from "../transforms";
import type { ChartPoint } from "../types";

const pts = (values: (number | null)[]): ChartPoint[] =>
  values.map((v, i) => ({ t: `2024-01-${String(i + 1).padStart(2, "0")}`, v }));

describe("transforms", () => {
  it("percent change uses the first visible value", () => {
    expect(applyTransform(pts([100, 110]), "pct")[1].v).toBeCloseTo(10);
  });
  it("index=100 starts at 100", () => {
    expect(applyTransform(pts([50, 75]), "index")[1].v).toBe(150);
  });
  it("z-score preserves nulls", () => {
    expect(applyTransform(pts([1, null, 3]), "zscore")[1].v).toBeNull();
  });
  it("sma7 needs a full window", () => {
    expect(applyTransform(pts([1, 2, 3]), "sma7")[2].v).toBeNull();
  });
  it("skips leading zeros before normalising", () => {
    const out = applyTransform(pts([0, 0, 10, 20]), "index");
    expect(out.map((p) => p.v)).toEqual([null, null, 100, 200]);
  });
  it("raw does not mutate the input", () => {
    const input = pts([1]);
    const out = applyTransform(input, "raw");
    out[0].v = 99;
    expect(input[0].v).toBe(1);
  });
});
