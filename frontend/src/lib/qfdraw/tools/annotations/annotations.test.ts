import { describe, it, expect } from "vitest";
import { TextRenderer, CalloutRenderer, BrushRenderer, FlagMarkRenderer, TableRenderer, PriceLabelRenderer } from "./annotations";
function ctx(pts:[number,number][], text="hello"): any { return { drawing:{id:"t",type:"t",points:pts.map(()=>({timeIndex:0,value:0})),style:{text} as any}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("annotations", () => {
  it("text + price label shows the real anchor value", () => {
    const g = new TextRenderer().render(ctx([[50,80]]));
    expect(g.children.some((c:any)=>c.type==="text" && c.style.text==="hello")).toBe(true);
    const p = new PriceLabelRenderer().render({
      drawing:{id:"t",type:"priceLabel",points:[{timeIndex:7,value:123.456789}]},
      pixelPoints:[[50,80]], isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200},
    } as any);
    expect(p.children.some((c:any)=>c.type==="rect")).toBe(true);
    const label = p.children.find((c:any)=>c.type==="text");
    expect(label.style.text).toBe("123.4568");
  });
  it("callout links anchor to text", () => {
    const g = new CalloutRenderer().render(ctx([[50,100],[120,60]]));
    expect(g.children.some((c:any)=>c.type==="line")).toBe(true);
    expect(g.children.some((c:any)=>c.type==="text")).toBe(true);
  });
  it("brush/highlighter polyline width differs", () => {
    const b = new BrushRenderer().render(ctx([[0,100],[80,80],[160,90]]));
    const kids = b.children[0];
    expect(kids.type).toBe("polyline");
    expect(kids.style.lineWidth).toBe(2);
  });
  it("flag + table", () => {
    expect(new FlagMarkRenderer().render(ctx([[50,80]])).children.length).toBeGreaterThanOrEqual(2);
    expect(new TableRenderer().render(ctx([[50,80]])).children.length).toBeGreaterThanOrEqual(4);
  });
});
