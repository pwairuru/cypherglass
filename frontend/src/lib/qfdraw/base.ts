// frontend/src/lib/qfdraw/base.ts
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
export abstract class QfTool implements Plugin {
  id: string; context: ChartContext | null = null;
  private zrOff: (()=>void)[] = [];
  constructor(id:string){ this.id = id; }
  init(c:ChartContext){ this.context = c; }
  activate(): void { this.onActivate(); }
  deactivate(): void { this.zrOff.forEach((f)=>f()); this.zrOff = []; this.onDeactivate(); }
  protected onActivate(): void {}
  protected onDeactivate(): void {}
  protected track(off:()=>void){ this.zrOff.push(off); }
}
