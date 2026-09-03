import { describe, expect, it } from "vitest";
import { cssVar } from "./chartTheme";

describe("cssVar", () => {
  it("emits comma-syntax hsl zrender can parse", () => {
    document.documentElement.style.setProperty("--chart-1", "217 91% 60%");
    expect(cssVar("--chart-1", "#000")).toBe("hsl(217, 91%, 60%)");
  });

  it("falls back when var missing", () => {
    expect(cssVar("--nope-missing", "#abc")).toBe("#abc");
  });
});
