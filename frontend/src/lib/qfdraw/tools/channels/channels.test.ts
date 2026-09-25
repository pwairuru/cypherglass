// frontend/src/lib/qfdraw/tools/channels/channels.test.ts
import { describe, it, expect } from "vitest";
import { ParallelChannelRenderer, RegressionTrendRenderer, FlatTopBottomRenderer, DisjointChannelRenderer } from "./channels";
function ctx(pts:[number,number][]): any { return { drawing:{id:"x",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("channels", () => {
  it("parallel renders 2 rails + fill", () => {
    const g = new ParallelChannelRenderer().render(ctx([[0,100],[100,60],[0,120]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(2);
    expect(g.children.some((c:any)=>c.type==="polygon")).toBe(true);
  });
  it("regression renders median + bands", () => {
    const g = new RegressionTrendRenderer().render(ctx([[0,100],[200,40]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(3);
  });
  it("flat top/bottom renders stepped level", () => {
    const g = new FlatTopBottomRenderer().render(ctx([[0,80],[100,80],[100,120]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(3);
  });
  it("disjoint renders 2 independent segments", () => {
    const g = new DisjointChannelRenderer().render(ctx([[0,100],[80,70],[120,90],[200,60]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(2);
  });
});
