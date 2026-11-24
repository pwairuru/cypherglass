import { describe, expect, it } from "vitest";
import { simulateDca, simulateLumpSum } from "./dca";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2024, 0, 1);
// closes 100, 200, 400 across three days
const BARS = [
  { time: T0, close: 100 },
  { time: T0 + DAY, close: 200 },
  { time: T0 + 2 * DAY, close: 400 },
];
const FROM = T0;
const TO = T0 + 2 * DAY;

describe("simulateDca", () => {
  it("buys every bar on a daily schedule", () => {
    const r = simulateDca(BARS, 100, 1, FROM, TO);
    expect(r.buys).toBe(3);
    expect(r.invested).toBe(300);
    expect(r.btc).toBeCloseTo(1 + 0.5 + 0.25, 10);
    expect(r.lastPrice).toBe(400);
    expect(r.value).toBeCloseTo(700, 10);
    expect(r.multiple).toBeCloseTo(700 / 300, 10);
  });

  it("skips bars inside the interval on a 2-day schedule", () => {
    const r = simulateDca(BARS, 100, 2, FROM, TO);
    expect(r.buys).toBe(2);
    expect(r.invested).toBe(200);
    expect(r.btc).toBeCloseTo(1.25, 10);
    expect(r.value).toBeCloseTo(500, 10);
  });

  it("ignores null closes and empty ranges", () => {
    expect(simulateDca([], 100, 7, FROM, TO).buys).toBe(0);
    expect(simulateDca([{ time: T0, close: null }], 100, 7, FROM, TO).invested).toBe(0);
    expect(simulateDca(BARS, 0, 7, FROM, TO).buys).toBe(0);
    expect(simulateDca(BARS, 100, 0, FROM, TO).buys).toBe(0);
  });
});

describe("simulateLumpSum", () => {
  it("buys once at the first close", () => {
    const r = simulateLumpSum(BARS, 300, FROM, TO);
    expect(r.buys).toBe(1);
    expect(r.btc).toBeCloseTo(3, 10);
    expect(r.value).toBeCloseTo(1200, 10);
    expect(r.multiple).toBeCloseTo(4, 10);
  });

  it("returns zeros with no data or no amount", () => {
    expect(simulateLumpSum([], 300, FROM, TO).value).toBe(0);
    expect(simulateLumpSum(BARS, -5, FROM, TO).value).toBe(0);
  });
});
