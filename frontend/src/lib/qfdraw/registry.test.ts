import { describe, it, expect } from "vitest";
import { registerAllQfDrawings } from "./registry";
describe("registry", () => {
  it("registers 49+ renderers and returns panel map incl. arrow/parallel/gannBox/longPosition/rectangle/text", () => {
    const renderers: any[] = []; const plugins: any[] = [];
    const chart: any = { registerDrawingRenderer:(r:any)=>renderers.push(r), registerPlugin:(p:any)=>{p.init({addDrawing:()=>{}});plugins.push(p);} };
    const map = registerAllQfDrawings(chart);
    expect(renderers.length).toBeGreaterThanOrEqual(43);
    for (const t of [
      "line", "horizontal-line", "vertical-line", "ray", "horizontal-ray",
      "vertical-ray", "extended-line", "fibonacci",
      "arrow","parallelChannel","andrewsPitchfork","fibExtension","gannBox",
      "longPosition","rectangle","text","table",
    ]) {
      expect(renderers.some((r)=>r.type===t), t).toBe(true);
    }
    for (const k of [
      "line", "horizontal-line", "vertical-line", "ray", "horizontal-ray",
      "vertical-ray", "extended-line",
      "arrow","parallelChannel","gannBox","longPosition","rectangle","text",
    ]) {
      expect(map[k]).toBeDefined();
    }
    expect((map.longPosition as any).defaultColor).toBe("#089981");
    expect((map.shortPosition as any).defaultColor).toBe("#F23645");
    expect((map.highlighter as any).defaultColor).toBe("#FFD600");
  });
  it("drawings survive snapshot/restore with new types", async () => {
    const { snapshotDrawings, restoreDrawings } = await import("../chartTools");
    const drawings: any[] = [{ id:"a1", type:"arrow", points:[{timeIndex:0,value:1},{timeIndex:1,value:2}] }];
    const chart: any = { drawings, addDrawing(d:any){drawings.push(d);}, removeDrawing(id:string){const i=drawings.findIndex((d)=>d.id===id); if(i>=0)drawings.splice(i,1);} };
    const snap = snapshotDrawings(chart);
    drawings.length = 0;
    expect(restoreDrawings(chart, snap)).toBe(1);
  });
});
