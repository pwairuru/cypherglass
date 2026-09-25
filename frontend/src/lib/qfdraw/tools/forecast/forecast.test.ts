// frontend/src/lib/qfdraw/tools/forecast/forecast.test.ts
import { describe, it, expect } from "vitest";
import { LongPositionRenderer, ShortPositionRenderer, ForecastRenderer, BarsPatternRenderer, ProjectionRenderer, PriceRangeRenderer, DatePriceRangeRenderer } from "./forecast";
function ctx(pts:[number,number][]): any { return { drawing:{id:"f",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("forecast", () => {
  it("long/short show rect + label", () => {
    const l = new LongPositionRenderer().render(ctx([[0,150],[200,50],[200,100]]));
    const s = new ShortPositionRenderer().render(ctx([[0,50],[200,150],[200,100]]));
    expect(l.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(s.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(l.children.some((c:any)=>c.type==="text")).toBe(true);
  });
  it("forecast/bars/projection render", () => {
    expect(new ForecastRenderer().render(ctx([[0,100],[200,60]])).children.length).toBeGreaterThan(0);
    expect(new BarsPatternRenderer().render(ctx([[0,100],[100,80],[200,90]])).children.length).toBeGreaterThan(0);
    expect(new ProjectionRenderer().render(ctx([[0,100],[100,80],[200,90]])).children.length).toBeGreaterThan(0);
  });
  it("ranges render bands", () => {
    expect(new PriceRangeRenderer().render(ctx([[0,150],[0,50]])).children.length).toBeGreaterThan(0);
    expect(new DatePriceRangeRenderer().render(ctx([[0,150],[200,50]])).children.length).toBeGreaterThan(0);
  });
});
