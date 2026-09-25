import { describe, it, expect } from "vitest";
import { RectangleRenderer, EllipseRenderer, TriangleRenderer, PolylineRenderer, CurveRenderer, CircleRenderer, RotatedRectangleRenderer, ArcRenderer, PathRenderer, DoubleCurveRenderer, sampleCubic } from "./shapes";
function ctx(pts:[number,number][]): any { return { drawing:{id:"s",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("shapes", () => {
  it("rect/ellipse/triangle/circle", () => {
    expect(new RectangleRenderer().render(ctx([[0,150],[200,50]])).children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(new EllipseRenderer().render(ctx([[0,150],[200,50]])).children.some((c:any)=>c.type==="ellipse")).toBe(true);
    expect(new TriangleRenderer().render(ctx([[0,150],[100,50],[200,150]])).children.some((c:any)=>c.type==="polygon")).toBe(true);
    expect(new CircleRenderer().render(ctx([[50,100],[150,60]])).children.some((c:any)=>c.type==="circle")).toBe(true);
  });
  it("paths and curves", () => {
    expect(new PolylineRenderer().render(ctx([[0,100],[80,60],[160,90]])).children.some((c:any)=>c.type==="polyline")).toBe(true);
    expect(new PathRenderer().render(ctx([[0,100],[160,90]])).children.some((c:any)=>c.type==="polyline")).toBe(true);
    expect(new CurveRenderer().render(ctx([[0,100],[60,40],[140,140],[200,80]])).children.some((c:any)=>c.type==="polyline")).toBe(true);
    expect(new CurveRenderer().render(ctx([[0,100],[60,40],[140,140],[200,80]])).children.some((c:any)=>c.type==="bezier-curve")).toBe(false);
    expect(new DoubleCurveRenderer().render(ctx([[0,100],[100,40],[200,100]])).children.length).toBe(2);
    expect(new RotatedRectangleRenderer().render(ctx([[0,100],[150,60],[150,120]])).children.some((c:any)=>c.type==="polygon")).toBe(true);
    expect(new ArcRenderer().render(ctx([[0,100],[100,60],[200,100]])).children.some((c:any)=>c.type==="arc")).toBe(true);
  });
  it("sampleCubic hits endpoints and midpoint", () => {
    const pts = sampleCubic([0,0],[0,100],[100,100],[100,0]);
    expect(pts[0]).toEqual([0,0]);
    expect(pts[pts.length-1]).toEqual([100,0]);
    expect(pts).toHaveLength(25);
    const mid = pts[12];
    expect(mid[0]).toBeCloseTo(50, 0);
    expect(mid[1]).toBeCloseTo(75, 0);
  });
});
