import { describe, it, expect } from "vitest";
import { ArrowDrawingRenderer, ArrowTool } from "./arrow";
describe("arrow", () => {
  it("renders shaft + head + handles when selected", () => {
    const r = new ArrowDrawingRenderer();
    const g = r.render({ drawing:{id:"a",type:"arrow",points:[{timeIndex:0,value:1},{timeIndex:1,value:2}]}, pixelPoints:[[0,100],[100,50]], isSelected:true, api:{}, coordSys:{x:0,y:0,width:200,height:150} } as any);
    expect(g.type).toBe("group");
    // One visible stroke + one invisible wide hit stroke for easy selection.
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(2);
    expect(g.children.some((c:any)=>c.type==="line" && c.name==="line")).toBe(true);
    expect(g.children.filter((c:any)=>c.type==="polygon").length).toBe(1);
    expect(g.children.filter((c:any)=>c.type==="circle").length).toBe(2);
    const head = g.children.find((c:any)=>c.type==="polygon");
    expect(head.shape.points.length).toBe(3);
  });
  it("returns empty group when fewer than 2 points", () => {
    const r = new ArrowDrawingRenderer();
    for (const pixelPoints of [undefined, [], [[0,100]]]) {
      const g = r.render({ drawing:{id:"a",type:"arrow",points:[]}, pixelPoints, isSelected:true, api:{}, coordSys:{x:0,y:0,width:200,height:150} } as any);
      expect(g.type).toBe("group");
      expect(g.children).toEqual([]);
    }
  });
  it("tool collects 2 clicks then addDrawing (base creation flow)", () => {
    const tool = new ArrowTool();
    tool.drawingType = "arrow";
    tool.anchorCount = 2;
    const added: any[] = [];
    const handlers: Record<string, (e:any)=>void> = {};
    const zr = {
      on: (ev:string, h:(e:any)=>void) => { handlers[ev] = h; },
      off: (ev:string) => { delete handlers[ev]; },
      setCursorStyle: () => {},
      add: () => {}, remove: () => {},
    };
    let disabled = 0;
    tool.init({
      addDrawing:(d:any)=>{added.push(d);},
      disableTools:()=>{disabled += 1;},
      coordinateConversion:{ pixelToData:({x,y}:{x:number;y:number})=>({timeIndex:x/10,value:y,paneIndex:0}) },
      getChart:()=>({getZr:()=>zr}),
    } as any);
    tool.activate();
    expect(Object.keys(handlers)).toEqual(expect.arrayContaining(["click","mousemove","dblclick"]));
    handlers.click({offsetX:20,offsetY:100});
    expect(added.length).toBe(0);
    handlers.click({offsetX:40,offsetY:60});
    expect(added.length).toBe(1);
    expect(added[0].type).toBe("arrow");
    expect(added[0].points).toEqual([
      expect.objectContaining({timeIndex:2,value:100}),
      expect.objectContaining({timeIndex:4,value:60}),
    ]);
    expect(disabled).toBe(1);
    tool.deactivate();
    expect(Object.keys(handlers)).toEqual([]);
  });
});
