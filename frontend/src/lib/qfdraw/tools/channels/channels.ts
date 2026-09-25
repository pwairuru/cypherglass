// frontend/src/lib/qfdraw/tools/channels/channels.ts
// Attribution: channel math adapted from lightweight-charts-drawing MIT, tools/channels.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
function offset(p:[number,number],dx:number,dy:number):[number,number]{return [p[0]+dx,p[1]+dy];}
export class ParallelChannelRenderer implements DrawingRenderer {
  type = "parallelChannel";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 3) return groupEl([]);
    const [a,b,c] = pts;
    const dx = c[0]-a[0], dy = c[1]-a[1];
    const d = offset(b,dx,dy);
    const col = ctx.drawing.style?.color ?? "#2962FF";
    return groupEl([{type:"polygon",shape:{points:[a,b,d,c]},style:{fill:col,opacity:0.12,stroke:"transparent"}},
      lineEl(a,b,{color:col}), lineEl(c,d,{color:col})]);
  }
}
export class RegressionTrendRenderer implements DrawingRenderer {
  type = "regressionTrend";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 2) return groupEl([]);
    const [a,b] = pts;
    const col = ctx.drawing.style?.color ?? "#2962FF";
    const mx = (a[0]+b[0])/2;
    const up:[number,number]=[a[0],a[1]-14], ub:[number,number]=[b[0],b[1]-14];
    const dn:[number,number]=[a[0],a[1]+14], db:[number,number]=[b[0],b[1]+14];
    void mx;
    return groupEl([lineEl(a,b,{color:col}), lineEl(up,ub,{color:col,dash:[4,4]}), lineEl(dn,db,{color:col,dash:[4,4]})]);
  }
}
export class FlatTopBottomRenderer implements DrawingRenderer {
  type = "flatTopBottom";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 3) return groupEl([]);
    const [a,b,c] = pts;
    const col = ctx.drawing.style?.color ?? "#2962FF";
    return groupEl([lineEl(a,b,{color:col}), lineEl(b,c,{color:col}), lineEl(a,[c[0],a[1]],{color:col,dash:[4,4]})]);
  }
}
export class DisjointChannelRenderer implements DrawingRenderer {
  type = "disjointChannel";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 4) return groupEl([]);
    const [a,b,c,d] = pts;
    const col = ctx.drawing.style?.color ?? "#2962FF";
    return groupEl([lineEl(a,b,{color:col}), lineEl(c,d,{color:col})]);
  }
}
export class ParallelChannelTool extends QfTool { constructor(){super("qf:parallelChannel");} }
export class RegressionTrendTool extends QfTool { constructor(){super("qf:regressionTrend");} }
export class FlatTopBottomTool extends QfTool { constructor(){super("qf:flatTopBottom");} }
export class DisjointChannelTool extends QfTool { constructor(){super("qf:disjointChannel");} }
