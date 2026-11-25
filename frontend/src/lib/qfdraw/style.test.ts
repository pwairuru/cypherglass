import { describe, it, expect, beforeEach } from "vitest";
import {
  DRAWING_COLORS,
  DRAWING_WIDTHS,
  LINE_FAMILY,
  contrastText,
  dashForStyle,
  defaultDrawingStyle,
  humanizeDrawingType,
  normalizeDrawingStyle,
  saveDefaultDrawingStyle,
} from "./style";

beforeEach(() => {
  localStorage.clear();
});

describe("drawing style defaults", () => {
  it("uses the professional blue 2px solid default", () => {
    expect(defaultDrawingStyle()).toEqual({
      color: "#2962FF",
      lineWidth: 2,
      lineStyle: "solid",
    });
    expect(DRAWING_COLORS).toContain("#2962FF");
    expect(DRAWING_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(DRAWING_WIDTHS).toEqual(expect.arrayContaining([1, 2, 3, 4]));
  });

  it("persists a user default for the next drawing", () => {
    saveDefaultDrawingStyle({ color: "#F23645", lineWidth: 3, lineStyle: "dashed" });
    expect(defaultDrawingStyle()).toEqual({
      color: "#F23645",
      lineWidth: 3,
      lineStyle: "dashed",
    });
  });
});

describe("dashForStyle", () => {
  it("maps line styles to ECharts dash arrays", () => {
    expect(dashForStyle({ lineStyle: "solid" })).toBeUndefined();
    expect(dashForStyle({ lineStyle: "dashed" })).toEqual([6, 4]);
    expect(dashForStyle({ lineStyle: "dotted" })).toEqual([2, 3]);
    expect(dashForStyle(undefined)).toBeUndefined();
  });
});

describe("contrastText", () => {
  it("picks dark text on light swatches and white on dark ones", () => {
    expect(contrastText("#FFFFFF")).toBe("#131722");
    expect(contrastText("#FFD600")).toBe("#131722");
    expect(contrastText("#2962FF")).toBe("#FFFFFF");
    expect(contrastText("#131722")).toBe("#FFFFFF");
  });
});

describe("humanizeDrawingType", () => {
  it("turns registry keys into readable titles", () => {
    expect(humanizeDrawingType("horizontal-ray")).toBe("Horizontal Ray");
    expect(humanizeDrawingType("fibExtension")).toBe("Fib Extension");
    expect(humanizeDrawingType("andrewsPitchfork")).toBe("Andrews Pitchfork");
  });
});

describe("normalizeDrawingStyle", () => {
  it("migrates the old QFChart line default to the new blue 2px default", () => {
    const style = normalizeDrawingStyle("line", {
      color: "#d1d4dc",
      lineWidth: 1,
      text: "keep me",
    });
    expect(style).toMatchObject({
      color: "#2962FF",
      lineWidth: 2,
      lineStyle: "solid",
      text: "keep me",
    });
  });

  it("fills missing line-family values without touching a user colour", () => {
    const style = normalizeDrawingStyle("horizontal-line", { color: "#F23645" });
    expect(style).toMatchObject({ color: "#F23645", lineWidth: 2, lineStyle: "solid" });
  });

  it("keeps an explicit 1px line width (the toolbar offers it)", () => {
    const style = normalizeDrawingStyle("line", { color: "#F23645", lineWidth: 1 });
    expect(style).toMatchObject({ color: "#F23645", lineWidth: 1, lineStyle: "solid" });
  });

  it("preserves explicit non-line colours and width", () => {
    const style = normalizeDrawingStyle("rectangle", {
      color: "#9C27B0",
      lineWidth: 1,
      lineStyle: "dotted",
    });
    expect(style).toMatchObject({ color: "#9C27B0", lineWidth: 1, lineStyle: "dotted" });
  });

  it("covers the whole line family", () => {
    for (const type of [
      "line",
      "horizontal-line",
      "vertical-line",
      "ray",
      "horizontal-ray",
      "vertical-ray",
      "extended-line",
      "arrow",
    ]) {
      expect(LINE_FAMILY.has(type), type).toBe(true);
    }
  });
});
