// frontend/src/lib/qfdraw/tools/shapes/shapes.ts
// Attribution: shape math adapted from lightweight-charts-drawing MIT, tools/shapes.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
type P=[number,number];
const st=(c:DrawingRenderContext)=>({stroke:c.drawing.style?.color??"#2962FF",lineWidth:c.drawing.style?.lineWidth??2,fill:"transparent"});
export class RectangleRenderer implements DrawingRenderer { type="rectangle";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    return groupEl([{type:"rect",shape:{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])},style:st(c)}]); } }
export class RotatedRectangleRenderer implements DrawingRenderer { type="rotatedRectangle";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b,cc]=pts;
    const vx=b[0]-a[0], vy=b[1]-a[1]; const n=Math.hypot(vx,vy)||1; const nx=-vy/n, ny=vx/n;
    const t=((cc[0]-a[0])*nx+(cc[1]-a[1])*ny); const d:P=[b[0]+nx*t,b[1]+ny*t]; const e:P=[a[0]+nx*t,a[1]+ny*t];
    return groupEl([{type:"polygon",shape:{points:[a,b,d,e]},style:st(c)}]); } }
export class CircleRenderer implements DrawingRenderer { type="circle";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1],r:Math.hypot(b[0]-a[0],b[1]-a[1])},style:st(c)}]); } }
export class EllipseRenderer implements DrawingRenderer { type="ellipse";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    return groupEl([{type:"ellipse",shape:{cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,rx:Math.abs(b[0]-a[0])/2,ry:Math.abs(b[1]-a[1])/2},style:st(c)}]); } }
export class TriangleRenderer implements DrawingRenderer { type="triangle";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b,cc]=pts;
    return groupEl([{type:"polygon",shape:{points:[a,b,cc]},style:st(c)}]); } }
export class ArcRenderer implements DrawingRenderer { type="arc";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b]=pts; const r=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return groupEl([{type:"arc",shape:{cx:a[0],cy:a[1],r,startAngle:0,endAngle:Math.PI/2},style:st(c)}]); } }
export class PathRenderer implements DrawingRenderer { type="path";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:st(c)}]); } }
export class PolylineRenderer implements DrawingRenderer { type="polyline";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:st(c)}]); } }
export class CurveRenderer implements DrawingRenderer { type="curve";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<4) return groupEl([]); const [a,b,cc,d]=pts;
    return groupEl([{type:"bezier-curve",shape:{x1:a[0],y1:a[1],cpx1:b[0],cpy1:b[1],cpx2:cc[0],cpy2:cc[1],x2:d[0],y2:d[1]},style:st(c)}]); } }
export class DoubleCurveRenderer implements DrawingRenderer { type="doubleCurve";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<3) return groupEl([]); const [a,b,cc]=pts;
    return groupEl([{type:"bezier-curve",shape:{x1:a[0],y1:a[1],cpx1:b[0],cpy1:b[1],cpx2:b[0],cpy2:b[1],x2:cc[0],y2:cc[1]},style:st(c)},
      lineEl(a,cc,{color:"#787B86",dash:[4,4]})]); } }
export class RectangleTool extends QfTool { constructor(){super("qf:rectangle");} }
export class RotatedRectangleTool extends QfTool { constructor(){super("qf:rotatedRectangle");} }
export class CircleTool extends QfTool { constructor(){super("qf:circle");} }
export class EllipseTool extends QfTool { constructor(){super("qf:ellipse");} }
export class TriangleTool extends QfTool { constructor(){super("qf:triangle");} }
export class ArcTool extends QfTool { constructor(){super("qf:arc");} }
export class PathTool extends QfTool { constructor(){super("qf:path");} }
export class PolylineTool extends QfTool { constructor(){super("qf:polyline");} }
export class CurveTool extends QfTool { constructor(){super("qf:curve");} }
export class DoubleCurveTool extends QfTool { constructor(){super("qf:doubleCurve");} }
