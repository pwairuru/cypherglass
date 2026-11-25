// frontend/src/lib/qfdraw/tools/annotations/annotations.ts
// Attribution: annotation layout adapted from lightweight-charts-drawing MIT, tools/annotations.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { contrastText } from "../../style";
import { QfTool, ctxColor, ctxDash, ctxDashOr, ctxWidth, groupEl, lineEl, labelEl } from "../../base";
type P=[number,number];
const txt=(c:DrawingRenderContext)=>String((c.drawing.style as any)?.text ?? "text");
export class TextRenderer implements DrawingRenderer { type="text";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts; return groupEl([labelEl(a,txt(c),{color:ctxColor(c)})]); } }
export class CalloutRenderer implements DrawingRenderer { type="callout";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    const color=ctxColor(c);
    return groupEl([
      lineEl(a,b,{color,lineWidth:ctxWidth(c),dash:ctxDash(c)}),
      {type:"rect",shape:{x:b[0],y:b[1]-22,width:Math.max(60,txt(c).length*6.5),height:22},style:{fill:"#131722",stroke:color,lineWidth:1}},
      labelEl([b[0]+4,b[1]+4],txt(c),{color}),
    ]);
  } }
export class BrushRenderer implements DrawingRenderer { type="brush";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:ctxColor(c),lineWidth:ctxWidth(c),lineCap:"round"}}]); } }
export class HighlighterRenderer implements DrawingRenderer { type="highlighter";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:ctxColor(c,"#FFD600"),lineWidth:Math.max(8,ctxWidth(c)*4),opacity:0.38,lineCap:"round"}}]); } }
export class ArrowMarkerRenderer implements DrawingRenderer { type="arrowMarker";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([{type:"polygon",shape:{points:[[a[0],a[1]-8],[a[0]-6,a[1]+4],[a[0]+6,a[1]+4]]},style:{fill:ctxColor(c)}}]); } }
export class AnchoredTextRenderer implements DrawingRenderer { type="anchoredText";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    const color=ctxColor(c);
    return groupEl([lineEl(a,b,{color,lineWidth:ctxWidth(c),dash:ctxDashOr(c, [3,3])}),labelEl(b,txt(c),{color})]);
  } }
export class NoteRenderer implements DrawingRenderer { type="note";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const color=ctxColor(c,"#FFD600");
    return groupEl([
      {type:"circle",shape:{cx:a[0],cy:a[1],r:8},style:{fill:color,stroke:"#000"}},
      labelEl([a[0]+12,a[1]+4],"i",{color}),
    ]); } }
export class PriceNoteRenderer implements DrawingRenderer { type="priceNote";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const box=c.coordSys;
    const left=box?.x ?? 0;
    const right=(box?.x ?? 0)+(box?.width ?? 300);
    const color=ctxColor(c);
    return groupEl([
      lineEl([left,a[1]],[right,a[1]],{color,lineWidth:ctxWidth(c),dash:ctxDashOr(c, [4,4])}),
      labelEl([left+4,a[1]-6],txt(c),{color}),
    ]); } }
export class PriceLabelRenderer implements DrawingRenderer { type="priceLabel";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    // Real anchor value, not a placeholder: points carry {timeIndex, value}.
    const v = (c.drawing.points?.[0] as { value?: unknown } | undefined)?.value;
    const label = typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "";
    const color=ctxColor(c);
    return groupEl([
      {type:"rect",shape:{x:a[0],y:a[1]-11,width:Math.max(56,label.length*7+12),height:22},style:{fill:color}},
      labelEl([a[0]+6,a[1]+4],label,{color:contrastText(color)}),
    ]); } }
export class FlagMarkRenderer implements DrawingRenderer { type="flagMark";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const color=ctxColor(c);
    return groupEl([
      lineEl(a,[a[0],a[1]-24],{color,lineWidth:ctxWidth(c)}),
      {type:"polygon",shape:{points:[[a[0],a[1]-24],[a[0]+18,a[1]-19],[a[0],a[1]-14]]},style:{fill:color}},
    ]); } }
export class PinRenderer implements DrawingRenderer { type="pin";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const color=ctxColor(c);
    return groupEl([
      {type:"circle",shape:{cx:a[0],cy:a[1]-6,r:6},style:{fill:color}},
      lineEl([a[0],a[1]],[a[0],a[1]-12],{color,lineWidth:ctxWidth(c)}),
    ]); } }
export class CommentRenderer implements DrawingRenderer { type="comment";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const color=ctxColor(c);
    return groupEl([
      {type:"rect",shape:{x:a[0],y:a[1],width:16,height:12},style:{fill:"#fff",stroke:color}},
      labelEl([a[0]+2,a[1]+10],"…",{color}),
    ]); } }
export class SignpostRenderer implements DrawingRenderer { type="signpost";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    const color=ctxColor(c);
    return groupEl([
      lineEl([a[0],a[1]],[a[0],a[1]+30],{color,lineWidth:ctxWidth(c)}),
      {type:"rect",shape:{x:a[0]-30,y:a[1]-22,width:60,height:22},style:{fill:"#131722",stroke:color}},
      labelEl([a[0]-24,a[1]-6],txt(c),{color}),
    ]); } }
export class TableRenderer implements DrawingRenderer { type="table";
  render(c:DrawingRenderContext):any{
    const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts; const kids:any[]=[];
    const color=ctxColor(c);
    for(let rI=0;rI<2;rI++) for(let cI=0;cI<2;cI++){ const x=a[0]+cI*52, y=a[1]+rI*22;
      kids.push({type:"rect",shape:{x,y,width:52,height:22},style:{fill:"#131722",stroke:color}}); kids.push(labelEl([x+4,y+15],`c${cI}`,{color})); }
    return groupEl(kids); } }
const mk=(id:string)=>{return class extends QfTool {constructor(){super(id);}};};
export const TextTool = mk("qf:text"); export const CalloutTool = mk("qf:callout");
export const BrushTool = mk("qf:brush"); export const HighlighterTool = mk("qf:highlighter");
export const ArrowMarkerTool = mk("qf:arrowMarker"); export const AnchoredTextTool = mk("qf:anchoredText");
export const NoteTool = mk("qf:note"); export const PriceNoteTool = mk("qf:priceNote");
export const PriceLabelTool = mk("qf:priceLabel"); export const FlagMarkTool = mk("qf:flagMark");
export const PinTool = mk("qf:pin"); export const CommentTool = mk("qf:comment");
export const SignpostTool = mk("qf:signpost"); export const TableTool = mk("qf:table");
