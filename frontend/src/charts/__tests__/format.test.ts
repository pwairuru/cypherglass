import { describe, expect, it } from "vitest";
import { formatAxis, formatValue, logSafe } from "../format";

describe("format", () => {
  it("formats USD trillions", () => {
    expect(formatValue(2.096e12, "USD")).toBe("$2.10T");
  });
  it("formats sats/vB", () => {
    expect(formatValue(12.5, "sat/vB")).toBe("12.5 sat/vB");
  });
  it("formats percentages", () => {
    expect(formatValue(12.345, "pct")).toBe("12.35%");
  });
  it("formats null as a dash", () => {
    expect(formatValue(null, "ratio")).toBe("—");
  });
  it("drops non-positive points on a log axis", () => {
    expect(logSafe([{ v: 1 }, { v: 0 }, { v: -2 }, { v: 3 }])).toEqual([
      { v: 1 },
      { v: null },
      { v: null },
      { v: 3 },
    ]);
  });
  it("compact axis keeps unit out", () => {
    expect(formatAxis(2.096e12, "USD")).toBe("$2.1T");
  });
});
