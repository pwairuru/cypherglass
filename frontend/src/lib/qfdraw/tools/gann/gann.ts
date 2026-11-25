// frontend/src/lib/qfdraw/tools/gann/gann.ts
// Attribution: gann levels adapted from lightweight-charts-drawing MIT, tools/gann.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, ctxColor, ctxDash, ctxDashOr, ctxWidth, groupEl, lineEl } from "../../base";
type P=[number,number];
export const GANN_FAN = [1, 2, 4, 8];
export class GannBoxRenderer implements DrawingRenderer {
  type="gannBox";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<2) return groupEl([]);
    const [a,b]=pts;
    const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
    const color=ctxColor(ctx), lineWidth=ctxWidth(ctx), dash=ctxDash(ctx);
    return groupEl([
      {type:"rect",shape:{x,y,width:w,height:h},style:{stroke:color,lineWidth,fill:"transparent",...(dash?{lineDash:dash}:{})}},
      lineEl([x,y],[x+w,y+h],{color,lineWidth,dash}),
      lineEl([x,y+h],[x+w,y],{color,lineWidth,dash}),
    ]);
  }
}
export class GannFanRenderer implements DrawingRenderer {
  type="gannFan";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<2) return groupEl([]);
    const [a,b]=pts;
    const color=ctxColor(ctx), lineWidth=ctxWidth(ctx), dash=ctxDash(ctx);
    const kids:any[]=[];
    for (const s of GANN_FAN){ const run=(b[0]-a[0])/s; kids.push(lineEl(a,[a[0]+run,a[1]-(a[1]-b[1])/s*2],{color,lineWidth,dash})); }
    return groupEl(kids);
  }
}
export class GannSquareFixedRenderer implements DrawingRenderer {
  type="gannSquareFixed";
  render(ctx:DrawingRenderContext):any{
    const pts=ctx.pixelPoints as P[] | undefined;
    if(!pts||pts.length<1) return groupEl([]);
    const [a]=pts;
    const color=ctxColor(ctx), lineWidth=ctxWidth(ctx), dash=ctxDash(ctx);
    const kids:any[]=[];
    for(let i=1;i<=3;i++){kids.push({type:"rect",shape:{x:a[0]-i*20,y:a[1]-i*20,width:i*40,height:i*40},style:{stroke:color,lineWidth,fill:"transparent",...(dash?{lineDash:dash}:{})}});}
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
    const color=ctxColor(ctx), lineWidth=ctxWidth(ctx), dash=ctxDash(ctx);
    const kids:any[]=[
      {type:"rect",shape:{x,y,width:w,height:h},style:{stroke:color,lineWidth,fill:"transparent",...(dash?{lineDash:dash}:{})}},
    ];
    const secondaryDash = ctxDashOr(ctx, [4,4]);
    kids.push(
      lineEl([x+w/2,y],[x+w/2,y+h],{color,lineWidth,dash:secondaryDash}),
      lineEl([x,y+h/2],[x+w,y+h/2],{color,lineWidth,dash:secondaryDash}),
    );
    return groupEl(kids);
  }
}
export class GannBoxTool extends QfTool { constructor(){super("qf:gannBox");} }
export class GannFanTool extends QfTool { constructor(){super("qf:gannFan");} }
export class GannSquareFixedTool extends QfTool { constructor(){super("qf:gannSquareFixed");} }
export class GannSquareTool extends QfTool { constructor(){super("qf:gannSquare");} }
