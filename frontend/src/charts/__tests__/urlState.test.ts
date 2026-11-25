import { describe, expect, it } from "vitest";
import { getChart } from "../registry";
import { defaultChartState, parseChartState, serializeChartState } from "../urlState";

const mvrv = getChart("valuation.mvrv")!;

describe("url state", () => {
  it("round-trips log and series", () => {
    const state = parseChartState("?log=left&series=mvrv_z_daily", mvrv);
    expect(serializeChartState(state)).toContain("log=left");
    expect(state.series).toEqual(["mvrv_z_daily"]);
  });

  it("falls back on an invalid range", () => {
    const state = parseChartState("?range=forever", mvrv);
    expect(state.range).toBe("all");
  });

  it("ignores an unknown variant", () => {
    const state = parseChartState("?variant=nope", mvrv);
    expect(state.variant).toBe(mvrv.variants[0].id);
  });

  it("keeps per-axis log state", () => {
    const state = parseChartState("?log=right", mvrv);
    expect(state.logLeft).toBe(false);
    expect(state.logRight).toBe(true);
  });

  it("round-trips custom dates", () => {
    const state = {
      ...defaultChartState(mvrv),
      range: "custom" as const,
      from: "2020-01-01",
      to: "2021-01-01",
    };
    const parsed = parseChartState(`?${serializeChartState(state)}`, mvrv);
    expect(parsed.from).toBe("2020-01-01");
    expect(parsed.to).toBe("2021-01-01");
  });
});
