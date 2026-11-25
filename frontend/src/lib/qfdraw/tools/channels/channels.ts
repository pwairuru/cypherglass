// frontend/src/lib/qfdraw/tools/channels/channels.ts
// Attribution: channel math adapted from lightweight-charts-drawing MIT, tools/channels.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, ctxColor, ctxDash, ctxDashOr, ctxWidth, groupEl, lineEl } from "../../base";
function offset(p:[number,number],dx:number,dy:number):[number,number]{return [p[0]+dx,p[1]+dy];}
export class ParallelChannelRenderer implements DrawingRenderer {
  type = "parallelChannel";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 3) return groupEl([]);
    const [a,b,c] = pts;
    const dx = c[0]-a[0], dy = c[1]-a[1];
    const d = offset(b,dx,dy);
    const col = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([{type:"polygon",shape:{points:[a,b,d,c]},style:{fill:col,opacity:0.12,stroke:col,lineWidth:1}},
      lineEl(a,b,{color:col,lineWidth:width,dash}), lineEl(c,d,{color:col,lineWidth:width,dash})]);
  }
}
export class RegressionTrendRenderer implements DrawingRenderer {
  type = "regressionTrend";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 2) return groupEl([]);
    const [a,b] = pts;
    const col = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    const secondaryDash = ctxDashOr(ctx, [4,4]);
    const up:[number,number]=[a[0],a[1]-14], ub:[number,number]=[b[0],b[1]-14];
    const dn:[number,number]=[a[0],a[1]+14], db:[number,number]=[b[0],b[1]+14];
    return groupEl([
      lineEl(a,b,{color:col,lineWidth:width,dash}),
      lineEl(up,ub,{color:col,lineWidth:width,dash:secondaryDash}),
      lineEl(dn,db,{color:col,lineWidth:width,dash:secondaryDash}),
    ]);
  }
}
export class FlatTopBottomRenderer implements DrawingRenderer {
  type = "flatTopBottom";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 3) return groupEl([]);
    const [a,b,c] = pts;
    const col = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([
      lineEl(a,b,{color:col,lineWidth:width,dash}),
      lineEl(b,c,{color:col,lineWidth:width,dash}),
      lineEl(a,[c[0],a[1]],{color:col,lineWidth:width,dash:ctxDashOr(ctx, [4,4])}),
    ]);
  }
}
export class DisjointChannelRenderer implements DrawingRenderer {
  type = "disjointChannel";
  render(ctx: DrawingRenderContext): any {
    const pts = ctx.pixelPoints as [number,number][];
    if (!pts || pts.length < 4) return groupEl([]);
    const [a,b,c,d] = pts;
    const col = ctxColor(ctx);
    const width = ctxWidth(ctx);
    const dash = ctxDash(ctx);
    return groupEl([
      lineEl(a,b,{color:col,lineWidth:width,dash}),
      lineEl(c,d,{color:col,lineWidth:width,dash}),
    ]);
  }
}
export class ParallelChannelTool extends QfTool { constructor(){super("qf:parallelChannel");} }
export class RegressionTrendTool extends QfTool { constructor(){super("qf:regressionTrend");} }
export class FlatTopBottomTool extends QfTool { constructor(){super("qf:flatTopBottom");} }
export class DisjointChannelTool extends QfTool { constructor(){super("qf:disjointChannel");} }
