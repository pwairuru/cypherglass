import { describe, it, expect, beforeEach } from "vitest";
import {
  ExtendedLineRenderer,
  ExtendedLineTool,
  HorizontalLineRenderer,
  HorizontalLineTool,
  HorizontalRayRenderer,
  HorizontalRayTool,
  LineRenderer,
  LineTool,
  RayRenderer,
  RayTool,
  VerticalLineRenderer,
  VerticalLineTool,
  VerticalRayRenderer,
  VerticalRayTool,
} from "./lineFamily";
import { ArrowDrawingRenderer } from "./arrow";
import { saveDefaultDrawingStyle } from "../../style";
import type { QfTool } from "../../base";

beforeEach(() => {
  localStorage.clear();
});

const CS = { x: 0, y: 0, width: 600, height: 400 };

function ctx(type: string, px: [number, number][], style: Record<string, unknown> = {}) {
  return {
    drawing: {
      id: "d1",
      type,
      points: px.map((_, i) => ({ timeIndex: i, value: 100 + i * 10 })),
      style: { color: "#2962FF", lineWidth: 2, lineStyle: "solid", ...style },
    },
    pixelPoints: px,
    isSelected: false,
    api: {},
    coordSys: CS,
  } as any;
}

function visualLine(g: any) {
  return g.children.find(
    (k: any) => k.type === "line" && k.style?.stroke !== "rgba(0,0,0,0)",
  );
}

function bodyLine(g: any) {
  return g.children.find((k: any) => k.type === "line" && k.name === "line");
}

function anchors(g: any) {
  return g.children.filter((k: any) => k.type === "circle" && k.style?.stroke);
}

describe("trend line", () => {
  it("uses the drawing colour, width and dash and shows endpoint dots", () => {
    const g = new LineRenderer().render(
      ctx("line", [[100, 100], [300, 200]], {
        color: "#F23645",
        lineWidth: 3,
        lineStyle: "dashed",
      }),
    );
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 100, y1: 100, x2: 300, y2: 200 });
    expect(line.style).toMatchObject({ stroke: "#F23645", lineWidth: 3, lineDash: [6, 4] });
    expect(bodyLine(g)).toBeDefined();
    expect(anchors(g)).toHaveLength(2);
    expect(anchors(g)[0].shape).toMatchObject({ cx: 100, cy: 100 });
    expect(anchors(g)[1].shape).toMatchObject({ cx: 300, cy: 200 });
  });

  it("renders nothing for fewer than two points", () => {
    const g = new LineRenderer().render(ctx("line", [[100, 100]]));
    expect(g.children).toEqual([]);
  });
});

describe("horizontal / vertical lines", () => {
  it("spans the pane, draws a price pill and keeps one anchor", () => {
    const g = new HorizontalLineRenderer().render(
      ctx("horizontal-line", [[200, 120]], { color: "#089981", lineWidth: 2 }),
    );
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 0, y1: 120, x2: 600, y2: 120 });
    expect(line.style).toMatchObject({ stroke: "#089981", lineWidth: 2 });
    const text = g.children.find((k: any) => k.type === "text");
    expect(text.style.text).toBe("100.00");
    expect(g.children.some((k: any) => k.type === "rect")).toBe(true);
    expect(anchors(g)).toHaveLength(1);
    expect(anchors(g)[0].shape).toMatchObject({ cx: 200, cy: 120 });
  });

  it("uses dark text on a light price pill", () => {
    const g = new HorizontalLineRenderer().render(
      ctx("horizontal-line", [[200, 120]], { color: "#FFD600", lineWidth: 2 }),
    );
    const text = g.children.find((k: any) => k.type === "text");
    expect(text.style.fill).toBe("#131722");
  });

  it("spans the pane vertically", () => {
    const g = new VerticalLineRenderer().render(ctx("vertical-line", [[240, 50]]));
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 240, y1: 0, x2: 240, y2: 400 });
    expect(anchors(g)).toHaveLength(1);
  });
});

describe("rays and extended lines", () => {
  it("extends a ray to the pane edge through the second anchor", () => {
    const g = new RayRenderer().render(ctx("ray", [[100, 100], [200, 150]]));
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 100, y1: 100, x2: 600, y2: 350 });
    expect(anchors(g).length).toBeGreaterThanOrEqual(1);
    expect(anchors(g)[0].shape).toMatchObject({ cx: 100, cy: 100 });
  });

  it("extends a horizontal ray to the right edge", () => {
    const g = new HorizontalRayRenderer().render(ctx("horizontal-ray", [[200, 110]]));
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 200, y1: 110, x2: 600, y2: 110 });
    expect(anchors(g)).toHaveLength(1);
  });

  it("extends a vertical ray to the bottom edge", () => {
    const g = new VerticalRayRenderer().render(ctx("vertical-ray", [[260, 150]]));
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 260, y1: 150, x2: 260, y2: 400 });
    expect(anchors(g)).toHaveLength(1);
  });

  it("extends an extended line both ways", () => {
    const g = new ExtendedLineRenderer().render(ctx("extended-line", [[100, 100], [200, 150]]));
    const line = visualLine(g);
    expect(line.shape).toMatchObject({ x1: 0, y1: 50, x2: 600, y2: 350 });
    expect(anchors(g)).toHaveLength(2);
  });
});

describe("arrow renderer style", () => {
  it("honours the drawing colour and width", () => {
    const g = new ArrowDrawingRenderer().render(
      ctx("arrow", [[50, 50], [250, 150]], { color: "#FF9800", lineWidth: 3 }),
    );
    const line = visualLine(g);
    expect(line.style).toMatchObject({ stroke: "#FF9800", lineWidth: 3 });
    const head = g.children.find((k: any) => k.type === "polygon");
    expect(head.style.fill).toBe("#FF9800");
  });
});

describe("line tool creation", () => {
  function harness(tool: QfTool) {
    const added: any[] = [];
    const handlers: Record<string, (e: any) => void> = {};
    const zr = {
      on: (ev: string, h: (e: any) => void) => { handlers[ev] = h; },
      off: (ev: string) => { delete handlers[ev]; },
      setCursorStyle: () => {},
      add: () => {},
      remove: () => {},
    };
    tool.init({
      addDrawing: (d: any) => added.push(d),
      disableTools: () => {},
      lockChart: () => {},
      unlockChart: () => {},
      coordinateConversion: {
        pixelToData: ({ x, y }: { x: number; y: number }) => ({ timeIndex: x / 10, value: y, paneIndex: 0 }),
      },
      getChart: () => ({ getZr: () => zr }),
    } as any);
    return { added, handlers };
  }

  it("creates a trend line with the shared default style", () => {
    const tool = new LineTool();
    tool.drawingType = "line";
    tool.anchorCount = 2;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({ offsetX: 20, offsetY: 50 });
    h.handlers.click({ offsetX: 120, offsetY: 150 });
    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toMatchObject({
      type: "line",
      style: { color: "#2962FF", lineWidth: 2, lineStyle: "solid" },
    });
  });

  it("creates a one-point horizontal line on the first click", () => {
    const tool = new HorizontalLineTool();
    tool.drawingType = "horizontal-line";
    tool.anchorCount = 1;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({ offsetX: 90, offsetY: 80 });
    expect(h.added).toHaveLength(1);
    expect(h.added[0].points).toHaveLength(1);
  });

  it("uses a saved default colour for new line tools", () => {
    saveDefaultDrawingStyle({ color: "#E91E63", lineWidth: 3, lineStyle: "dotted" });
    const tool = new VerticalRayTool();
    tool.drawingType = "vertical-ray";
    tool.anchorCount = 1;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({ offsetX: 10, offsetY: 10 });
    expect(h.added[0].style).toMatchObject({
      color: "#E91E63",
      lineWidth: 3,
      lineStyle: "dotted",
    });
  });
});
