// frontend/src/lib/qfdraw/foundation.test.ts
import { describe, it, expect } from "vitest";
import { distanceToSegment, lerp, fibPrices } from "./geometry";
import { timeToIndex } from "./coordinates";
import { groupEl, lineEl } from "./base";

describe("foundation", () => {
  it("point-to-segment distance", () => {
    expect(distanceToSegment(0, 0, 10, 0, 5, 3)).toBeCloseTo(3);
    expect(distanceToSegment(0, 0, 10, 0, 15, 0)).toBeCloseTo(5);
  });
  it("lerp + fib prices", () => {
    expect(lerp(100, 200, 0.382)).toBeCloseTo(138.2);
    expect(fibPrices(100, 200, [0, 0.382, 1])).toEqual([100, 138.2, 200]);
  });
  it("time -> index mapping clamps", () => {
    expect(timeToIndex([10, 20, 30], 20)).toBe(1);
    expect(timeToIndex([10, 20, 30], 5)).toBe(0);
    expect(timeToIndex([10, 20, 30], 99)).toBe(2);
  });
  it("echarts element builders shape", () => {
    const g = groupEl([lineEl([0, 0], [10, 10], { color: "#fff", lineWidth: 2 })]);
    expect(g.type).toBe("group");
    expect(g.children[0].type).toBe("line");
    expect(g.children[0].shape).toEqual({ x1: 0, y1: 0, x2: 10, y2: 10 });
  });
});
