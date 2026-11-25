// Cross-group contract: every renderer follows the selected drawing's style
// instead of hard-coded library colours, and pane-bound tools use coordSys.
import { describe, it, expect } from "vitest";
import { FlatTopBottomRenderer, ParallelChannelRenderer, RegressionTrendRenderer } from "./channels/channels";
import { AndrewsPitchforkRenderer } from "./pitchforks/pitchforks";
import { FibExtensionRenderer, FibTimeZoneRenderer, FibCirclesRenderer, FibWedgeRenderer, PitchfanRenderer } from "./fibonacci/extras";
import { GannBoxRenderer, GannFanRenderer, GannSquareRenderer } from "./gann/gann";
import { LongPositionRenderer, ShortPositionRenderer, ForecastRenderer, ProjectionRenderer, PriceRangeRenderer } from "./forecast/forecast";
import { DoubleCurveRenderer, RectangleRenderer } from "./shapes/shapes";
import { AnchoredTextRenderer, CalloutRenderer, HighlighterRenderer, ArrowMarkerRenderer, PriceNoteRenderer } from "./annotations/annotations";

const CS = { x: 0, y: 0, width: 600, height: 400 };
const STYLE = { color: "#F23645", lineWidth: 3, lineStyle: "dashed" };

function ctx(type: string, px: [number, number][], style: Record<string, unknown> = STYLE) {
  return {
    drawing: {
      id: "d",
      type,
      points: px.map((_, i) => ({ timeIndex: i, value: 100 + i * 10 })),
      style,
    },
    pixelPoints: px,
    isSelected: false,
    api: {},
    coordSys: CS,
  } as any;
}

function strokes(g: any): any[] {
  return g.children.filter((c: any) => ["line", "polyline", "polygon"].includes(c.type));
}

function expectStyled(g: any, color = STYLE.color, width = STYLE.lineWidth) {
  const painted = strokes(g);
  expect(painted.length).toBeGreaterThan(0);
  for (const s of painted) {
    expect(s.style.stroke ?? s.style.fill, `${s.type} colour`).toBe(color);
    if (s.type !== "polygon") expect(s.style.lineWidth, `${s.type} width`).toBe(width);
  }
}

describe("renderers adopt the drawing style", () => {
  it("parallel channel", () => {
    const g = new ParallelChannelRenderer().render(ctx("parallelChannel", [[50, 50], [250, 50], [50, 150]]));
    expectStyled(g);
    const line = g.children.find((c: any) => c.type === "line");
    expect(line.style.lineDash).toEqual([6, 4]);
  });

  it("regression trend", () => {
    const g = new RegressionTrendRenderer().render(ctx("regressionTrend", [[50, 50], [250, 150]]));
    expectStyled(g);
  });

  it("pitchfork", () => {
    const g = new AndrewsPitchforkRenderer().render(ctx("andrewsPitchfork", [[50, 50], [150, 150], [250, 50]]));
    expectStyled(g);
  });

  it("fib extension and labels", () => {
    const g = new FibExtensionRenderer().render(ctx("fibExtension", [[50, 50], [250, 150]]));
    expectStyled(g);
    for (const text of g.children.filter((c: any) => c.type === "text")) {
      expect(text.style.fill).toBe(STYLE.color);
    }
  });

  it("fib time zone fills the pane height", () => {
    const g = new FibTimeZoneRenderer().render(ctx("fibTimeZone", [[50, 50], [250, 150]]));
    expectStyled(g);
    const line = g.children.find((c: any) => c.type === "line");
    expect(line.shape).toMatchObject({ y1: 0, y2: 400 });
  });

  it("fib circles", () => {
    const g = new FibCirclesRenderer().render(ctx("fibCircles", [[100, 100], [200, 100]]));
    const circles = g.children.filter((c: any) => c.type === "circle");
    expect(circles.length).toBeGreaterThan(0);
    expect(circles[0].style.stroke).toBe(STYLE.color);
    expect(circles[0].style.lineWidth).toBe(STYLE.lineWidth);
  });

  it("pitchfan", () => {
    const g = new PitchfanRenderer().render(ctx("pitchfan", [[50, 50], [150, 150], [250, 50]]));
    expectStyled(g);
  });

  it("gann box and fan", () => {
    for (const renderer of [new GannBoxRenderer(), new GannFanRenderer()]) {
      const g = renderer.render(ctx(renderer.type, [[50, 50], [250, 150]]));
      expectStyled(g);
    }
  });

  it("forecast and price range use style + pane width", () => {
    const forecast = new ForecastRenderer().render(ctx("forecast", [[50, 50], [250, 150]]));
    expectStyled(forecast);
    const range = new PriceRangeRenderer().render(ctx("priceRange", [[50, 50], [250, 150]]));
    expectStyled(range);
    const line = range.children.find((c: any) => c.type === "line");
    expect(line.shape).toMatchObject({ x1: 0, x2: 600 });
  });

  it("an explicit Solid style removes every secondary dash", () => {
    const solid = { ...STYLE, lineStyle: "solid" };
    const cases: [any, string, [number, number][]][] = [
      [new RegressionTrendRenderer(), "regressionTrend", [[50, 50], [250, 150]]],
      [new FlatTopBottomRenderer(), "flatTopBottom", [[50, 50], [250, 50], [50, 150]]],
      [new FibWedgeRenderer(), "fibWedge", [[50, 50], [250, 150], [250, 50]]],
      [new ProjectionRenderer(), "projection", [[50, 50], [150, 150], [250, 50]]],
      [new GannSquareRenderer(), "gannSquare", [[50, 50], [250, 150]]],
      [new DoubleCurveRenderer(), "doubleCurve", [[50, 50], [150, 150], [250, 50]]],
      [new AnchoredTextRenderer(), "anchoredText", [[50, 50], [250, 150]]],
      [new PriceNoteRenderer(), "priceNote", [[50, 50]]],
    ];
    for (const [renderer, type, px] of cases) {
      const g = renderer.render(ctx(type, px, solid));
      const dashed = g.children.filter((c: any) => c.style?.lineDash);
      expect(dashed, type).toEqual([]);
    }
  });

  it("long/short positions keep semantic defaults but accept a custom colour", () => {
    const longDefault = new LongPositionRenderer().render(ctx("longPosition", [[50, 50], [250, 150]], {}));
    const shortDefault = new ShortPositionRenderer().render(ctx("shortPosition", [[50, 50], [250, 150]], {}));
    expect(longDefault.children[0].style.fill).toBe("#089981");
    expect(shortDefault.children[0].style.fill).toBe("#F23645");
    const custom = new LongPositionRenderer().render(
      ctx("longPosition", [[50, 50], [250, 150]], { color: "#9C27B0", lineWidth: 2 }),
    );
    expect(custom.children[0].style.fill).toBe("#9C27B0");
  });

  it("rectangle uses the dashed style", () => {
    const g = new RectangleRenderer().render(ctx("rectangle", [[50, 50], [250, 150]]));
    const rect = g.children.find((c: any) => c.type === "rect");
    expect(rect.style.lineDash).toEqual([6, 4]);
  });

  it("callout, highlighter, arrow marker, price note", () => {
    const callout = new CalloutRenderer().render(ctx("callout", [[50, 50], [250, 150]]));
    expectStyled(callout);
    const highlighter = new HighlighterRenderer().render(ctx("highlighter", [[50, 50], [150, 60]]));
    expect(highlighter.children[0].style.stroke).toBe(STYLE.color);
    const marker = new ArrowMarkerRenderer().render(ctx("arrowMarker", [[50, 50]]));
    expect(marker.children[0].style.fill).toBe(STYLE.color);
    const note = new PriceNoteRenderer().render(ctx("priceNote", [[50, 50]]));
    expect(note.children[0].style.stroke).toBe(STYLE.color);
  });
});
