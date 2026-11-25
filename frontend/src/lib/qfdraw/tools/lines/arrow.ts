// frontend/src/lib/qfdraw/tools/lines/arrow.ts
// Attribution: geometry adapted from lightweight-charts-drawing MIT, tools/lines arrow.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, anchorDot, ctxColor, ctxDash, ctxWidth, groupEl, hitLine, lineEl } from "../../base";
function headPoints(tip:[number,number],tail:[number,number],len=10,spread=0.42): [number,number][] {
  const ang = Math.atan2(tip[1]-tail[1], tip[0]-tail[0]);
  return [tip,
    [tip[0]-len*Math.cos(ang-spread), tip[1]-len*Math.sin(ang-spread)],
    [tip[0]-len*Math.cos(ang+spread), tip[1]-len*Math.sin(ang+spread)]];
}
export class ArrowDrawingRenderer implements DrawingRenderer {
  type = "arrow";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][] | undefined;
    if (!pts || pts.length < 2) return groupEl([]);
    const [p1,p2] = pts;
    const color = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const kids:any[] = [
      hitLine(p1, p2, Math.max(10, width + 8)),
      lineEl(p1,p2,{color,lineWidth:width,dash:ctxDash(ctx),name:"line"}),
      { type:"polygon", name:"line", shape:{points:headPoints(p2,p1)}, style:{fill:color,stroke:color,lineWidth:1} },
      anchorDot(p1, color),
      anchorDot(p2, color),
    ];
    return groupEl(kids);
  }
}
export class ArrowTool extends QfTool {
  // Creation (anchor collection, preview, save) comes from the QfTool base;
  // the registry assigns drawingType="arrow", anchorCount=2.
  constructor(){ super("qf:arrow"); }
}
