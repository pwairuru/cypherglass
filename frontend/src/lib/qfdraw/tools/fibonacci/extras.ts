// frontend/src/lib/qfdraw/tools/fibonacci/extras.ts
// Attribution: levels adapted from lightweight-charts-drawing MIT, tools/fibonacci.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, labelEl } from "../../base";
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618];
const TZ = [0, 1, 1.618, 2.618, 4.236];
type P = [number, number];
export class FibExtensionRenderer implements DrawingRenderer {
  type = "fibExtension";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const kids: any[] = [];
    for (const r of FIB_EXTENSION_LEVELS) {
      const y = a[1] + (b[1] - a[1]) * r;
      kids.push(
        lineEl([Math.min(a[0], b[0]) - 40, y], [Math.max(a[0], b[0]) + 40, y], { color: "#F23645" }),
        labelEl([Math.max(a[0], b[0]) + 42, y], String(r), { color: "#F23645" }),
      );
    }
    return groupEl(kids);
  }
}
export class FibTimeZoneRenderer implements DrawingRenderer {
  type = "fibTimeZone";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const dx = b[0] - a[0];
    const kids: any[] = [];
    for (const r of TZ) { const x = a[0] + dx * r; kids.push(lineEl([x, 0], [x, 220], { color: "#089981" })); }
    return groupEl(kids);
  }
}
export class FibTimeExtensionRenderer implements DrawingRenderer {
  type = "fibTimeExtension";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [a, b, c] = pts;
    void a;
    const base = c[0] - b[0];
    const kids: any[] = [];
    for (const r of [1, 1.618, 2.618]) { const x = c[0] + base * r; kids.push(lineEl([x, 0], [x, 220], { color: "#089981" })); }
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
    return groupEl([0.382, 0.618, 1].map((f) => ({ type: "circle", shape: { cx: a[0], cy: a[1], r: r0 * f }, style: { stroke: "#F23645", lineWidth: 1, fill: "transparent" } })));
  }
}
export class FibSpiralRenderer implements DrawingRenderer {
  type = "fibSpiral";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const out: P[] = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 4; const r = (Math.hypot(b[0] - a[0], b[1] - a[1]) / 8) * t; out.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)]); }
    return groupEl([{ type: "polyline", shape: { points: out }, style: { stroke: "#F23645", lineWidth: 1 } }]);
  }
}
export class FibArcsRenderer implements DrawingRenderer {
  type = "fibArcs";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [a, b] = pts;
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return groupEl([0.382, 0.5, 0.618].map((f) => ({ type: "arc", shape: { cx: a[0], cy: a[1], r: r * f, startAngle: 0, endAngle: Math.PI }, style: { stroke: "#F23645", lineWidth: 1 } })));
  }
}
export class FibWedgeRenderer implements DrawingRenderer {
  type = "fibWedge";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [a, b, c] = pts;
    const kids: any[] = [lineEl(a, b, { color: "#F23645" }), lineEl(a, c, { color: "#F23645" })];
    for (const f of [0.382, 0.618]) { kids.push(lineEl([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f], { color: "#F23645", dash: [4, 4] })); }
    return groupEl(kids);
  }
}
export class PitchfanRenderer implements DrawingRenderer {
  type = "pitchfan";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as P[] | undefined;
    if (!pts || pts.length < 3) return groupEl([]);
    const [a, b, c] = pts;
    return groupEl([lineEl(a, b, { color: "#2962FF" }), lineEl(a, c, { color: "#2962FF" }), lineEl(a, [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], { color: "#2962FF" })]);
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
