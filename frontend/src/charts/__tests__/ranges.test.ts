import { describe, expect, it } from "vitest";
import { CYCLE_START, autoGrain, resolveRange } from "../ranges";

describe("ranges", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("cycle starts at the 2024 halving", () => {
    expect(resolveRange("cycle", now).from).toBe(CYCLE_START);
    expect(resolveRange("cycle", now).from).toBe("2024-04-20");
  });
  it("all returns no bounds so the server resolves coverage", () => {
    expect(resolveRange("all", now)).toEqual({ from: null, to: null });
  });
  it("auto grain is weekly for 4Y", () => {
    expect(autoGrain("4y")).toBe("weekly");
  });
  it("auto grain is monthly for All", () => {
    expect(autoGrain("all")).toBe("monthly");
  });
  it("auto grain is hourly for 1D", () => {
    expect(autoGrain("1d")).toBe("hourly");
  });
  it("ytd starts at January 1", () => {
    expect(resolveRange("ytd", now).from).toBe("2026-01-01");
  });
  it("rolling presets include the current time", () => {
    expect(resolveRange("1d", now).to).toContain("T12:00:00.000Z");
    expect(resolveRange("1d", now).from).toContain("T");
  });
});
