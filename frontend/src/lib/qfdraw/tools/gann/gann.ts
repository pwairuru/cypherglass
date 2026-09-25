// frontend/src/lib/qfdraw/tools/gann/gann.ts
// Attribution: gann levels adapted from lightweight-charts-drawing MIT, tools/gann.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
type P=[number,number];
export const GANN_FAN = [1, 2, 4, 8];
export class GannBoxRenderer implements DrawingRenderer {
  type="gannBox";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<2) return groupEl([]);
    const [a,b]=pts;
    const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
    return groupEl([{type:"rect",shape:{x,y,width:w,height:h},style:{stroke:"#2962FF",lineWidth:1,fill:"transparent"}},
      lineEl([x,y],[x+w,y+h],{color:"#2962FF"}), lineEl([x,y+h],[x+w,y],{color:"#2962FF"})]);
  }
}
export class GannFanRenderer implements DrawingRenderer {
  type="gannFan";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<2) return groupEl([]);
    const [a,b]=pts; const kids:any[]=[];
    for (const s of GANN_FAN){ const run=(b[0]-a[0])/s; kids.push(lineEl(a,[a[0]+run,a[1]-(a[1]-b[1])/s*2],{color:"#2962FF"})); }
    return groupEl(kids);
  }
}
export class GannSquareFixedRenderer implements DrawingRenderer {
  type="gannSquareFixed";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<1) return groupEl([]);
    const [a]=pts; const kids:any[]=[];
    for(let i=1;i<=3;i++){kids.push({type:"rect",shape:{x:a[0]-i*20,y:a[1]-i*20,width:i*40,height:i*40},style:{stroke:"#2962FF",fill:"transparent"}});}
    return groupEl(kids);
  }
}
export class GannSquareRenderer implements DrawingRenderer {
  type="gannSquare";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<2) return groupEl([]);
    const [a,b]=pts;
    const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
    const kids:any[]=[{type:"rect",shape:{x,y,width:w,height:h},style:{stroke:"#2962FF",fill:"transparent"}}];
    kids.push(lineEl([x+w/2,y],[x+w/2,y+h],{color:"#2962FF",dash:[4,4]}), lineEl([x,y+h/2],[x+w,y+h/2],{color:"#2962FF",dash:[4,4]}));
    return groupEl(kids);
  }
}
export class GannBoxTool extends QfTool { constructor(){super("qf:gannBox");} }
export class GannFanTool extends QfTool { constructor(){super("qf:gannFan");} }
export class GannSquareFixedTool extends QfTool { constructor(){super("qf:gannSquareFixed");} }
export class GannSquareTool extends QfTool { constructor(){super("qf:gannSquare");} }
