// frontend/src/lib/qfdraw/base.ts
// Attribution: creation flow mirrors @qfo/qfchart built-in tools
// (zr click/mousemove + crosshair, pixelToData, addDrawing, disableTools).
import { graphic } from "echarts";
import type { ChartContext, Plugin } from "@qfo/qfchart";
export function makeId(prefix:string): string { return `${prefix}-${Math.random().toString(36).slice(2,9)}`; }
export function lineEl(p1:[number,number],p2:[number,number],style:{color?:string;lineWidth?:number;dash?:number[]}={}): any {
  return { type:"line", shape:{x1:p1[0],y1:p1[1],x2:p2[0],y2:p2[1]}, style:{stroke:style.color??"#2962FF",lineWidth:style.lineWidth??2,...(style.dash?{lineDash:style.dash}:{})} };
}
export function circleEl(p:[number,number],r=4,style:{color?:string}={}): any {
  return { type:"circle", shape:{cx:p[0],cy:p[1],r}, style:{fill:style.color??"#fff",stroke:"#2962FF",lineWidth:1} };
}
export function labelEl(p:[number,number],text:string,style:{color?:string;font?:string}={}): any {
  return { type:"text", style:{x:p[0]+6,y:p[1]-8,text,fill:style.color??"#d1d4dc",font:style.font??"11px sans-serif"} };
}
export function groupEl(children:any[]): any { return { type:"group", children }; }

export type QfCreateMode = "click" | "drag";

const PREVIEW_COLOR = "#2962FF";

/** Creation state machine shared by all ported tools.
 * click mode: N clicks (anchorCount; 0 = variable, dblclick finishes, min 2).
 * drag mode: mousedown, collect mousemove points, mouseup finishes. */
export abstract class QfTool implements Plugin {
  id: string; context: ChartContext | null = null;
  drawingType = "";
  /** Fixed anchor count; 0 = variable-length (dblclick finishes). */
  anchorCount = 2;
  mode: QfCreateMode = "click";
  private state: "idle" | "drawing" = "idle";
  private pts: [number, number][] = [];
  private preview: any = null;
  constructor(id:string){ this.id = id; }
  init(c:ChartContext){ this.context = c; }
  activate(): void { this.onActivate(); }
  deactivate(): void { this.reset(); this.onDeactivate(); }
  protected onActivate(): void {
    const zr = this.zr();
    if (!zr || !this.context) return;
    this.state = "idle"; this.pts = [];
    zr.setCursorStyle?.("crosshair");
    if (this.mode === "drag") {
      zr.on("mousedown", this.onMouseDown);
      zr.on("mousemove", this.onDragMove);
      zr.on("mouseup", this.onMouseUp);
    } else {
      zr.on("click", this.onClick);
      zr.on("mousemove", this.onMouseMove);
      zr.on("dblclick", this.onDblClick);
    }
  }
  protected onDeactivate(): void {}
  private zr(): any {
    try { return this.context?.getChart()?.getZr?.() ?? null; }
    catch { return null; }
  }
  private point(e:any): [number, number] {
    return [e?.offsetX ?? 0, e?.offsetY ?? 0];
  }
  private onClick = (e:any): void => {
    const p = this.point(e);
    if (this.state === "idle") {
      this.state = "drawing";
      if (this.anchorCount === 1) {
        this.pts = [p];
        this.finish();
        return;
      }
      this.pts = [p, [...p] as [number, number]];
      this.initPreview();
    } else {
      // Fix the rubber-band point; every entry is now a real anchor.
      this.pts[this.pts.length - 1] = p;
      if (this.anchorCount > 0 && this.pts.length >= this.anchorCount) {
        this.finish();
        return;
      }
      this.pts.push([...p] as [number, number]);
    }
    this.redrawPreview();
  };
  private onMouseMove = (e:any): void => {
    if (this.state !== "drawing" || this.pts.length < 2) return;
    this.pts[this.pts.length - 1] = this.point(e);
    this.redrawPreview();
  };
  private onDblClick = (): void => {
    if (this.state !== "drawing") return;
    if (this.anchorCount !== 0) return;
    this.pts.pop();
    if (this.pts.length >= 2) this.finish();
    else this.reset();
  };
  private onMouseDown = (e:any): void => {
    if (this.state !== "idle") return;
    this.state = "drawing";
    this.pts = [this.point(e)];
    this.initPreview();
    this.redrawPreview();
  };
  private onDragMove = (e:any): void => {
    if (this.state !== "drawing") return;
    const p = this.point(e);
    const last = this.pts[this.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
    this.pts.push(p);
    if (this.pts.length > 500) this.pts = this.pts.filter((_, i) => i % 2 === 0);
    this.redrawPreview();
  };
  private onMouseUp = (): void => {
    if (this.state !== "drawing") return;
    if (this.pts.length >= 2) this.finish();
    else this.reset();
  };
  private finish(): void {
    const ctx = this.context;
    if (!ctx) { this.reset(); return; }
    const data = this.pts.map(([x, y]) => {
      const d = ctx.coordinateConversion.pixelToData({ x, y });
      if (!d) return null;
      return { timeIndex: Math.round(d.timeIndex), value: d.value, paneIndex: d.paneIndex ?? 0 };
    });
    const drawingType = this.drawingType;
    const pane = data[0]?.paneIndex ?? 0;
    this.reset();
    if (!drawingType || data.some((d) => d === null)) return;
    ctx.addDrawing({
      id: makeId(drawingType),
      type: drawingType,
      points: data as { timeIndex: number; value: number }[],
      paneIndex: pane,
      style: { color: PREVIEW_COLOR, lineWidth: 2 },
    });
    ctx.disableTools?.();
  }
  private reset(): void {
    const zr = this.zr();
    if (zr) {
      for (const ev of ["click", "mousemove", "dblclick", "mousedown", "mouseup"]) {
        try { zr.off(ev, (this as any)[evHandler(ev)]); } catch { /* noop */ }
      }
      if (this.preview) {
        try { zr.remove(this.preview); } catch { /* noop */ }
      }
      try { zr.setCursorStyle?.("default"); } catch { /* noop */ }
    }
    this.state = "idle"; this.pts = []; this.preview = null;
  }
  private initPreview(): void {
    const zr = this.zr();
    if (!zr) return;
    this.preview = new graphic.Group();
    try { zr.add(this.preview); } catch { this.preview = null; }
  }
  private redrawPreview(): void {
    const g = this.preview;
    if (!g) return;
    g.removeAll();
    // Click mode keeps a rubber-band cursor point at the end; drag mode
    // stores only committed points.
    const fixed = this.mode === "click" ? this.pts.slice(0, -1) : this.pts;
    const all = this.pts;
    for (let i = 0; i + 1 < all.length; i++) {
      g.add(new graphic.Line({
        shape: { x1: all[i][0], y1: all[i][1], x2: all[i + 1][0], y2: all[i + 1][1] },
        style: { stroke: PREVIEW_COLOR, lineWidth: 1, lineDash: [4, 4] },
        silent: true,
      }));
    }
    for (const p of fixed) {
      g.add(new graphic.Circle({
        shape: { cx: p[0], cy: p[1], r: 3 },
        style: { fill: "#fff", stroke: PREVIEW_COLOR, lineWidth: 1 },
        silent: true,
      }));
    }
  }
}
function evHandler(ev: string): string {
  return { click: "onClick", mousemove: "onMouseMove", dblclick: "onDblClick", mousedown: "onMouseDown", mouseup: "onMouseUp" }[ev] ?? ev;
}
