// frontend/src/lib/qfdraw/select.ts
// Makes ported drawings selectable + drag-editable by QFChart core.
// Contract (decoded from qfchart.min.es.js bindDrawingEvents):
// drawings render as ECharts custom series `drawings-pane-{N}`; core resolves
// clicks via seriesName+dataIndex and the clicked shape's `name`:
//   name "line"      -> body: select, hover cursor, drag-move, click events
//   name "point-{i}" -> vertex handle i: hover cursor, drag-edit of points[i]
// Handles show on hover (core toggles opacity) and while selected, so the
// wrapper draws them with opacity 0/1 by ctx.isSelected. Texts are silenced
// so clicks pass through to the body underneath.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { normalizeDrawingStyle, type QfDrawingStyle } from "./style";

const MAX_HANDLES = 50;

export function sampleIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  for (let k = 1; k < max - 1; k++) out.add(Math.round((k * (n - 1)) / (max - 1)));
  return [...out].sort((a, b) => a - b);
}

export function withSelection(inner: DrawingRenderer): DrawingRenderer {
  return {
    type: inner.type,
    render(ctx: DrawingRenderContext): any {
      const g = inner.render(ctx) as { type?: string; children?: any[] };
      const kids: any[] = Array.isArray(g?.children) ? g.children : [];
      for (const k of kids) {
        if (!k || typeof k !== "object") continue;
        if (k.type === "text") {
          k.silent = true;
          continue;
        }
        if (!k.name) k.name = "line";
      }
      const style = normalizeDrawingStyle(
        ctx.drawing.type,
        (ctx.drawing.style ?? {}) as QfDrawingStyle,
      );
      const color = style.color ?? "#2962FF";
      const pts = (ctx.pixelPoints ?? []) as [number, number][];
      const hasBody = kids.some((k) => k?.name === "line");
      if (!hasBody && pts.length > 0) {
        // Text-only drawings (e.g. Text): add an invisible hit disc so the
        // drawing stays clickable after its label is silenced.
        kids.push({
          type: "circle",
          name: "line",
          shape: { cx: pts[0][0], cy: pts[0][1], r: 12 },
          style: { fill: "transparent" },
        });
      }
      for (const i of sampleIndices(pts.length, MAX_HANDLES)) {
        const p = pts[i];
        kids.push({
          type: "circle",
          name: `point-${i}`,
          shape: { cx: p[0], cy: p[1], r: 5 },
          style: { fill: "#fff", stroke: color, lineWidth: 2, opacity: ctx.isSelected ? 1 : 0 },
          z: 1000,
        });
      }
      return { ...g, children: kids };
    },
  };
}
