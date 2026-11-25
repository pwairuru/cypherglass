// frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.ts
// Attribution: pitchfork math adapted from lightweight-charts-drawing MIT, tools/pitchforks.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, ctxColor, ctxDash, ctxWidth, groupEl, lineEl } from "../../base";
type P=[number,number];
function medianLines(ctx:DrawingRenderContext,origin:P,p2:P,p3:P,edge=260): any[] {
  const mid:P=[(p2[0]+p3[0])/2,(p2[1]+p3[1])/2];
  const dx=mid[0]-origin[0], dy=mid[1]-origin[1];
  const n=Math.hypot(dx,dy)||1, ux=dx/n, uy=dy/n;
  const tip:P=[origin[0]+ux*edge, origin[1]+uy*edge];
  const s2:P=[p2[0]+ux*edge*0.6, p2[1]+uy*edge*0.6], s3:P=[p3[0]+ux*edge*0.6, p3[1]+uy*edge*0.6];
  const color=ctxColor(ctx), lineWidth=ctxWidth(ctx), dash=ctxDash(ctx);
  return [
    lineEl(origin,tip,{color,lineWidth,dash}),
    lineEl(p2,s2,{color,lineWidth,dash}),
    lineEl(p3,s3,{color,lineWidth,dash}),
  ];
}
function pts3(ctx:DrawingRenderContext): P[] | null {
  const pts = ctx.pixelPoints as P[] | undefined;
  if (!pts || pts.length < 3) return null;
  return pts;
}
export class AndrewsPitchforkRenderer implements DrawingRenderer {
  type="andrewsPitchfork";
  render(ctx:DrawingRenderContext):any{ const pts=pts3(ctx); if(!pts) return groupEl([]); const [a,b,c]=pts; return groupEl(medianLines(ctx,a,b,c)); }
}
export class SchiffPitchforkRenderer implements DrawingRenderer {
  type="schiffPitchfork";
  render(ctx:DrawingRenderContext):any{ const pts=pts3(ctx); if(!pts) return groupEl([]); const [a,b,c]=pts; const o:P=[(a[0]+(b[0]+c[0])/2)/2,(a[1]+(b[1]+c[1])/2)/2]; return groupEl(medianLines(ctx,o,b,c)); }
}
export class ModifiedSchiffPitchforkRenderer implements DrawingRenderer {
  type="modifiedSchiffPitchfork";
  render(ctx:DrawingRenderContext):any{ const pts=pts3(ctx); if(!pts) return groupEl([]); const [a,b,c]=pts; const o:P=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3]; return groupEl(medianLines(ctx,o,b,c)); }
}
export class InsidePitchforkRenderer implements DrawingRenderer {
  type="insidePitchfork";
  render(ctx:DrawingRenderContext):any{ const pts=pts3(ctx); if(!pts) return groupEl([]); const [a,b,c]=pts; const mid:P=[(b[0]+c[0])/2,(b[1]+c[1])/2]; const o:P=[(a[0]+mid[0])/2,(a[1]+mid[1])/2]; return groupEl(medianLines(ctx,o,b,c,200)); }
}
export class AndrewsPitchforkTool extends QfTool { constructor(){super("qf:andrewsPitchfork");} }
export class SchiffPitchforkTool extends QfTool { constructor(){super("qf:schiffPitchfork");} }
export class ModifiedSchiffPitchforkTool extends QfTool { constructor(){super("qf:modifiedSchiffPitchfork");} }
export class InsidePitchforkTool extends QfTool { constructor(){super("qf:insidePitchfork");} }
