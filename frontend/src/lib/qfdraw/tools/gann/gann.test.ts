// frontend/src/lib/qfdraw/tools/gann/gann.test.ts
import { describe, it, expect } from "vitest";
import { GannBoxRenderer, GannFanRenderer, GannSquareFixedRenderer, GannSquareRenderer } from "./gann";
function ctx(pts:[number,number][]): any { return { drawing:{id:"g",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("gann", () => {
  it("box draws rect + diagonals", () => {
    const g = new GannBoxRenderer().render(ctx([[0,150],[200,50]]));
    expect(g.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(2);
  });
  it("fan draws 4 slopes", () => {
    const g = new GannFanRenderer().render(ctx([[0,150],[200,150]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(4);
  });
  it("square fixed + square render grids", () => {
    expect(new GannSquareFixedRenderer().render(ctx([[100,100]])).children.length).toBeGreaterThan(0);
    expect(new GannSquareRenderer().render(ctx([[0,150],[200,50]])).children.length).toBeGreaterThan(0);
  });
});
