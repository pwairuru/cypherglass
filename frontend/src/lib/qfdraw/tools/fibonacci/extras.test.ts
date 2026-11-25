// frontend/src/lib/qfdraw/tools/fibonacci/extras.test.ts
import { describe, it, expect } from "vitest";
import { FibonacciRetracementRenderer, FibonacciRetracementTool, FibExtensionRenderer, FibTimeZoneRenderer, FibCirclesRenderer, FibArcsRenderer, FibWedgeRenderer, PitchfanRenderer, FibTimeExtensionRenderer, FibSpiralRenderer } from "./extras";
function ctx(pts:[number,number][], style?: Record<string, unknown>): any { return { drawing:{id:"f",type:"t",points:pts.map(()=>({timeIndex:0,value:0})),style}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("fib extras", () => {
  it("retracement consumes the selected colour, width and dash", () => {
    const g = new FibonacciRetracementRenderer().render(
      ctx([[0, 200], [240, 80]], { color: "#F23645", lineWidth: 3, lineStyle: "dashed" }),
    );
    const levels = g.children.filter((c: any) => c.type === "line" && !c.name);
    expect(levels.length).toBeGreaterThanOrEqual(7);
    for (const line of levels) {
      expect(line.style.stroke).toBe("#F23645");
      expect(line.style.lineWidth).toBe(3);
      expect(line.style.lineDash).toEqual([6, 4]);
    }
    const labels = g.children.filter((c: any) => c.type === "text");
    for (const text of labels) expect(text.style.fill).toBe("#F23645");
    expect(labels.some((t: any) => String(t.style.text).startsWith("0.618"))).toBe(true);
    expect(labels.some((t: any) => String(t.style.text).startsWith("0.236"))).toBe(true);
    expect(g.children.filter((c: any) => c.type === "circle")).toHaveLength(2);
  });

  it("retracement tool creates the preserved fibonacci type", () => {
    const tool = new FibonacciRetracementTool();
    tool.drawingType = "fibonacci";
    tool.anchorCount = 2;
    const added: any[] = [];
    const handlers: Record<string, (e: any) => void> = {};
    const zr = { on: (ev: string, h: any) => { handlers[ev] = h; }, off: (ev: string) => { delete handlers[ev]; }, setCursorStyle: () => {}, add: () => {}, remove: () => {} };
    tool.init({
      addDrawing: (d: any) => added.push(d),
      disableTools: () => {},
      lockChart: () => {},
      unlockChart: () => {},
      coordinateConversion: { pixelToData: ({ x, y }: { x: number; y: number }) => ({ timeIndex: x / 10, value: y, paneIndex: 0 }) },
      getChart: () => ({ getZr: () => zr }),
    } as any);
    tool.activate();
    handlers.click({ offsetX: 20, offsetY: 50 });
    handlers.click({ offsetX: 120, offsetY: 150 });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: "fibonacci", style: { color: "#2962FF", lineWidth: 2 } });
  });

  it("extension draws 5 levels with labels", () => {
    const g = new FibExtensionRenderer().render(ctx([[0,150],[200,50],[100,100]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(5);
    expect(g.children.some((c:any)=>c.type==="text" && String(c.style.text).includes("1.618"))).toBe(true);
  });
  it("timezone draws verticals", () => {
    const g = new FibTimeZoneRenderer().render(ctx([[0,0],[200,0]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(5);
  });
  it("circles draws 3 rings", () => {
    const g = new FibCirclesRenderer().render(ctx([[50,100],[150,60]]));
    expect(g.children.filter((c:any)=>c.type==="circle").length).toBeGreaterThanOrEqual(3);
  });
  it("arcs draws 3 arcs", () => {
    const g = new FibArcsRenderer().render(ctx([[50,150],[150,50]]));
    expect(g.children.filter((c:any)=>c.type==="arc").length).toBe(3);
  });
  it("wedge draws 2 fans + labels", () => {
    const g = new FibWedgeRenderer().render(ctx([[0,150],[200,150],[200,50]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(4);
  });
  it("pitchfan draws 3 fans", () => {
    const g = new PitchfanRenderer().render(ctx([[0,150],[200,50],[200,150]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("time extension + spiral render", () => {
    expect(new FibTimeExtensionRenderer().render(ctx([[0,0],[100,0],[160,0]])).children.length).toBeGreaterThan(0);
    expect(new FibSpiralRenderer().render(ctx([[50,100],[150,60]])).children.length).toBeGreaterThan(0);
  });
});
