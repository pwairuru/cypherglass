// frontend/src/lib/qfdraw/tools/forecast/forecast.ts
// Attribution: risk/forecast boxes adapted from lightweight-charts-drawing MIT, tools/forecasting.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, ctxColor, ctxDash, ctxDashOr, ctxWidth, groupEl, lineEl, labelEl } from "../../base";
type P=[number,number];
function riskBox(a:P,b:P,fill:string,label:string,lineWidth:number):any{
  const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
  return groupEl([
    {type:"rect",shape:{x,y,width:w,height:h},style:{fill,opacity:0.25,stroke:fill,lineWidth}},
    labelEl([x+4,y+4],label,{color:fill}),
  ]);
}
export class LongPositionRenderer implements DrawingRenderer { type="longPosition";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts; return riskBox(a,b,ctxColor(c,"#089981"),"Long",ctxWidth(c)); } }
export class ShortPositionRenderer implements DrawingRenderer { type="shortPosition";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts; return riskBox(a,b,ctxColor(c,"#F23645"),"Short",ctxWidth(c)); } }
export class ForecastRenderer implements DrawingRenderer { type="forecast";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    const color=ctxColor(c);
    return groupEl([
      lineEl(a,b,{color,lineWidth:ctxWidth(c),dash:ctxDashOr(c, [6,4])}),
      labelEl(b,"forecast",{color}),
    ]);
  } }
export class BarsPatternRenderer implements DrawingRenderer { type="barsPattern";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b,cc]=pts;
    const color=ctxColor(c), lineWidth=ctxWidth(c), dash=ctxDash(c);
    return groupEl([lineEl(a,b,{color,lineWidth,dash}),lineEl(b,cc,{color,lineWidth,dash}),labelEl(cc,"bars",{color})]);
  } }
export class ProjectionRenderer implements DrawingRenderer { type="projection";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b,cc]=pts;
    const color=ctxColor(c), lineWidth=ctxWidth(c), dash=ctxDash(c);
    return groupEl([lineEl(a,b,{color,lineWidth,dash}),lineEl(b,[cc[0],2*b[1]-a[1]],{color,lineWidth,dash:ctxDashOr(c,[4,4])})]);
  } }
export class PriceRangeRenderer implements DrawingRenderer { type="priceRange";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    const box=c.coordSys;
    const left=box?.x ?? 0;
    const right=(box?.x ?? 0)+(box?.width ?? 300);
    const color=ctxColor(c), lineWidth=ctxWidth(c), dash=ctxDash(c);
    return groupEl([
      lineEl([left,a[1]],[right,a[1]],{color,lineWidth,dash}),
      lineEl([left,b[1]],[right,b[1]],{color,lineWidth,dash}),
      labelEl([left+4,(a[1]+b[1])/2],`${Math.abs(a[1]-b[1]).toFixed(1)}px`,{color}),
    ]);
  } }
export class DatePriceRangeRenderer implements DrawingRenderer { type="datePriceRange";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);
    const color=ctxColor(c), lineWidth=ctxWidth(c), dash=ctxDash(c);
    return groupEl([
      {type:"rect",shape:{x,y,width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])},style:{stroke:color,lineWidth,fill:"transparent",...(dash?{lineDash:dash}:{})}},
      labelEl([x,y-16],"bars x price",{color}),
    ]);
  } }
export class LongPositionTool extends QfTool { constructor(){super("qf:longPosition");} }
export class ShortPositionTool extends QfTool { constructor(){super("qf:shortPosition");} }
export class ForecastTool extends QfTool { constructor(){super("qf:forecast");} }
export class BarsPatternTool extends QfTool { constructor(){super("qf:barsPattern");} }
export class ProjectionTool extends QfTool { constructor(){super("qf:projection");} }
export class PriceRangeTool extends QfTool { constructor(){super("qf:priceRange");} }
export class DatePriceRangeTool extends QfTool { constructor(){super("qf:datePriceRange");} }
