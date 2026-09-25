import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollinger } from "./indicators";
describe("sma/ema", () => {
  it("sma(3) of 1..5", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("ema seeds from first value", () => {
    const out = ema([10, 10, 10], 2);
    expect(out[2]).toBeCloseTo(10);
  });
});
describe("rsi", () => {
  it("all-up trend pins at 100", () => {
    const up = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(rsi(up, 14)).toEqual([...Array(14).fill(null), 100]);
  });
  it("all-down trend pins at 0", () => {
    const dn = Array.from({ length: 15 }, (_, i) => 15 - i);
    expect(rsi(dn, 14)).toEqual([...Array(14).fill(null), 0]);
  });
  it("stays null until period then bounded 0..100", () => {
    const mixed = [10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19];
    const out = rsi(mixed, 14);
    expect(out.slice(0, 14)).toEqual(Array(14).fill(null));
    expect(out[14]).toBeGreaterThan(50);
    expect(out[14]).toBeLessThanOrEqual(100);
    expect(out[15]).toBeGreaterThan(0);
    expect(out[15]).toBeLessThanOrEqual(100);
  });
});
describe("macd", () => {
  it("flat series converges to zero", () => {
    const { macdLine, signalLine, histogram } = macd(Array(50).fill(10));
    expect(macdLine[24]).toBeNull();
    expect(macdLine[25]).toBeCloseTo(0);
    expect(signalLine[49]).toBeCloseTo(0);
    expect(histogram[49]).toBeCloseTo(0);
  });
  it("rising series gives positive macd", () => {
    const rise = Array.from({ length: 60 }, (_, i) => i + 1);
    const { macdLine, signalLine, histogram } = macd(rise);
    expect(macdLine[59]).toBeGreaterThan(0);
    expect(macdLine[59]).toBeCloseTo(7, 0);
    expect(signalLine[59]).toBeGreaterThan(0);
    expect(histogram[59]).toBeCloseTo(0, 1);
  });
});
describe("bollinger", () => {
  it("golden vector on 1..5, period 3, mult 2", () => {
    const { upper, middle, lower } = bollinger([1, 2, 3, 4, 5], 3, 2);
    expect(middle).toEqual([null, null, 2, 3, 4]);
    expect(upper[4]).toBeCloseTo(5.633, 3);
    expect(lower[4]).toBeCloseTo(2.367, 3);
    expect(upper[0]).toBeNull();
    expect(lower[0]).toBeNull();
  });
  it("flat series bands equal price", () => {
    const { upper, middle, lower } = bollinger(Array(25).fill(10));
    expect(middle[24]).toBeCloseTo(10);
    expect(upper[24]).toBeCloseTo(10);
    expect(lower[24]).toBeCloseTo(10);
  });
});
