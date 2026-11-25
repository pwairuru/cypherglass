// frontend/src/lib/qfdraw/creation.test.ts
// Covers the QfTool base creation state machine + per-type anchor contracts.
import { describe, it, expect } from "vitest";
import { ArrowTool } from "./tools/lines/arrow";
import { TextTool, BrushTool } from "./tools/annotations/annotations";
import { PolylineTool } from "./tools/shapes/shapes";
import { LongPositionTool } from "./tools/forecast/forecast";
import { ANCHORS, TOOL_TYPES, registerAllQfDrawings } from "./registry";
import type { QfTool } from "./base";

function harness(tool: QfTool, conv?: (x:number,y:number)=>any) {
  const added: any[] = [];
  const graphics: any[] = [];
  const handlers: Record<string, (e:any)=>void> = {};
  const zr = {
    on: (ev:string, h:(e:any)=>void) => { handlers[ev] = h; },
    off: (ev:string) => { delete handlers[ev]; },
    setCursorStyle: () => {},
    add: (el:any) => { graphics.push(el); }, remove: () => {},
  };
  let disabled = 0, locked = 0, unlocked = 0;
  tool.init({
    addDrawing:(d:any)=>{added.push(d);},
    disableTools:()=>{disabled += 1;},
    lockChart:()=>{locked += 1;},
    unlockChart:()=>{unlocked += 1;},
    coordinateConversion:{ pixelToData:({x,y}:{x:number;y:number}) =>
      conv ? conv(x,y) : ({timeIndex:x/10,value:y,paneIndex:0}) },
    getChart:()=>({getZr:()=>zr}),
  } as any);
  return { added, graphics, handlers, zr, disabled: () => disabled, locked: () => locked, unlocked: () => unlocked };
}

describe("QfTool creation flow", () => {
  it("1-point tool finishes on first click", () => {
    const tool = new TextTool();
    tool.drawingType = "text"; tool.anchorCount = 1;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({offsetX:50,offsetY:80});
    expect(h.added.length).toBe(1);
    expect(h.added[0].type).toBe("text");
    expect(h.added[0].points).toHaveLength(1);
    expect(h.added[0].points[0]).toEqual(expect.objectContaining({timeIndex:5,value:80}));
  });
  it("rounds fractional timeIndex", () => {
    const tool = new TextTool();
    tool.drawingType = "text"; tool.anchorCount = 1;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({offsetX:24,offsetY:80});
    expect(h.added[0].points[0].timeIndex).toBe(2);
  });
  it("aborts when a point maps to null (off-chart click)", () => {
    const tool = new ArrowTool();
    tool.drawingType = "arrow"; tool.anchorCount = 2;
    const h = harness(tool, (x,y)=> (x > 100 ? null : ({timeIndex:x/10,value:y,paneIndex:0})));
    tool.activate();
    h.handlers.click({offsetX:20,offsetY:50});
    h.handlers.click({offsetX:500,offsetY:50});
    expect(h.added.length).toBe(0);
  });
  it("variable-length tool finishes on dblclick with 2+ points", () => {
    const tool = new PolylineTool();
    tool.drawingType = "polyline"; tool.anchorCount = 0;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({offsetX:10,offsetY:10});
    h.handlers.click({offsetX:30,offsetY:20});
    h.handlers.click({offsetX:50,offsetY:10});
    expect(h.added.length).toBe(0);
    h.handlers.dblclick({});
    expect(h.added.length).toBe(1);
    expect(h.added[0].points).toHaveLength(3);
  });
  it("dblclick with <2 points resets without adding", () => {
    const tool = new PolylineTool();
    tool.drawingType = "polyline"; tool.anchorCount = 0;
    const h = harness(tool);
    tool.activate();
    h.handlers.click({offsetX:10,offsetY:10});
    h.handlers.dblclick({});
    expect(h.added.length).toBe(0);
  });
  it("drag tool draws on mousedown/move/mouseup", () => {
    const tool = new BrushTool();
    tool.drawingType = "brush"; tool.anchorCount = 0; tool.mode = "drag";
    const h = harness(tool);
    tool.activate();
    expect(Object.keys(h.handlers)).toEqual(expect.arrayContaining(["mousedown","mousemove","mouseup"]));
    h.handlers.mousedown({offsetX:0,offsetY:0});
    for (let i = 1; i <= 5; i++) h.handlers.mousemove({offsetX:i*10,offsetY:i*5});
    h.handlers.mouseup({});
    expect(h.added.length).toBe(1);
    expect(h.added[0].type).toBe("brush");
    expect(h.added[0].points.length).toBeGreaterThanOrEqual(5);
  });
  it("drag with a single point adds nothing", () => {
    const tool = new BrushTool();
    tool.drawingType = "brush"; tool.anchorCount = 0; tool.mode = "drag";
    const h = harness(tool);
    tool.activate();
    h.handlers.mousedown({offsetX:0,offsetY:0});
    h.handlers.mouseup({});
    expect(h.added.length).toBe(0);
  });
  it("mousemove closer than 3px does not append drag points", () => {
    const tool = new BrushTool();
    tool.drawingType = "brush"; tool.anchorCount = 0; tool.mode = "drag";
    const h = harness(tool);
    tool.activate();
    h.handlers.mousedown({offsetX:0,offsetY:0});
    h.handlers.mousemove({offsetX:1,offsetY:1});
    h.handlers.mousemove({offsetX:10,offsetY:0});
    h.handlers.mouseup({});
    expect(h.added[0].points).toHaveLength(2);
  });
  it("deactivate unbinds all handlers", () => {
    const tool = new ArrowTool();
    tool.drawingType = "arrow"; tool.anchorCount = 2;
    const h = harness(tool);
    tool.activate();
    expect(Object.keys(h.handlers).length).toBeGreaterThan(0);
    tool.deactivate();
    expect(Object.keys(h.handlers)).toEqual([]);
  });
  it("locks chart on activate, unlocks on finish (no pan while drawing)", () => {
    const tool = new ArrowTool();
    tool.drawingType = "arrow"; tool.anchorCount = 2;
    const h = harness(tool);
    tool.activate();
    expect(h.locked()).toBe(1);
    h.handlers.click({offsetX:20,offsetY:50});
    h.handlers.click({offsetX:40,offsetY:60});
    expect(h.added.length).toBe(1);
    expect(h.unlocked()).toBe(1);
  });
  it("unlocks on deactivate without finishing", () => {
    const tool = new ArrowTool();
    tool.drawingType = "arrow"; tool.anchorCount = 2;
    const h = harness(tool);
    tool.activate();
    tool.deactivate();
    expect(h.unlocked()).toBe(1);
  });
  it("asks for label text when asksText (prompt result stored)", () => {
    const tool = new TextTool();
    tool.drawingType = "text"; tool.anchorCount = 1;
    tool.asksText = true; tool.defaultText = "Text";
    const h = harness(tool);
    const orig = window.prompt;
    (window as any).prompt = () => "hello";
    try {
      tool.activate();
      h.handlers.click({offsetX:50,offsetY:80});
    } finally {
      (window as any).prompt = orig;
    }
    expect(h.added[0].style.text).toBe("hello");
  });
  it("uses a tool's semantic default colour in the creation preview", () => {
    const tool = new LongPositionTool();
    tool.drawingType = "longPosition"; tool.anchorCount = 2;
    tool.defaultColor = "#089981";
    const h = harness(tool);
    tool.activate();
    h.handlers.click({ offsetX: 20, offsetY: 50 });
    const preview = h.graphics[0];
    const line = preview.children().find((c: any) => c.type === "line");
    expect(line.style.stroke).toBe("#089981");
  });

  it("keeps default text when prompt is unavailable or dismissed", () => {
    const tool = new TextTool();
    tool.drawingType = "text"; tool.anchorCount = 1;
    tool.asksText = true; tool.defaultText = "Text";
    const h = harness(tool);
    const orig = window.prompt;
    (window as any).prompt = null;
    try {
      tool.activate();
      h.handlers.click({offsetX:50,offsetY:80});
    } finally {
      (window as any).prompt = orig;
    }
    expect(h.added[0].style.text).toBe("Text");
  });
});

describe("anchor contracts for every registered type", () => {
  function allTools(): { type: string; tool: QfTool }[] {
    const renderers: any[] = [];
    const plugins: any[] = [];
    const chart: any = {
      registerDrawingRenderer:(r:any)=>renderers.push(r),
      registerPlugin:(p:any)=>{ p.init({addDrawing:()=>{}}); plugins.push(p); },
    };
    const map = registerAllQfDrawings(chart);
    return TOOL_TYPES.map((type) => ({ type, tool: map[type] as unknown as QfTool }));
  }
  it("every TOOL_TYPES entry has a renderer, tool, drawingType and valid count", () => {
    const renderers: string[] = [];
    const chart: any = {
      registerDrawingRenderer:(r:any)=>renderers.push(r.type),
      registerPlugin:(p:any)=>{ p.init({addDrawing:()=>{}}); },
    };
    const map = registerAllQfDrawings(chart);
    for (const type of TOOL_TYPES) {
      expect(renderers, type).toContain(type);
      const tool = map[type] as unknown as QfTool;
      expect(tool, type).toBeDefined();
      expect(tool.drawingType, type).toBe(type);
      expect(tool.anchorCount, type).toBeGreaterThanOrEqual(0);
      expect(tool.anchorCount, type).toBeLessThanOrEqual(4);
      expect(["click","drag"], type).toContain(tool.mode);
    }
  });
  it("only path/polyline are variable-length click tools; only brush/highlighter drag", () => {
    for (const { type, tool } of allTools()) {
      if (tool.anchorCount === 0 && tool.mode === "click") {
        expect(["path","polyline"], type).toContain(type);
      }
      if (tool.mode === "drag") {
        expect(["brush","highlighter"], type).toContain(type);
      }
    }
  });
  it("ANCHORS covers exactly TOOL_TYPES", () => {
    expect(new Set(Object.keys(ANCHORS))).toEqual(new Set(TOOL_TYPES));
  });
});
