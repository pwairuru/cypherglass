// frontend/src/lib/qfdraw/tools/lines/lineFamily.ts
// First-party line tools replacing QFChart's built-ins (which drew a cold
// grey 1px line and could not be restyled). Geometry follows TradingView:
// horizontal/vertical lines span the pane, rays extend to one edge, the
// extended line goes both ways, and every line keeps visible anchor dots.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { contrastText } from "../../style";
import {
  QfTool,
  anchorDot,
  ctxColor,
  ctxDash,
  ctxWidth,
  groupEl,
  hitLine,
  lineEl,
} from "../../base";

type P = [number, number];
type Box = { x: number; y: number; width: number; height: number };

function boxOf(ctx: DrawingRenderContext): Box {
  const cs = ctx.coordSys;
  return { x: cs?.x ?? 0, y: cs?.y ?? 0, width: cs?.width ?? 0, height: cs?.height ?? 0 };
}

/** Distance along a ray until it leaves the pane box. */
function forwardT(a: P, d: P, box: Box): number {
  let t = Infinity;
  if (d[0] > 0) t = Math.min(t, (box.x + box.width - a[0]) / d[0]);
  else if (d[0] < 0) t = Math.min(t, (box.x - a[0]) / d[0]);
  if (d[1] > 0) t = Math.min(t, (box.y + box.height - a[1]) / d[1]);
  else if (d[1] < 0) t = Math.min(t, (box.y - a[1]) / d[1]);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/** a -> b ray extended to the pane edge. */
export function extendRay(a: P, b: P, box: Box): [P, P] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return [a, b];
  const t = forwardT(a, [dx, dy], box);
  return [a, [a[0] + dx * t, a[1] + dy * t]];
}

/** Infinite line through a and b, clipped to the pane. */
export function extendBoth(a: P, b: P, box: Box): [P, P] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return [a, b];
  const back = forwardT(a, [-dx, -dy], box);
  const fwd = forwardT(b, [dx, dy], box);
  return [
    [a[0] - dx * back, a[1] - dy * back],
    [b[0] + dx * fwd, b[1] + dy * fwd],
  ];
}

function priceText(ctx: DrawingRenderContext): string {
  const value = (ctx.drawing.points?.[0] as { value?: unknown } | undefined)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
}

function pricePill(x: number, y: number, color: string, text: string): any[] {
  if (!text) return [];
  return [
    {
      type: "rect",
      shape: { x, y: y - 9, width: 70, height: 18, r: 3 },
      style: { fill: color, opacity: 0.95 },
      silent: true,
      z: 20,
    },
    {
      type: "text",
      style: {
        x: x + 6,
        y: y + 4,
        text,
        fill: contrastText(color),
        font: "10px ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      silent: true,
      z: 21,
    },
  ];
}

function segment(ctx: DrawingRenderContext, start: P, end: P, dots: number[]): any {
  const color = ctxColor(ctx);
  const width = ctxWidth(ctx);
  const dash = ctxDash(ctx);
  const pts = ctx.pixelPoints as P[] | undefined;
  if (!pts || pts.length === 0) return groupEl([]);
  const kids: any[] = [
    hitLine(start, end, Math.max(10, width + 8)),
    lineEl(start, end, { color, lineWidth: width, dash, name: "line" }),
  ];
  for (const i of dots) {
    const p = pts[i];
    if (p) kids.push(anchorDot(p, color));
  }
  return groupEl(kids);
}

export class LineRenderer implements DrawingRenderer {
  type = "line";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    return segment(ctx, pts[0], pts[1], [0, 1]);
  }
}

export class HorizontalLineRenderer implements DrawingRenderer {
  type = "horizontal-line";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 1) return groupEl([]);
    const [a] = pts;
    const box = boxOf(ctx);
    const color = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const left = box.x;
    const right = box.x + box.width;
    return groupEl([
      hitLine([left, a[1]], [right, a[1]], Math.max(10, width + 8)),
      lineEl([left, a[1]], [right, a[1]], { color, lineWidth: width, dash, name: "line" }),
      ...pricePill(right - 74, a[1], color, priceText(ctx)),
      anchorDot([a[0], a[1]], color),
    ]);
  }
}

export class VerticalLineRenderer implements DrawingRenderer {
  type = "vertical-line";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 1) return groupEl([]);
    const [a] = pts;
    const box = boxOf(ctx);
    const color = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const top = box.y;
    const bottom = box.y + box.height;
    return groupEl([
      hitLine([a[0], top], [a[0], bottom], Math.max(10, width + 8)),
      lineEl([a[0], top], [a[0], bottom], { color, lineWidth: width, dash, name: "line" }),
      anchorDot([a[0], a[1]], color),
    ]);
  }
}

export class RayRenderer implements DrawingRenderer {
  type = "ray";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [start, end] = extendRay(pts[0], pts[1], boxOf(ctx));
    return segment(ctx, start, end, [0]);
  }
}

export class HorizontalRayRenderer implements DrawingRenderer {
  type = "horizontal-ray";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 1) return groupEl([]);
    const [a] = pts;
    const box = boxOf(ctx);
    const right = box.x + box.width;
    const color = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([
      hitLine([a[0], a[1]], [right, a[1]], Math.max(10, width + 8)),
      lineEl([a[0], a[1]], [right, a[1]], { color, lineWidth: width, dash, name: "line" }),
      anchorDot(a, color),
    ]);
  }
}

export class VerticalRayRenderer implements DrawingRenderer {
  type = "vertical-ray";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 1) return groupEl([]);
    const [a] = pts;
    const box = boxOf(ctx);
    const bottom = box.y + box.height;
    const color = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([
      hitLine([a[0], a[1]], [a[0], bottom], Math.max(10, width + 8)),
      lineEl([a[0], a[1]], [a[0], bottom], { color, lineWidth: width, dash, name: "line" }),
      anchorDot(a, color),
    ]);
  }
}

export class ExtendedLineRenderer implements DrawingRenderer {
  type = "extended-line";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [start, end] = extendBoth(pts[0], pts[1], boxOf(ctx));
    return segment(ctx, start, end, [0, 1]);
  }
}

export class LineTool extends QfTool { constructor() { super("qf:line"); } }
export class HorizontalLineTool extends QfTool { constructor() { super("qf:horizontal-line"); } }
export class VerticalLineTool extends QfTool { constructor() { super("qf:vertical-line"); } }
export class RayTool extends QfTool { constructor() { super("qf:ray"); } }
export class HorizontalRayTool extends QfTool { constructor() { super("qf:horizontal-ray"); } }
export class VerticalRayTool extends QfTool { constructor() { super("qf:vertical-ray"); } }
export class ExtendedLineTool extends QfTool { constructor() { super("qf:extended-line"); } }
