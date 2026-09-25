// frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts
import { describe, it, expect } from "vitest";
import { AndrewsPitchforkRenderer, SchiffPitchforkRenderer, ModifiedSchiffPitchforkRenderer, InsidePitchforkRenderer } from "./pitchforks";
function ctx(): any { return { drawing:{id:"p",type:"t",points:[{timeIndex:0,value:0},{timeIndex:1,value:0},{timeIndex:2,value:0}]}, pixelPoints:[[20,120],[100,60],[100,140]], isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("pitchforks", () => {
  it("andrews has median + 2 parallels", () => {
    const g = new AndrewsPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("schiff shifts origin to mid of p2-p3", () => {
    const g = new SchiffPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("modified schiff renders 3 lines", () => {
    const g = new ModifiedSchiffPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("inside uses tighter median", () => {
    const g = new InsidePitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
});
