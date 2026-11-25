import { describe, expect, it } from "vitest";
import { bandDiff, halvingMarkers, thresholdsFor } from "../overlays";
import { getChart } from "../registry";

describe("overlays", () => {
  it("halving dates are exact", () => {
    expect(halvingMarkers().map((m) => m.date)).toEqual([
      "2012-11-28",
      "2016-07-09",
      "2020-05-11",
      "2024-04-20",
    ]);
  });

  it("band diff breaks on a null bound", () => {
    const out = bandDiff(
      [
        { t: "a", v: 2 },
        { t: "b", v: null },
        { t: "c", v: 4 },
      ],
      [
        { t: "a", v: 1 },
        { t: "b", v: 1 },
        { t: "c", v: null },
      ],
    );
    expect(out.map((p) => p.v)).toEqual([1, null, null]);
  });

  it("labels SOPR at one", () => {
    expect(thresholdsFor(getChart("profitability.sopr")!)[0].value).toBe(1);
  });
});
