// frontend/src/lib/qfdraw/tools/fibonacci/extras.test.ts
import { describe, it, expect } from "vitest";
import { FibExtensionRenderer, FibTimeZoneRenderer, FibCirclesRenderer, FibArcsRenderer, FibWedgeRenderer, PitchfanRenderer, FibTimeExtensionRenderer, FibSpiralRenderer } from "./extras";
function ctx(pts:[number,number][]): any { return { drawing:{id:"f",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("fib extras", () => {
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
