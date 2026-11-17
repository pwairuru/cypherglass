import { describe, expect, it } from "vitest";
import {
  cssVar,
  cypherGlassChartOptions,
  metricLineColor,
  priceLineColor,
} from "./chartTheme";

describe("cssVar", () => {
  it("emits comma-syntax hsl zrender can parse", () => {
    document.documentElement.style.setProperty("--chart-1", "217 91% 60%");
    expect(cssVar("--chart-1", "#000")).toBe("hsl(217, 91%, 60%)");
  });

  it("falls back when var missing", () => {
    expect(cssVar("--nope-missing", "#abc")).toBe("#abc");
  });

  it("passes hex brand vars through untouched", () => {
    document.documentElement.style.setProperty("--cg-metric", "#0d9488");
    expect(cssVar("--cg-metric", "#000")).toBe("#0d9488");
  });
});

describe("cypherGlassChartOptions", () => {
  it("hides candles in line mode, shows brand candles otherwise", () => {
    const line = cypherGlassChartOptions(true);
    expect(line.upColor).toBe("transparent");
    expect(line.backgroundColor).toBe("transparent");
    expect(line.grid.show).toBe(true);

    const candles = cypherGlassChartOptions(false);
    expect(candles.upColor).not.toBe("transparent");
    expect(candles.downColor).not.toBe("transparent");
  });

  it("exposes distinct metric and price colors", () => {
    expect(metricLineColor()).not.toBe(priceLineColor());
  });
});
