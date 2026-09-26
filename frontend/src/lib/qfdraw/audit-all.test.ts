// Temporary thorough audit: render + create EVERY registered qfdraw tool.
// Covers what group tests miss: per-type renderer output validity and
// per-type creation contract (anchor counts, drag vs click, text prompt).
import { describe, it, expect } from "vitest";
import { ANCHORS, TOOL_TYPES, TEXT_DEFAULTS, registerAllQfDrawings } from "./registry";
import { sampleIndices } from "./select";
import type { QfTool } from "./base";

function ptsFor(n: number): [number, number][] {
  const count = n === 0 ? 5 : Math.max(n, 1);
  return Array.from({ length: count }, (_, i) => [50 + i * 40, 80 + (i % 2) * 20] as [number, number]);
}

function renderCtx(type: string, px: [number, number][]) {
  return {
    drawing: {
      id: "audit",
      type,
      points: px.map((_, i) => ({ timeIndex: i, value: 100 + i * 5 })),
      style: { text: "hello", color: "#2962FF", lineWidth: 2 },
    },
    pixelPoints: px,
    isSelected: false,
    api: {},
    coordSys: { x: 0, y: 0, width: 600, height: 400 },
  } as any;
}

describe("audit: every renderer produces valid selectable output", () => {
  const renderers = new Map<string, any>();
  const chart: any = {
    registerDrawingRenderer: (r: any) => renderers.set(r.type, r),
    registerPlugin: (p: any) => p.init({ addDrawing: () => {} }),
  };
  registerAllQfDrawings(chart);

  for (const type of TOOL_TYPES) {
    it(`${type} renders non-empty group with line body + handles, silent text`, () => {
      const r = renderers.get(type);
      expect(r, `${type} renderer registered`).toBeDefined();
      const px = ptsFor(ANCHORS[type].n);
      const out = r.render(renderCtx(type, px));
      expect(out && Array.isArray(out.children), `${type} children array`).toBe(true);
      expect(out.children.length, `${type} non-empty`).toBeGreaterThan(0);
      // Body hit shape present
      expect(out.children.some((k: any) => k?.name === "line"), `${type} line body`).toBe(true);
      // Vertex handles for sampled indices
      for (const i of sampleIndices(px.length, 50)) {
        expect(
          out.children.some((k: any) => k?.name === `point-${i}`),
          `${type} handle point-${i}`,
        ).toBe(true);
      }
      // All text silenced (clicks pass through to body)
      for (const k of out.children) {
        if (k?.type === "text") expect(k.silent, `${type} text silent`).toBe(true);
      }
      // Every shape has a type string (no undefined garbage into echarts)
      for (const k of out.children) {
        expect(typeof k?.type, `${type} shape type`).toBe("string");
      }
    });
  }
});

describe("audit: every tool creates a drawing through its real state machine", () => {
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
      addDrawing: (d: any) => { added.push(d); },
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

  const chart: any = {
    registerDrawingRenderer: () => {},
    registerPlugin: (p: any) => p.init({ addDrawing: () => {} }),
  };
  const tools = registerAllQfDrawings(chart);
  const origPrompt = (window as any).prompt;

  for (const type of TOOL_TYPES) {
    it(`${type} creates via ${ANCHORS[type].mode} with ${ANCHORS[type].n || "variable"} anchors`, () => {
      const tool = tools[type] as unknown as QfTool;
      const { added, handlers } = harness(tool);
      (window as any).prompt = () => "audit label";
      try {
        tool.activate();
        const spec = ANCHORS[type];
        if (spec.mode === "drag") {
          handlers.mousedown({ offsetX: 10, offsetY: 100 });
          for (let i = 1; i <= 5; i++) handlers.mousemove({ offsetX: 10 + i * 12, offsetY: 100 + i * 4 });
          handlers.mouseup({});
          expect(added.length, type).toBe(1);
          expect(added[0].points.length, `${type} drag points`).toBeGreaterThanOrEqual(2);
        } else if (spec.n === 1) {
          handlers.click({ offsetX: 50, offsetY: 80 });
          expect(added.length, type).toBe(1);
          expect(added[0].points, `${type} 1 anchor`).toHaveLength(1);
        } else if (spec.n === 0) {
          handlers.click({ offsetX: 10, offsetY: 10 });
          handlers.click({ offsetX: 30, offsetY: 20 });
          handlers.click({ offsetX: 50, offsetY: 10 });
          expect(added.length, type).toBe(0);
          handlers.dblclick({});
          expect(added.length, type).toBe(1);
          expect(added[0].points.length, `${type} variable anchors`).toBeGreaterThanOrEqual(2);
        } else {
          for (let i = 0; i < spec.n; i++) handlers.click({ offsetX: 20 + i * 25, offsetY: 50 + i * 7 });
          expect(added.length, type).toBe(1);
          expect(added[0].points, `${type} anchors`).toHaveLength(spec.n);
        }
        expect(added[0].type, `${type} drawing type`).toBe(type);
        if (TEXT_DEFAULTS[type] !== undefined) {
          expect(added[0].style.text, `${type} label`).toBe("audit label");
        }
      } finally {
        (window as any).prompt = origPrompt;
        tool.deactivate();
      }
    });
  }
});
