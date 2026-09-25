import { describe, it, expect, vi } from "vitest";
import { ArrowDrawingRenderer, ArrowTool } from "./arrow";
describe("arrow", () => {
  it("renders shaft + head + handles when selected", () => {
    const r = new ArrowDrawingRenderer();
    const g = r.render({ drawing:{id:"a",type:"arrow",points:[{timeIndex:0,value:1},{timeIndex:1,value:2}]}, pixelPoints:[[0,100],[100,50]], isSelected:true, api:{}, coordSys:{x:0,y:0,width:200,height:150} } as any);
    expect(g.type).toBe("group");
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(1);
    expect(g.children.filter((c:any)=>c.type==="polygon").length).toBe(1);
    expect(g.children.filter((c:any)=>c.type==="circle").length).toBe(2);
    const head = g.children.find((c:any)=>c.type==="polygon");
    expect(head.shape.points.length).toBe(3);
  });
  it("tool collects 2 clicks then addDrawing", () => {
    const tool = new ArrowTool();
    const added: any[] = [];
    tool.init({ addDrawing:(d:any)=>{added.push(d);}, getChart:()=>({getZr:()=>({on:()=>{},off:()=>{}})}) } as any);
    tool.activate();
    (tool as any).handlePoint([10,20]);
    (tool as any).handlePoint([30,40]);
    expect(added.length).toBe(1);
    expect(added[0].type).toBe("arrow");
    expect(added[0].points.length).toBe(2);
  });
});
