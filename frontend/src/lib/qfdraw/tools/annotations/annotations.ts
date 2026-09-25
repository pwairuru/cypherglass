// frontend/src/lib/qfdraw/tools/annotations/annotations.ts
// Attribution: annotation layout adapted from lightweight-charts-drawing MIT, tools/annotations.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, labelEl } from "../../base";
type P=[number,number];
const txt=(c:DrawingRenderContext)=>String((c.drawing.style as any)?.text ?? "text");
export class TextRenderer implements DrawingRenderer { type="text";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts; return groupEl([labelEl(a,txt(c))]); } }
export class CalloutRenderer implements DrawingRenderer { type="callout";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts;
    return groupEl([lineEl(a,b,{color:"#787B86"}),{type:"rect",shape:{x:b[0],y:b[1]-22,width:Math.max(60,txt(c).length*6.5),height:22},style:{fill:"#131722",stroke:"#787B86"}},labelEl([b[0]+4,b[1]+4],txt(c))]); } }
export class BrushRenderer implements DrawingRenderer { type="brush";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:c.drawing.style?.color??"#2962FF",lineWidth:2,lineCap:"round"}}]); } }
export class HighlighterRenderer implements DrawingRenderer { type="highlighter";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]);
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:"#FFD600",lineWidth:8,opacity:0.4,lineCap:"round"}}]); } }
export class ArrowMarkerRenderer implements DrawingRenderer { type="arrowMarker";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([{type:"polygon",shape:{points:[[a[0],a[1]-8],[a[0]-6,a[1]+4],[a[0]+6,a[1]+4]]},style:{fill:"#2962FF"}}]); } }
export class AnchoredTextRenderer implements DrawingRenderer { type="anchoredText";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<2) return groupEl([]); const [a,b]=pts; return groupEl([lineEl(a,b,{color:"#787B86",dash:[3,3]}),labelEl(b,txt(c))]); } }
export class NoteRenderer implements DrawingRenderer { type="note";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1],r:8},style:{fill:"#FFD600",stroke:"#000"}},labelEl([a[0]+12,a[1]+4],"i")]); } }
export class PriceNoteRenderer implements DrawingRenderer { type="priceNote";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([lineEl([0,a[1]],[300,a[1]],{color:"#787B86",dash:[4,4]}),labelEl([4,a[1]-6],txt(c))]); } }
export class PriceLabelRenderer implements DrawingRenderer { type="priceLabel";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    // Real anchor value, not a placeholder: points carry {timeIndex, value}.
    const v = (c.drawing.points?.[0] as { value?: unknown } | undefined)?.value;
    const label = typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "";
    return groupEl([{type:"rect",shape:{x:a[0],y:a[1]-11,width:Math.max(56,label.length*7+12),height:22},style:{fill:"#2962FF"}},labelEl([a[0]+6,a[1]+4],label,{color:"#fff"})]); } }
export class FlagMarkRenderer implements DrawingRenderer { type="flagMark";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([lineEl(a,[a[0],a[1]-24],{color:"#2962FF"}),{type:"polygon",shape:{points:[[a[0],a[1]-24],[a[0]+18,a[1]-19],[a[0],a[1]-14]]},style:{fill:"#F23645"}}]); } }
export class PinRenderer implements DrawingRenderer { type="pin";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1]-6,r:6},style:{fill:"#F23645"}},lineEl([a[0],a[1]],[a[0],a[1]-12],{color:"#000"})]); } }
export class CommentRenderer implements DrawingRenderer { type="comment";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([{type:"rect",shape:{x:a[0],y:a[1],width:16,height:12},style:{fill:"#fff",stroke:"#787B86"}},labelEl([a[0]+2,a[1]+10],"…")]); } }
export class SignpostRenderer implements DrawingRenderer { type="signpost";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts;
    return groupEl([lineEl([a[0],a[1]],[a[0],a[1]+30],{color:"#787B86"}),{type:"rect",shape:{x:a[0]-30,y:a[1]-22,width:60,height:22},style:{fill:"#131722",stroke:"#787B86"}},labelEl([a[0]-24,a[1]-6],txt(c))]); } }
export class TableRenderer implements DrawingRenderer { type="table";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[] | undefined; if(!pts||pts.length<1) return groupEl([]); const [a]=pts; const kids:any[]=[];
    for(let rI=0;rI<2;rI++) for(let cI=0;cI<2;cI++){ const x=a[0]+cI*52, y=a[1]+rI*22;
      kids.push({type:"rect",shape:{x,y,width:52,height:22},style:{fill:"#131722",stroke:"#787B86"}}); kids.push(labelEl([x+4,y+15],`c${cI}`)); }
    return groupEl(kids); } }
const mk=(id:string)=>{return class extends QfTool {constructor(){super(id);}};};
export const TextTool = mk("qf:text"); export const CalloutTool = mk("qf:callout");
export const BrushTool = mk("qf:brush"); export const HighlighterTool = mk("qf:highlighter");
export const ArrowMarkerTool = mk("qf:arrowMarker"); export const AnchoredTextTool = mk("qf:anchoredText");
export const NoteTool = mk("qf:note"); export const PriceNoteTool = mk("qf:priceNote");
export const PriceLabelTool = mk("qf:priceLabel"); export const FlagMarkTool = mk("qf:flagMark");
export const PinTool = mk("qf:pin"); export const CommentTool = mk("qf:comment");
export const SignpostTool = mk("qf:signpost"); export const TableTool = mk("qf:table");
