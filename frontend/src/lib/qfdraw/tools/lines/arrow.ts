// frontend/src/lib/qfdraw/tools/lines/arrow.ts
// Attribution: geometry adapted from lightweight-charts-drawing MIT, tools/lines arrow.
import type { ChartContext, DrawingElement, DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, circleEl, makeId } from "../../base";
function headPoints(tip:[number,number],tail:[number,number],len=10,spread=0.42): [number,number][] {
  const ang = Math.atan2(tip[1]-tail[1], tip[0]-tail[0]);
  return [tip,
    [tip[0]-len*Math.cos(ang-spread), tip[1]-len*Math.sin(ang-spread)],
    [tip[0]-len*Math.cos(ang+spread), tip[1]-len*Math.sin(ang+spread)]];
}
export class ArrowDrawingRenderer implements DrawingRenderer {
  type = "arrow";
  render(ctx: DrawingRenderContext): any {
    const [p1,p2] = ctx.pixelPoints as [number,number][];
    const color = ctx.drawing.style?.color ?? "#2962FF";
    const kids:any[] = [lineEl(p1,p2,{color}), { type:"polygon", shape:{points:headPoints(p2,p1)}, style:{fill:color,stroke:color,lineWidth:1} }];
    if (ctx.isSelected) kids.push(circleEl(p1), circleEl(p2));
    return groupEl(kids);
  }
}
export class ArrowTool extends QfTool {
  private pts:[number,number][] = [];
  constructor(){ super("qf:arrow"); }
  handlePoint(p:[number,number]): void {
    this.pts.push(p);
    if (this.pts.length === 2 && this.context) {
      const el: DrawingElement = { id: makeId("arrow"), type:"arrow",
        points: this.pts.map(([x,y],i)=>({ timeIndex:i, value:y })), style:{color:"#2962FF",lineWidth:2} };
      (this.context as ChartContext).addDrawing(el);
      this.pts = [];
    }
  }
}
