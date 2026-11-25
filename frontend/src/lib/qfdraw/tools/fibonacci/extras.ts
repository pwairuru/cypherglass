// frontend/src/lib/qfdraw/tools/fibonacci/extras.ts
// Attribution: levels adapted from lightweight-charts-drawing MIT, tools/fibonacci.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, anchorDot, ctxColor, ctxDash, ctxDashOr, ctxWidth, groupEl, hitLine, lineEl, labelEl } from "../../base";
export const FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618];
const TZ = [0, 1, 1.618, 2.618, 4.236];
type P = [number, number];
export class FibonacciRetracementRenderer implements DrawingRenderer {
  type = "fibonacci";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const startX = Math.min(a[0], b[0]);
    const endX = Math.max(a[0], b[0]);
    const width = endX - startX;
    const diffY = b[1] - a[1];
    const startVal = (ctx.drawing.points?.[0] as { value?: number })?.value ?? 0;
    const endVal = (ctx.drawing.points?.[1] as { value?: number })?.value ?? 0;
    const valDiff = endVal - startVal;
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const kids: any[] = [];
    FIB_RETRACEMENT_LEVELS.forEach((level, index) => {
      const y = b[1] - diffY * level;
      kids.push(lineEl([startX, y], [endX, y], { color, lineWidth, dash }));
      kids.push(labelEl([startX + 5, y - 10], `${level} (${(endVal - valDiff * level).toFixed(2)})`, { color }));
      if (index < FIB_RETRACEMENT_LEVELS.length - 1) {
        const nextY = b[1] - diffY * FIB_RETRACEMENT_LEVELS[index + 1];
        kids.push({
          type: "rect",
          name: "line",
          shape: { x: startX, y: Math.min(y, nextY), width, height: Math.abs(nextY - y) },
          style: { fill: color, opacity: 0.08 },
        });
      }
    });
    kids.push(hitLine([a[0], a[1]], [b[0], b[1]], Math.max(10, lineWidth + 8)));
    kids.push(lineEl([a[0], a[1]], [b[0], b[1]], {
      color,
      lineWidth,
      dash: ctxDashOr(ctx, [4, 4]),
      name: "line",
    }));
    kids.push(anchorDot(a, color), anchorDot(b, color));
    return groupEl(kids);
  }
}
export class FibonacciRetracementTool extends QfTool { constructor() { super("qf:fibonacci"); } }
export class FibExtensionRenderer implements DrawingRenderer {
  type = "fibExtension";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const kids: any[] = [];
    for (const r of FIB_EXTENSION_LEVELS) {
      const y = a[1] + (b[1] - a[1]) * r;
      kids.push(
        lineEl([Math.min(a[0], b[0]) - 40, y], [Math.max(a[0], b[0]) + 40, y], { color, lineWidth, dash }),
        labelEl([Math.max(a[0], b[0]) + 42, y], String(r), { color }),
      );
    }
    return groupEl(kids);
  }
}
function timeLines(ctx: DrawingRenderContext, xs: number[], top: number, height: number): any[] {
  const color = ctxColor(ctx);
  const lineWidth = ctxWidth(ctx);
  const dash = ctxDash(ctx);
  const kids: any[] = [];
  for (const x of xs) {
    kids.push(lineEl([x, top], [x, top + height], { color, lineWidth, dash }));
  }
  return kids;
}
export class FibTimeZoneRenderer implements DrawingRenderer {
  type = "fibTimeZone";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const dx = b[0] - a[0];
    const box = ctx.coordSys;
    const top = box?.y ?? 0;
    const height = box?.height ?? 220;
    const xs = TZ.map((r) => a[0] + dx * r);
    const color = ctxColor(ctx);
    const kids = timeLines(ctx, xs, top, height);
    TZ.forEach((r, i) => kids.push(labelEl([xs[i], top + 12], String(r), { color })));
    return groupEl(kids);
  }
}
export class FibTimeExtensionRenderer implements DrawingRenderer {
  type = "fibTimeExtension";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [, b, c] = pts;
    const base = c[0] - b[0];
    const box = ctx.coordSys;
    const xs = [1, 1.618, 2.618].map((r) => c[0] + base * r);
    const color = ctxColor(ctx);
    const kids = timeLines(ctx, xs, box?.y ?? 0, box?.height ?? 220);
    [1, 1.618, 2.618].forEach((r, i) => kids.push(labelEl([xs[i], (box?.y ?? 0) + 12], String(r), { color })));
    return groupEl(kids);
  }
}
export class FibCirclesRenderer implements DrawingRenderer {
  type = "fibCircles";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const r0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([0.382, 0.618, 1].map((f) => ({
      type: "circle",
      shape: { cx: a[0], cy: a[1], r: r0 * f },
      style: { stroke: color, lineWidth, fill: "transparent", ...(dash ? { lineDash: dash } : {}) },
    })));
  }
}
export class FibSpiralRenderer implements DrawingRenderer {
  type = "fibSpiral";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const out: P[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 4;
      const r = (Math.hypot(b[0] - a[0], b[1] - a[1]) / 8) * t;
      out.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)]);
    }
    return groupEl([{
      type: "polyline",
      shape: { points: out },
      style: { stroke: ctxColor(ctx), lineWidth: ctxWidth(ctx), ...(ctxDash(ctx) ? { lineDash: ctxDash(ctx) } : {}) },
    }]);
  }
}
export class FibArcsRenderer implements DrawingRenderer {
  type = "fibArcs";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([0.382, 0.5, 0.618].map((f) => ({
      type: "arc",
      shape: { cx: a[0], cy: a[1], r: r * f, startAngle: 0, endAngle: Math.PI },
      style: { stroke: color, lineWidth, ...(dash ? { lineDash: dash } : {}) },
    })));
  }
}
export class FibWedgeRenderer implements DrawingRenderer {
  type = "fibWedge";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [a, b, c] = pts;
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const kids: any[] = [
      lineEl(a, b, { color, lineWidth, dash }),
      lineEl(a, c, { color, lineWidth, dash }),
    ];
    for (const f of [0.382, 0.618]) {
      kids.push(lineEl(
        [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
        [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f],
        { color, lineWidth, dash: ctxDashOr(ctx, [4, 4]) },
      ));
    }
    return groupEl(kids);
  }
}
export class PitchfanRenderer implements DrawingRenderer {
  type = "pitchfan";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [a, b, c] = pts;
    const color = ctxColor(ctx);
    const lineWidth = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([
      lineEl(a, b, { color, lineWidth, dash }),
      lineEl(a, c, { color, lineWidth, dash }),
      lineEl(a, [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], { color, lineWidth, dash }),
    ]);
  }
}
export class FibExtensionTool extends QfTool { constructor() { super("qf:fibExtension"); } }
export class FibTimeZoneTool extends QfTool { constructor() { super("qf:fibTimeZone"); } }
export class FibTimeExtensionTool extends QfTool { constructor() { super("qf:fibTimeExtension"); } }
export class FibCirclesTool extends QfTool { constructor() { super("qf:fibCircles"); } }
export class FibSpiralTool extends QfTool { constructor() { super("qf:fibSpiral"); } }
export class FibArcsTool extends QfTool { constructor() { super("qf:fibArcs"); } }
export class FibWedgeTool extends QfTool { constructor() { super("qf:fibWedge"); } }
export class PitchfanTool extends QfTool { constructor() { super("qf:pitchfan"); } }
