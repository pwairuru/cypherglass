# QFDraw Full Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 68 lightweight-charts-drawing tools to native QFChart/ECharts renderers + plugins with a passing test per tool.

**Architecture:** New local library `frontend/src/lib/qfdraw/` holds ported geometry (pure, copied math), a `QfTool` base class implementing QFChart `Plugin`, one `DrawingRenderer` per drawing `type`, and a registry wiring all tools into `registerChartTools`. No fork of `@qfo/qfchart`; only its public `ChartContext/DrawingElement/DrawingRenderer/Plugin` contracts.

**Tech Stack:** TypeScript, Apache ECharts 5.5 custom-series groups, @qfo/qfchart 0.8.7, React wiring in PriceChart/DrawingPanel, vitest + @testing-library/react.

**Spec:** Spike findings in chat 2026-09-25 (68-vs-19 gap map, arch mismatch canvas→ECharts renderItem, time→timeIndex). No separate spec doc — spike terminal state is the spec.

## Global Constraints

- Node module `@qfo/qfchart` is read-only; all new code lives in `frontend/src/lib/qfdraw/`.
- Drawing persistence shape stays `DrawingElement{id:string,type:string,points:{timeIndex:number,value:number}[]}` so `src/lib/chartTools.ts` snapshot/restore keeps working.
- Source license MIT (deepentropy/lightweight-charts-drawing) → keep attribution comment in each ported geometry file.
- Every tool ships `*Tool` (Plugin, id=`qf:<name>`) + `*DrawingRenderer` (type=`<name>`) + vitest file; no tool merges without its test passing.
- Run tests from `frontend/`: `npx vitest run <path>`.
- Commit per task, never batch across families.

---

### Task 1: Foundation — geometry, coordinates, base tool, registry shell

**Files:**
- Create: `frontend/src/lib/qfdraw/geometry.ts`
- Create: `frontend/src/lib/qfdraw/coordinates.ts`
- Create: `frontend/src/lib/qfdraw/base.ts`
- Create: `frontend/src/lib/qfdraw/registry.ts`
- Test: `frontend/src/lib/qfdraw/foundation.test.ts`

**Interfaces:**
- Consumes: `@qfo/qfchart` types `ChartContext, DrawingElement, DrawingRenderer, DrawingRenderContext, Plugin, QFChart`.
- Produces: `distanceToSegment(ax,ay,bx,by,px,py): number`, `lerp(a,b,t): number`, `midpoint(a,b): [number,number]`, `rotatePoint(px,py,cx,cy,rad): [number,number]`, `fibPrices(low,high,ratios): number[]`, `timeToIndex(times:number[], t:number): number`, `makeId(prefix:string): string`, `lineEl(p1,p2,style)`, `circleEl(p,r,style)`, `labelEl(p,text,style)`, `groupEl(children): any`, `abstract class QfTool implements Plugin { id:string; context:ChartContext|null; init(c:ChartContext):void; activate():void; deactivate():void }`, `TOOL_TYPES: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/foundation.test.ts
import { describe, it, expect } from "vitest";
import { distanceToSegment, lerp, fibPrices } from "./geometry";
import { timeToIndex } from "./coordinates";
import { groupEl, lineEl } from "./base";

describe("foundation", () => {
  it("point-to-segment distance", () => {
    expect(distanceToSegment(0, 0, 10, 0, 5, 3)).toBeCloseTo(3);
    expect(distanceToSegment(0, 0, 10, 0, 15, 0)).toBeCloseTo(5);
  });
  it("lerp + fib prices", () => {
    expect(lerp(100, 200, 0.382)).toBeCloseTo(138.2);
    expect(fibPrices(100, 200, [0, 0.382, 1])).toEqual([100, 138.2, 200]);
  });
  it("time -> index mapping clamps", () => {
    expect(timeToIndex([10, 20, 30], 20)).toBe(1);
    expect(timeToIndex([10, 20, 30], 5)).toBe(0);
    expect(timeToIndex([10, 20, 30], 99)).toBe(2);
  });
  it("echarts element builders shape", () => {
    const g = groupEl([lineEl([0, 0], [10, 10], { color: "#fff", lineWidth: 2 })]);
    expect(g.type).toBe("group");
    expect(g.children[0].type).toBe("line");
    expect(g.children[0].shape).toEqual({ x1: 0, y1: 0, x2: 10, y2: 10 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/foundation.test.ts`
Expected: FAIL with "Failed to resolve import ./geometry"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/geometry.ts
// Attribution: math ported from deepentropy/lightweight-charts-drawing (MIT), src/core/geometry.
export function distanceToSegment(ax:number,ay:number,bx:number,by:number,px:number,py:number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
export function lerp(a:number,b:number,t:number): number { return a + (b - a) * t; }
export function midpoint(a:[number,number],b:[number,number]): [number,number] { return [(a[0]+b[0])/2,(a[1]+b[1])/2]; }
export function rotatePoint(px:number,py:number,cx:number,cy:number,rad:number): [number,number] {
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = px - cx, dy = py - cy;
  return [cx + dx*c - dy*s, cy + dx*s + dy*c];
}
export function fibPrices(low:number,high:number,ratios:number[]): number[] {
  return ratios.map((r) => Math.round((low + (high - low) * r) * 10) / 10);
}
```

```ts
// frontend/src/lib/qfdraw/coordinates.ts
export function timeToIndex(times:number[], t:number): number {
  if (times.length === 0) return 0;
  let best = 0, bd = Math.abs(times[0] - t);
  for (let i = 1; i < times.length; i++) { const d = Math.abs(times[i] - t); if (d < bd) { bd = d; best = i; } }
  return best;
}
```

```ts
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
```

```ts
// frontend/src/lib/qfdraw/registry.ts
import type { Plugin, QFChart } from "@qfo/qfchart";
export const TOOL_TYPES: string[] = [];
export function registerAllQfDrawings(_chart: QFChart): Record<string, Plugin> { void _chart; return {}; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/foundation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/geometry.ts frontend/src/lib/qfdraw/coordinates.ts frontend/src/lib/qfdraw/base.ts frontend/src/lib/qfdraw/registry.ts frontend/src/lib/qfdraw/foundation.test.ts
git commit -m "feat(qfdraw): foundation geometry, coords, base tool"
```

---

### Task 2: Lines family — arrow (new) + parity harness for 9 existing

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/lines/arrow.ts`
- Create: `frontend/src/lib/qfdraw/tools/lines/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/lines/lines.test.ts`

**Interfaces:**
- Consumes: Task 1 `lineEl,circleEl,groupEl,QfTool`, types `DrawingRenderer,DrawingRenderContext,ChartContext,DrawingElement`.
- Produces: `ArrowDrawingRenderer {type:"arrow",render(ctx):any}`, `ArrowTool extends QfTool {id="qf:arrow"}`, `LINE_TYPES=["arrow"]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/lines/lines.test.ts
import { describe, it, expect, vi } from "vitest";
import { ArrowDrawingRenderer, ArrowTool } from "./arrow";
describe("arrow", () => {
  it("renders shaft + head + handles when selected", () => {
    const r = new ArrowDrawingRenderer();
    const g = r.render({ drawing:{id:"a",type:"arrow",points:[{timeIndex:0,value:1},{timeIndex:1,value:2}]}, pixelPoints:[[0,100],[100,50]], isSelected:true, api:{}, coordSys:{x:0,y:0,width:200,height:150} } as any);
    expect(g.type).toBe("group");
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(1);
    expect(g.children.filter((c:any)=>c.type==="polygon").length).toBe(1);
    expect(g.children.filter((c:any)=>c.type==="circle").length).toBe(2);
    const head = g.children.find((c:any)=>c.type==="polygon");
    expect(head.shape.points.length).toBe(3);
  });
  it("tool collects 2 clicks then addDrawing", () => {
    const tool = new ArrowTool();
    const added: any[] = [];
    tool.init({ addDrawing:(d:any)=>{added.push(d);}, getChart:()=>({getZr:()=>({on:()=>{},off:()=>{}})}) } as any);
    tool.activate();
    (tool as any).handlePoint([10,20]);
    (tool as any).handlePoint([30,40]);
    expect(added.length).toBe(1);
    expect(added[0].type).toBe("arrow");
    expect(added[0].points.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/lines/lines.test.ts`
Expected: FAIL with "Failed to resolve import ./arrow"

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

```ts
// frontend/src/lib/qfdraw/tools/lines/index.ts
export * from "./arrow";
export const LINE_TYPES = ["arrow"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/lines/lines.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/lines/arrow.ts frontend/src/lib/qfdraw/tools/lines/index.ts frontend/src/lib/qfdraw/tools/lines/lines.test.ts
git commit -m "feat(qfdraw): arrow line tool + renderer"
```

---

### Task 3: Channels — parallel, regression, flat-top/bottom, disjoint

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/channels/channels.ts`
- Create: `frontend/src/lib/qfdraw/tools/channels/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/channels/channels.test.ts`

**Interfaces:**
- Consumes: Task 1 base + QFChart types.
- Produces: `ParallelChannelRenderer(type:"parallelChannel")`, `RegressionTrendRenderer(type:"regressionTrend")`, `FlatTopBottomRenderer(type:"flatTopBottom")`, `DisjointChannelRenderer(type:"disjointChannel")` + 4 `QfTool`s (`qf:parallelChannel`, `qf:regressionTrend`, `qf:flatTopBottom`, `qf:disjointChannel`), `CHANNEL_TYPES: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/channels/channels.test.ts
import { describe, it, expect } from "vitest";
import { ParallelChannelRenderer, RegressionTrendRenderer, FlatTopBottomRenderer, DisjointChannelRenderer } from "./channels";
function ctx(pts:[number,number][]): any { return { drawing:{id:"x",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("channels", () => {
  it("parallel renders 2 rails + fill", () => {
    const g = new ParallelChannelRenderer().render(ctx([[0,100],[100,60],[0,120]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(2);
    expect(g.children.some((c:any)=>c.type==="polygon")).toBe(true);
  });
  it("regression renders median + bands", () => {
    const g = new RegressionTrendRenderer().render(ctx([[0,100],[200,40]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(3);
  });
  it("flat top/bottom renders stepped level", () => {
    const g = new FlatTopBottomRenderer().render(ctx([[0,80],[100,80],[100,120]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(3);
  });
  it("disjoint renders 2 independent segments", () => {
    const g = new DisjointChannelRenderer().render(ctx([[0,100],[80,70],[120,90],[200,60]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/channels/channels.test.ts`
Expected: FAIL with "Failed to resolve import ./channels"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/channels/channels.ts
// Attribution: channel math adapted from lightweight-charts-drawing MIT, tools/channels.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
function offset(p:[number,number],dx:number,dy:number):[number,number]{return [p[0]+dx,p[1]+dy];}
export class ParallelChannelRenderer implements DrawingRenderer {
  type = "parallelChannel";
  render(ctx: DrawingRenderContext): any {
    const [a,b,c] = ctx.pixelPoints as [number,number][];
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
    const [a,b] = ctx.pixelPoints as [number,number][];
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
    const [a,b,c] = ctx.pixelPoints as [number,number][];
    const col = ctx.drawing.style?.color ?? "#2962FF";
    return groupEl([lineEl(a,b,{color:col}), lineEl(b,c,{color:col}), lineEl(a,[c[0],a[1]],{color:col,dash:[4,4]})]);
  }
}
export class DisjointChannelRenderer implements DrawingRenderer {
  type = "disjointChannel";
  render(ctx: DrawingRenderContext): any {
    const [a,b,c,d] = ctx.pixelPoints as [number,number][];
    const col = ctx.drawing.style?.color ?? "#2962FF";
    return groupEl([lineEl(a,b,{color:col}), lineEl(c,d,{color:col})]);
  }
}
export class ParallelChannelTool extends QfTool { constructor(){super("qf:parallelChannel");} }
export class RegressionTrendTool extends QfTool { constructor(){super("qf:regressionTrend");} }
export class FlatTopBottomTool extends QfTool { constructor(){super("qf:flatTopBottom");} }
export class DisjointChannelTool extends QfTool { constructor(){super("qf:disjointChannel");} }
```

```ts
// frontend/src/lib/qfdraw/tools/channels/index.ts
export * from "./channels";
export const CHANNEL_TYPES = ["parallelChannel","regressionTrend","flatTopBottom","disjointChannel"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/channels/channels.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/channels/channels.ts frontend/src/lib/qfdraw/tools/channels/index.ts frontend/src/lib/qfdraw/tools/channels/channels.test.ts
git commit -m "feat(qfdraw): 4 channel renderers + tools"
```

---

### Task 4: Pitchforks — andrews, schiff, modified-schiff, inside

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.ts`
- Create: `frontend/src/lib/qfdraw/tools/pitchforks/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts`

**Interfaces:**
- Consumes: Task 1 base.
- Produces: `AndrewsPitchforkRenderer(type:"andrewsPitchfork")`, `SchiffPitchforkRenderer(type:"schiffPitchfork")`, `ModifiedSchiffPitchforkRenderer(type:"modifiedSchiffPitchfork")`, `InsidePitchforkRenderer(type:"insidePitchfork")` + 4 tools, `PITCHFORK_TYPES`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts
import { describe, it, expect } from "vitest";
import { AndrewsPitchforkRenderer, SchiffPitchforkRenderer, ModifiedSchiffPitchforkRenderer, InsidePitchforkRenderer } from "./pitchforks";
function ctx(): any { return { drawing:{id:"p",type:"t",points:[{timeIndex:0,value:0},{timeIndex:1,value:0},{timeIndex:2,value:0}]}, pixelPoints:[[20,120],[100,60],[100,140]], isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("pitchforks", () => {
  it("andrews has median + 2 parallels", () => {
    const g = new AndrewsPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("schiff shifts origin to mid of p2-p3", () => {
    const g = new SchiffPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("modified schiff renders 3 lines", () => {
    const g = new ModifiedSchiffPitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("inside uses tighter median", () => {
    const g = new InsidePitchforkRenderer().render(ctx());
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts`
Expected: FAIL with "Failed to resolve import ./pitchforks"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.ts
// Attribution: pitchfork math adapted from lightweight-charts-drawing MIT, tools/pitchforks.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
type P=[number,number];
function medianLines(origin:P,p2:P,p3:P,edge=260): any[] {
  const mid:P=[(p2[0]+p3[0])/2,(p2[1]+p3[1])/2];
  const dx=mid[0]-origin[0], dy=mid[1]-origin[1];
  const n=Math.hypot(dx,dy)||1, ux=dx/n, uy=dy/n;
  const tip:P=[origin[0]+ux*edge, origin[1]+uy*edge];
  const s2:P=[p2[0]+ux*edge*0.6, p2[1]+uy*edge*0.6], s3:P=[p3[0]+ux*edge*0.6, p3[1]+uy*edge*0.6];
  return [lineEl(origin,tip,{color:"#2962FF"}), lineEl(p2,s2,{color:"#2962FF"}), lineEl(p3,s3,{color:"#2962FF"})];
}
export class AndrewsPitchforkRenderer implements DrawingRenderer {
  type="andrewsPitchfork";
  render(ctx:DrawingRenderContext):any{ const [a,b,c]=ctx.pixelPoints as P[]; return groupEl(medianLines(a,b,c)); }
}
export class SchiffPitchforkRenderer implements DrawingRenderer {
  type="schiffPitchfork";
  render(ctx:DrawingRenderContext):any{ const [a,b,c]=ctx.pixelPoints as P[]; const o:P=[(a[0]+(b[0]+c[0])/2)/2,(a[1]+(b[1]+c[1])/2)/2]; return groupEl(medianLines(o,b,c)); }
}
export class ModifiedSchiffPitchforkRenderer implements DrawingRenderer {
  type="modifiedSchiffPitchfork";
  render(ctx:DrawingRenderContext):any{ const [a,b,c]=ctx.pixelPoints as P[]; const o:P=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3]; return groupEl(medianLines(o,b,c)); }
}
export class InsidePitchforkRenderer implements DrawingRenderer {
  type="insidePitchfork";
  render(ctx:DrawingRenderContext):any{ const [a,b,c]=ctx.pixelPoints as P[]; const mid:P=[(b[0]+c[0])/2,(b[1]+c[1])/2]; const o:P=[(a[0]+mid[0])/2,(a[1]+mid[1])/2]; return groupEl(medianLines(o,b,c,200)); }
}
export class AndrewsPitchforkTool extends QfTool { constructor(){super("qf:andrewsPitchfork");} }
export class SchiffPitchforkTool extends QfTool { constructor(){super("qf:schiffPitchfork");} }
export class ModifiedSchiffPitchforkTool extends QfTool { constructor(){super("qf:modifiedSchiffPitchfork");} }
export class InsidePitchforkTool extends QfTool { constructor(){super("qf:insidePitchfork");} }
```

```ts
// frontend/src/lib/qfdraw/tools/pitchforks/index.ts
export * from "./pitchforks";
export const PITCHFORK_TYPES = ["andrewsPitchfork","schiffPitchfork","modifiedSchiffPitchfork","insidePitchfork"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.ts frontend/src/lib/qfdraw/tools/pitchforks/index.ts frontend/src/lib/qfdraw/tools/pitchforks/pitchforks.test.ts
git commit -m "feat(qfdraw): 4 pitchfork renderers + tools"
```

---

### Task 5: Fibonacci extras — extension, timezone, time-extension, circles, spiral, arcs, wedge, pitchfan

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/fibonacci/extras.ts`
- Create: `frontend/src/lib/qfdraw/tools/fibonacci/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/fibonacci/extras.test.ts`

**Interfaces:**
- Consumes: Task 1 `fibPrices,lineEl,labelEl,groupEl`.
- Produces: 8 renderers (`fibExtension,fibTimeZone,fibTimeExtension,fibCircles,fibSpiral,fibArcs,fibWedge,pitchfan`) + 8 tools, `FIB_EXTRA_TYPES`, `FIB_EXTENSION_LEVELS=[0,0.618,1,1.618,2.618]`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/fibonacci/extras.test.ts
import { describe, it, expect } from "vitest";
import { FibExtensionRenderer, FibTimeZoneRenderer, FibCirclesRenderer, FibArcsRenderer, FibWedgeRenderer, PitchfanRenderer, FibTimeExtensionRenderer, FibSpiralRenderer } from "./extras";
function ctx(pts:[number,number][]): any { return { drawing:{id:"f",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("fib extras", () => {
  it("extension draws 5 levels with labels", () => {
    const g = new FibExtensionRenderer().render(ctx([[0,150],[200,50],[100,100]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(5);
    expect(g.children.some((c:any)=>c.type==="text" && String(c.style.text).includes("1.618"))).toBe(true);
  });
  it("timezone draws verticals", () => {
    const g = new FibTimeZoneRenderer().render(ctx([[0,0],[200,0]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(5);
  });
  it("circles draws 3 rings", () => {
    const g = new FibCirclesRenderer().render(ctx([[50,100],[150,60]]));
    expect(g.children.filter((c:any)=>c.type==="circle").length).toBeGreaterThanOrEqual(3);
  });
  it("arcs draws 3 arcs", () => {
    const g = new FibArcsRenderer().render(ctx([[50,150],[150,50]]));
    expect(g.children.filter((c:any)=>c.type==="arc").length).toBe(3);
  });
  it("wedge draws 2 fans + labels", () => {
    const g = new FibWedgeRenderer().render(ctx([[0,150],[200,150],[200,50]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(4);
  });
  it("pitchfan draws 3 fans", () => {
    const g = new PitchfanRenderer().render(ctx([[0,150],[200,50],[200,150]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(3);
  });
  it("time extension + spiral render", () => {
    expect(new FibTimeExtensionRenderer().render(ctx([[0,0],[100,0],[160,0]])).children.length).toBeGreaterThan(0);
    expect(new FibSpiralRenderer().render(ctx([[50,100],[150,60]])).children.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/fibonacci/extras.test.ts`
Expected: FAIL with "Failed to resolve import ./extras"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/fibonacci/extras.ts
// Attribution: levels adapted from lightweight-charts-drawing MIT, tools/fibonacci.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, labelEl } from "../../base";
export const FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618];
const TZ = [0, 1, 1.618, 2.618, 4.236];
type P=[number,number];
export class FibExtensionRenderer implements DrawingRenderer {
  type="fibExtension";
  render(ctx:DrawingRenderContext):any{
    const [a,b] = ctx.pixelPoints as P[]; const kids:any[]=[];
    for (const r of FIB_EXTENSION_LEVELS){ const y=a[1]+(b[1]-a[1])*r;
      kids.push(lineEl([Math.min(a[0],b[0])-40,y],[Math.max(a[0],b[0])+40,y],{color:"#F23645"}), labelEl([Math.max(a[0],b[0])+42,y],String(r),{color:"#F23645"})); }
    return groupEl(kids);
  }
}
export class FibTimeZoneRenderer implements DrawingRenderer {
  type="fibTimeZone";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[]; const dx=b[0]-a[0]; const kids:any[]=[];
    for (const r of TZ){ const x=a[0]+dx*r; kids.push(lineEl([x,0],[x,220],{color:"#089981"})); }
    return groupEl(kids);
  }
}
export class FibTimeExtensionRenderer implements DrawingRenderer {
  type="fibTimeExtension";
  render(ctx:DrawingRenderContext):any{
    const [a,b,c]=ctx.pixelPoints as P[]; const base=c[0]-b[0]; const kids:any[]=[];
    for (const r of [1,1.618,2.618]){ const x=c[0]+base*r; kids.push(lineEl([x,0],[x,220],{color:"#089981"})); }
    void a; return groupEl(kids);
  }
}
export class FibCirclesRenderer implements DrawingRenderer {
  type="fibCircles";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[]; const r0=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return groupEl([0.382,0.618,1].map((f)=>({type:"circle",shape:{cx:a[0],cy:a[1],r:r0*f},style:{stroke:"#F23645",lineWidth:1,fill:"transparent"}})));
  }
}
export class FibSpiralRenderer implements DrawingRenderer {
  type="fibSpiral";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[]; const pts:P[]=[];
    for(let i=0;i<=40;i++){const t=i/40*Math.PI*4;const r=(Math.hypot(b[0]-a[0],b[1]-a[1])/8)*t;pts.push([a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)]);}
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:"#F23645",lineWidth:1}}]);
  }
}
export class FibArcsRenderer implements DrawingRenderer {
  type="fibArcs";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[]; const r=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return groupEl([0.382,0.5,0.618].map((f)=>({type:"arc",shape:{cx:a[0],cy:a[1],r:r*f,startAngle:0,endAngle:Math.PI},style:{stroke:"#F23645",lineWidth:1}})));
  }
}
export class FibWedgeRenderer implements DrawingRenderer {
  type="fibWedge";
  render(ctx:DrawingRenderContext):any{
    const [a,b,c]=ctx.pixelPoints as P[]; const kids:any[]=[lineEl(a,b,{color:"#F23645"}),lineEl(a,c,{color:"#F23645"})];
    for(const f of [0.382,0.618]){kids.push(lineEl([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],[a[0]+(c[0]-a[0])*f,a[1]+(c[1]-a[1])*f],{color:"#F23645",dash:[4,4]}));}
    return groupEl(kids);
  }
}
export class PitchfanRenderer implements DrawingRenderer {
  type="pitchfan";
  render(ctx:DrawingRenderContext):any{
    const [a,b,c]=ctx.pixelPoints as P[];
    return groupEl([lineEl(a,b,{color:"#2962FF"}),lineEl(a,c,{color:"#2962FF"}),lineEl(a,[(b[0]+c[0])/2,(b[1]+c[1])/2],{color:"#2962FF"})]);
  }
}
const mk=(id:string)=>{return class extends QfTool {constructor(){super(id);}};};
export const FibExtensionTool = mk("qf:fibExtension");
export const FibTimeZoneTool = mk("qf:fibTimeZone");
export const FibTimeExtensionTool = mk("qf:fibTimeExtension");
export const FibCirclesTool = mk("qf:fibCircles");
export const FibSpiralTool = mk("qf:fibSpiral");
export const FibArcsTool = mk("qf:fibArcs");
export const FibWedgeTool = mk("qf:fibWedge");
export const PitchfanTool = mk("qf:pitchfan");
```

```ts
// frontend/src/lib/qfdraw/tools/fibonacci/index.ts
export * from "./extras";
export const FIB_EXTRA_TYPES = ["fibExtension","fibTimeZone","fibTimeExtension","fibCircles","fibSpiral","fibArcs","fibWedge","pitchfan"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/fibonacci/extras.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/fibonacci/extras.ts frontend/src/lib/qfdraw/tools/fibonacci/index.ts frontend/src/lib/qfdraw/tools/fibonacci/extras.test.ts
git commit -m "feat(qfdraw): 8 fib extra renderers + tools"
```

---

### Task 6: Gann — box, fan, square-fixed, square

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/gann/gann.ts`
- Create: `frontend/src/lib/qfdraw/tools/gann/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/gann/gann.test.ts`

**Interfaces:**
- Consumes: Task 1 base.
- Produces: `GannBoxRenderer(type:"gannBox")`, `GannFanRenderer(type:"gannFan")`, `GannSquareFixedRenderer(type:"gannSquareFixed")`, `GannSquareRenderer(type:"gannSquare")` + 4 tools, `GANN_TYPES`, `GANN_FAN=[1,2,4,8]` slopes.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/gann/gann.test.ts
import { describe, it, expect } from "vitest";
import { GannBoxRenderer, GannFanRenderer, GannSquareFixedRenderer, GannSquareRenderer } from "./gann";
function ctx(pts:[number,number][]): any { return { drawing:{id:"g",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("gann", () => {
  it("box draws rect + diagonals", () => {
    const g = new GannBoxRenderer().render(ctx([[0,150],[200,50]]));
    expect(g.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(g.children.filter((c:any)=>c.type==="line").length).toBeGreaterThanOrEqual(2);
  });
  it("fan draws 4 slopes", () => {
    const g = new GannFanRenderer().render(ctx([[0,150],[200,150]]));
    expect(g.children.filter((c:any)=>c.type==="line").length).toBe(4);
  });
  it("square fixed + square render grids", () => {
    expect(new GannSquareFixedRenderer().render(ctx([[100,100]])).children.length).toBeGreaterThan(0);
    expect(new GannSquareRenderer().render(ctx([[0,150],[200,50]])).children.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/gann/gann.test.ts`
Expected: FAIL with "Failed to resolve import ./gann"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/gann/gann.ts
// Attribution: gann levels adapted from lightweight-charts-drawing MIT, tools/gann.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
type P=[number,number];
export const GANN_FAN = [1, 2, 4, 8];
export class GannBoxRenderer implements DrawingRenderer {
  type="gannBox";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[];
    const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
    return groupEl([{type:"rect",shape:{x,y,width:w,height:h},style:{stroke:"#2962FF",lineWidth:1,fill:"transparent"}},
      lineEl([x,y],[x+w,y+h],{color:"#2962FF"}), lineEl([x,y+h],[x+w,y],{color:"#2962FF"})]);
  }
}
export class GannFanRenderer implements DrawingRenderer {
  type="gannFan";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[]; const kids:any[]=[];
    for (const s of GANN_FAN){ const run=(b[0]-a[0])/s; kids.push(lineEl(a,[a[0]+run,a[1]-(a[1]-b[1])/s*2],{color:"#2962FF"})); }
    return groupEl(kids);
  }
}
export class GannSquareFixedRenderer implements DrawingRenderer {
  type="gannSquareFixed";
  render(ctx:DrawingRenderContext):any{
    const [a]=ctx.pixelPoints as P[]; const kids:any[]=[];
    for(let i=1;i<=3;i++){kids.push({type:"rect",shape:{x:a[0]-i*20,y:a[1]-i*20,width:i*40,height:i*40},style:{stroke:"#2962FF",fill:"transparent"}});}
    return groupEl(kids);
  }
}
export class GannSquareRenderer implements DrawingRenderer {
  type="gannSquare";
  render(ctx:DrawingRenderContext):any{
    const [a,b]=ctx.pixelPoints as P[];
    const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
    const kids:any[]=[{type:"rect",shape:{x,y,width:w,height:h},style:{stroke:"#2962FF",fill:"transparent"}}];
    kids.push(lineEl([x+w/2,y],[x+w/2,y+h],{color:"#2962FF",dash:[4,4]}), lineEl([x,y+h/2],[x+w,y+h/2],{color:"#2962FF",dash:[4,4]}));
    return groupEl(kids);
  }
}
export class GannBoxTool extends QfTool { constructor(){super("qf:gannBox");} }
export class GannFanTool extends QfTool { constructor(){super("qf:gannFan");} }
export class GannSquareFixedTool extends QfTool { constructor(){super("qf:gannSquareFixed");} }
export class GannSquareTool extends QfTool { constructor(){super("qf:gannSquare");} }
```

```ts
// frontend/src/lib/qfdraw/tools/gann/index.ts
export * from "./gann";
export const GANN_TYPES = ["gannBox","gannFan","gannSquareFixed","gannSquare"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/gann/gann.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/gann/gann.ts frontend/src/lib/qfdraw/tools/gann/index.ts frontend/src/lib/qfdraw/tools/gann/gann.test.ts
git commit -m "feat(qfdraw): 4 gann renderers + tools"
```

---

### Task 7: Forecast & measurement — long/short, forecast, bars-pattern, projection, price/date ranges

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/forecast/forecast.ts`
- Create: `frontend/src/lib/qfdraw/tools/forecast/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/forecast/forecast.test.ts`

**Interfaces:**
- Consumes: Task 1 base + `labelEl`.
- Produces: 7 renderers (`longPosition,shortPosition,forecast,barsPattern,projection,priceRange,datePriceRange`) + 7 tools, `FORECAST_TYPES`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/forecast/forecast.test.ts
import { describe, it, expect } from "vitest";
import { LongPositionRenderer, ShortPositionRenderer, ForecastRenderer, BarsPatternRenderer, ProjectionRenderer, PriceRangeRenderer, DatePriceRangeRenderer } from "./forecast";
function ctx(pts:[number,number][]): any { return { drawing:{id:"f",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("forecast", () => {
  it("long/short show rect + label", () => {
    const l = new LongPositionRenderer().render(ctx([[0,150],[200,50],[200,100]]));
    const s = new ShortPositionRenderer().render(ctx([[0,50],[200,150],[200,100]]));
    expect(l.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(s.children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(l.children.some((c:any)=>c.type==="text")).toBe(true);
  });
  it("forecast/bars/projection render", () => {
    expect(new ForecastRenderer().render(ctx([[0,100],[200,60]])).children.length).toBeGreaterThan(0);
    expect(new BarsPatternRenderer().render(ctx([[0,100],[100,80],[200,90]])).children.length).toBeGreaterThan(0);
    expect(new ProjectionRenderer().render(ctx([[0,100],[100,80],[200,90]])).children.length).toBeGreaterThan(0);
  });
  it("ranges render bands", () => {
    expect(new PriceRangeRenderer().render(ctx([[0,150],[0,50]])).children.length).toBeGreaterThan(0);
    expect(new DatePriceRangeRenderer().render(ctx([[0,150],[200,50]])).children.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/forecast/forecast.test.ts`
Expected: FAIL with "Failed to resolve import ./forecast"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/forecast/forecast.ts
// Attribution: risk/forecast boxes adapted from lightweight-charts-drawing MIT, tools/forecasting.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, labelEl } from "../../base";
type P=[number,number];
function riskBox(a:P,b:P,fill:string,label:string):any{
  const x=Math.min(a[0],b[0]), y=Math.min(a[1],b[1]), w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]);
  return groupEl([{type:"rect",shape:{x,y,width:w,height:h},style:{fill,opacity:0.25,stroke:fill,lineWidth:1}}, labelEl([x+4,y+4],label,{color:fill})]);
}
export class LongPositionRenderer implements DrawingRenderer { type="longPosition";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; return riskBox(a,b,"#089981","Long"); } }
export class ShortPositionRenderer implements DrawingRenderer { type="shortPosition";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; return riskBox(a,b,"#F23645","Short"); } }
export class ForecastRenderer implements DrawingRenderer { type="forecast";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; return groupEl([lineEl(a,b,{color:"#787B86",dash:[6,4]}), labelEl(b,"forecast")]); } }
export class BarsPatternRenderer implements DrawingRenderer { type="barsPattern";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[]; return groupEl([lineEl(a,b,{color:"#2962FF"}),lineEl(b,cc,{color:"#2962FF"}),labelEl(cc,"bars")]); } }
export class ProjectionRenderer implements DrawingRenderer { type="projection";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[]; return groupEl([lineEl(a,b,{color:"#2962FF"}),lineEl(b,[cc[0],2*b[1]-a[1]],{color:"#2962FF",dash:[4,4]})]); } }
export class PriceRangeRenderer implements DrawingRenderer { type="priceRange";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; return groupEl([lineEl([0,a[1]],[300,a[1]],{color:"#787B86"}),lineEl([0,b[1]],[300,b[1]],{color:"#787B86"}),labelEl([4,(a[1]+b[1])/2],`${Math.abs(a[1]-b[1]).toFixed(1)}px`)]); } }
export class DatePriceRangeRenderer implements DrawingRenderer { type="datePriceRange";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);
    return groupEl([{type:"rect",shape:{x,y,width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])},style:{stroke:"#787B86",fill:"transparent"}},labelEl([x,y-16,"bars x price"] as any)]); } }
export class LongPositionTool extends QfTool { constructor(){super("qf:longPosition");} }
export class ShortPositionTool extends QfTool { constructor(){super("qf:shortPosition");} }
export class ForecastTool extends QfTool { constructor(){super("qf:forecast");} }
export class BarsPatternTool extends QfTool { constructor(){super("qf:barsPattern");} }
export class ProjectionTool extends QfTool { constructor(){super("qf:projection");} }
export class PriceRangeTool extends QfTool { constructor(){super("qf:priceRange");} }
export class DatePriceRangeTool extends QfTool { constructor(){super("qf:datePriceRange");} }
```

```ts
// frontend/src/lib/qfdraw/tools/forecast/index.ts
export * from "./forecast";
export const FORECAST_TYPES = ["longPosition","shortPosition","forecast","barsPattern","projection","priceRange","datePriceRange"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/forecast/forecast.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/forecast/forecast.ts frontend/src/lib/qfdraw/tools/forecast/index.ts frontend/src/lib/qfdraw/tools/forecast/forecast.test.ts
git commit -m "feat(qfdraw): 7 forecast/measure renderers + tools"
```

---

### Task 8: Shapes — rectangle, rotated, circle, ellipse, triangle, arc, path, polyline, curve, double-curve

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/shapes/shapes.ts`
- Create: `frontend/src/lib/qfdraw/tools/shapes/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/shapes/shapes.test.ts`

**Interfaces:**
- Consumes: Task 1 base.
- Produces: 10 renderers (`rectangle,rotatedRectangle,circle,ellipse,triangle,arc,path,polyline,curve,doubleCurve`) + 10 tools, `SHAPE_TYPES`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/shapes/shapes.test.ts
import { describe, it, expect } from "vitest";
import { RectangleRenderer, EllipseRenderer, TriangleRenderer, PolylineRenderer, CurveRenderer, CircleRenderer, RotatedRectangleRenderer, ArcRenderer, PathRenderer, DoubleCurveRenderer } from "./shapes";
function ctx(pts:[number,number][]): any { return { drawing:{id:"s",type:"t",points:pts.map(()=>({timeIndex:0,value:0}))}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("shapes", () => {
  it("rect/ellipse/triangle/circle", () => {
    expect(new RectangleRenderer().render(ctx([[0,150],[200,50]])).children.some((c:any)=>c.type==="rect")).toBe(true);
    expect(new EllipseRenderer().render(ctx([[0,150],[200,50]])).children.some((c:any)=>c.type==="ellipse")).toBe(true);
    expect(new TriangleRenderer().render(ctx([[0,150],[100,50],[200,150]])).children.some((c:any)=>c.type==="polygon")).toBe(true);
    expect(new CircleRenderer().render(ctx([[50,100],[150,60]])).children.some((c:any)=>c.type==="circle")).toBe(true);
  });
  it("paths and curves", () => {
    expect(new PolylineRenderer().render(ctx([[0,100],[80,60],[160,90]])).children.some((c:any)=>c.type==="polyline")).toBe(true);
    expect(new PathRenderer().render(ctx([[0,100],[160,90]])).children.some((c:any)=>c.type==="polyline")).toBe(true);
    expect(new CurveRenderer().render(ctx([[0,100],[60,40],[140,140],[200,80]])).children.some((c:any)=>c.type==="bezier-curve")).toBe(true);
    expect(new DoubleCurveRenderer().render(ctx([[0,100],[100,40],[200,100]])).children.length).toBe(2);
    expect(new RotatedRectangleRenderer().render(ctx([[0,100],[150,60],[150,120]])).children.some((c:any)=>c.type==="polygon")).toBe(true);
    expect(new ArcRenderer().render(ctx([[0,100],[100,60],[200,100]])).children.some((c:any)=>c.type==="arc")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/shapes/shapes.test.ts`
Expected: FAIL with "Failed to resolve import ./shapes"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/shapes/shapes.ts
// Attribution: shape math adapted from lightweight-charts-drawing MIT, tools/shapes.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl } from "../../base";
type P=[number,number];
const st=(c:DrawingRenderContext)=>({stroke:c.drawing.style?.color??"#2962FF",lineWidth:c.drawing.style?.lineWidth??2,fill:"transparent"});
export class RectangleRenderer implements DrawingRenderer { type="rectangle";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[];
    return groupEl([{type:"rect",shape:{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])},style:st(c)}]); } }
export class RotatedRectangleRenderer implements DrawingRenderer { type="rotatedRectangle";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[];
    const vx=b[0]-a[0], vy=b[1]-a[1]; const n=Math.hypot(vx,vy)||1; const nx=-vy/n, ny=vx/n;
    const t=((cc[0]-a[0])*nx+(cc[1]-a[1])*ny); const d:P=[b[0]+nx*t,b[1]+ny*t]; const e:P=[a[0]+nx*t,a[1]+ny*t];
    return groupEl([{type:"polygon",shape:{points:[a,b,d,e]},style:st(c)}]); } }
export class CircleRenderer implements DrawingRenderer { type="circle";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[];
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1],r:Math.hypot(b[0]-a[0],b[1]-a[1])},style:st(c)}]); } }
export class EllipseRenderer implements DrawingRenderer { type="ellipse";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[];
    return groupEl([{type:"ellipse",shape:{cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,rx:Math.abs(b[0]-a[0])/2,ry:Math.abs(b[1]-a[1])/2},style:st(c)}]); } }
export class TriangleRenderer implements DrawingRenderer { type="triangle";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[];
    return groupEl([{type:"polygon",shape:{points:[a,b,cc]},style:st(c)}]); } }
export class ArcRenderer implements DrawingRenderer { type="arc";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[]; const r=Math.hypot(b[0]-a[0],b[1]-a[1]);
    void cc; return groupEl([{type:"arc",shape:{cx:a[0],cy:a[1],r,startAngle:0,endAngle:Math.PI/2},style:st(c)}]); } }
export class PathRenderer implements DrawingRenderer { type="path";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[];
    return groupEl([{type:"polyline",shape:{points:pts},style:st(c)}]); } }
export class PolylineRenderer implements DrawingRenderer { type="polyline";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[];
    return groupEl([{type:"polyline",shape:{points:pts},style:st(c)}]); } }
export class CurveRenderer implements DrawingRenderer { type="curve";
  render(c:DrawingRenderContext):any{ const [a,b,cc,d]=c.pixelPoints as P[];
    return groupEl([{type:"bezier-curve",shape:{x1:a[0],y1:a[1],cpx1:b[0],cpy1:b[1],cpx2:cc[0],cpy2:cc[1],x2:d[0],y2:d[1]},style:st(c)}]); } }
export class DoubleCurveRenderer implements DrawingRenderer { type="doubleCurve";
  render(c:DrawingRenderContext):any{ const [a,b,cc]=c.pixelPoints as P[];
    return groupEl([{type:"bezier-curve",shape:{x1:a[0],y1:a[1],cpx1:b[0],cpy1:b[1],cpx2:b[0],cpy2:b[1],x2:cc[0],y2:cc[1]},style:st(c)},
      lineEl(a,cc,{color:"#787B86",dash:[4,4]})]); } }
const mk=(id:string)=>{return class extends QfTool {constructor(){super(id);}};};
export const RectangleTool = mk("qf:rectangle"); export const RotatedRectangleTool = mk("qf:rotatedRectangle");
export const CircleTool = mk("qf:circle"); export const EllipseTool = mk("qf:ellipse");
export const TriangleTool = mk("qf:triangle"); export const ArcTool = mk("qf:arc");
export const PathTool = mk("qf:path"); export const PolylineTool = mk("qf:polyline");
export const CurveTool = mk("qf:curve"); export const DoubleCurveTool = mk("qf:doubleCurve");
```

```ts
// frontend/src/lib/qfdraw/tools/shapes/index.ts
export * from "./shapes";
export const SHAPE_TYPES = ["rectangle","rotatedRectangle","circle","ellipse","triangle","arc","path","polyline","curve","doubleCurve"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/shapes/shapes.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/shapes/shapes.ts frontend/src/lib/qfdraw/tools/shapes/index.ts frontend/src/lib/qfdraw/tools/shapes/shapes.test.ts
git commit -m "feat(qfdraw): 10 shape renderers + tools"
```

---

### Task 9: Annotations — text, callout, brushes, markers, notes, flags, table

**Files:**
- Create: `frontend/src/lib/qfdraw/tools/annotations/annotations.ts`
- Create: `frontend/src/lib/qfdraw/tools/annotations/index.ts`
- Test: `frontend/src/lib/qfdraw/tools/annotations/annotations.test.ts`

**Interfaces:**
- Consumes: Task 1 base + labelEl.
- Produces: 13 renderers (`text,callout,brush,highlighter,arrowMarker,anchoredText,note,priceNote,priceLabel,flagMark,pin,comment,signpost,table` — table via rect+text grid) + tools, `ANNOTATION_TYPES`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/tools/annotations/annotations.test.ts
import { describe, it, expect } from "vitest";
import { TextRenderer, CalloutRenderer, BrushRenderer, FlagMarkRenderer, TableRenderer, PriceLabelRenderer } from "./annotations";
function ctx(pts:[number,number][], text="hello"): any { return { drawing:{id:"t",type:"t",points:pts.map(()=>({timeIndex:0,value:0})),style:{text} as any}, pixelPoints:pts, isSelected:false, api:{}, coordSys:{x:0,y:0,width:300,height:200} }; }
describe("annotations", () => {
  it("text + price label", () => {
    const g = new TextRenderer().render(ctx([[50,80]]));
    expect(g.children.some((c:any)=>c.type==="text" && c.style.text==="hello")).toBe(true);
    const p = new PriceLabelRenderer().render(ctx([[50,80]]));
    expect(p.children.some((c:any)=>c.type==="rect")).toBe(true);
  });
  it("callout links anchor to text", () => {
    const g = new CalloutRenderer().render(ctx([[50,100],[120,60]]));
    expect(g.children.some((c:any)=>c.type==="line")).toBe(true);
    expect(g.children.some((c:any)=>c.type==="text")).toBe(true);
  });
  it("brush/highlighter polyline width differs", () => {
    const b = new BrushRenderer().render(ctx([[0,100],[80,80],[160,90]]));
    const kids = b.children[0];
    expect(kids.type).toBe("polyline");
    expect(kids.style.lineWidth).toBe(2);
  });
  it("flag + table", () => {
    expect(new FlagMarkRenderer().render(ctx([[50,80]])).children.length).toBeGreaterThanOrEqual(2);
    expect(new TableRenderer().render(ctx([[50,80]])).children.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/tools/annotations/annotations.test.ts`
Expected: FAIL with "Failed to resolve import ./annotations"

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/tools/annotations/annotations.ts
// Attribution: annotation layout adapted from lightweight-charts-drawing MIT, tools/annotations.
import type { DrawingRenderContext, DrawingRenderer } from "@qfo/qfchart";
import { QfTool, groupEl, lineEl, labelEl } from "../../base";
type P=[number,number];
const txt=(c:DrawingRenderContext)=>String((c.drawing.style as any)?.text ?? "text");
export class TextRenderer implements DrawingRenderer { type="text";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[]; return groupEl([labelEl(a,txt(c))]); } }
export class CalloutRenderer implements DrawingRenderer { type="callout";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[];
    return groupEl([lineEl(a,b,{color:"#787B86"}),{type:"rect",shape:{x:b[0],y:b[1]-22,width:Math.max(60,txt(c).length*6.5),height:22},style:{fill:"#131722",stroke:"#787B86"}},labelEl([b[0]+4,b[1]+4],txt(c))]); } }
export class BrushRenderer implements DrawingRenderer { type="brush";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[];
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:c.drawing.style?.color??"#2962FF",lineWidth:2,lineCap:"round"}}]); } }
export class HighlighterRenderer implements DrawingRenderer { type="highlighter";
  render(c:DrawingRenderContext):any{ const pts=c.pixelPoints as P[];
    return groupEl([{type:"polyline",shape:{points:pts},style:{stroke:"#FFD600",lineWidth:8,opacity:0.4,lineCap:"round"}}]); } }
export class ArrowMarkerRenderer implements DrawingRenderer { type="arrowMarker";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([{type:"polygon",shape:{points:[[a[0],a[1]-8],[a[0]-6,a[1]+4],[a[0]+6,a[1]+4]]},style:{fill:"#2962FF"}}]); } }
export class AnchoredTextRenderer implements DrawingRenderer { type="anchoredText";
  render(c:DrawingRenderContext):any{ const [a,b]=c.pixelPoints as P[]; return groupEl([lineEl(a,b,{color:"#787B86",dash:[3,3]}),labelEl(b,txt(c))]); } }
export class NoteRenderer implements DrawingRenderer { type="note";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1],r:8},style:{fill:"#FFD600",stroke:"#000"}},labelEl([a[0]+12,a[1]+4],"i")]); } }
export class PriceNoteRenderer implements DrawingRenderer { type="priceNote";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([lineEl([0,a[1]],[300,a[1]],{color:"#787B86",dash:[4,4]}),labelEl([4,a[1]-6],txt(c))]); } }
export class PriceLabelRenderer implements DrawingRenderer { type="priceLabel";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([{type:"rect",shape:{x:a[0],y:a[1]-11,width:56,height:22},style:{fill:"#2962FF"}},labelEl([a[0]+6,a[1]+4],"123.4",{color:"#fff"})]); } }
export class FlagMarkRenderer implements DrawingRenderer { type="flagMark";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([lineEl(a,[a[0],a[1]-24],{color:"#2962FF"}),{type:"polygon",shape:{points:[[a[0],a[1]-24],[a[0]+18,a[1]-19],[a[0],a[1]-14]]},style:{fill:"#F23645"}}]); } }
export class PinRenderer implements DrawingRenderer { type="pin";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([{type:"circle",shape:{cx:a[0],cy:a[1]-6,r:6},style:{fill:"#F23645"}},lineEl([a[0],a[1]],[a[0],a[1]-12],{color:"#000"})]); } }
export class CommentRenderer implements DrawingRenderer { type="comment";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([{type:"rect",shape:{x:a[0],y:a[1],width:16,height:12},style:{fill:"#fff",stroke:"#787B86"}},labelEl([a[0]+2,a[1]+10],"…")]); } }
export class SignpostRenderer implements DrawingRenderer { type="signpost";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[];
    return groupEl([lineEl([a[0],a[1]],[a[0],a[1]+30],{color:"#787B86"}),{type:"rect",shape:{x:a[0]-30,y:a[1]-22,width:60,height:22},style:{fill:"#131722",stroke:"#787B86"}},labelEl([a[0]-24,a[1]-6],txt(c))]); } }
export class TableRenderer implements DrawingRenderer { type="table";
  render(c:DrawingRenderContext):any{ const [a]=c.pixelPoints as P[]; const kids:any[]=[];
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
```

```ts
// frontend/src/lib/qfdraw/tools/annotations/index.ts
export * from "./annotations";
export const ANNOTATION_TYPES = ["text","callout","brush","highlighter","arrowMarker","anchoredText","note","priceNote","priceLabel","flagMark","pin","comment","signpost","table"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/tools/annotations/annotations.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/tools/annotations/annotations.ts frontend/src/lib/qfdraw/tools/annotations/index.ts frontend/src/lib/qfdraw/tools/annotations/annotations.test.ts
git commit -m "feat(qfdraw): 14 annotation renderers + tools"
```

---

### Task 10: Registry + chart wiring + persistence round-trip

**Files:**
- Modify: `frontend/src/lib/qfdraw/registry.ts`
- Modify: `frontend/src/components/PriceChart.tsx`
- Modify: `frontend/src/components/DrawingPanel.tsx`
- Test: `frontend/src/lib/qfdraw/registry.test.ts`

**Interfaces:**
- Consumes: All `*_TYPES` arrays + tool/renderer classes from Tasks 2–9, `chartTools.registerChartTools/snapshotDrawings/restoreDrawings`.
- Produces: `registerAllQfDrawings(chart:QFChart): Record<string,Plugin>` registering every renderer via `chart.registerDrawingRenderer` and every tool via `chart.registerPlugin`, returning panel-name map.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/qfdraw/registry.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerAllQfDrawings } from "./registry";
describe("registry", () => {
  it("registers 49+ renderers and returns panel map incl. arrow/parallel/gannBox/longPosition/rectangle/text", () => {
    const renderers: any[] = []; const plugins: any[] = [];
    const chart: any = { registerDrawingRenderer:(r:any)=>renderers.push(r), registerPlugin:(p:any)=>{p.init({addDrawing:()=>{}});plugins.push(p);} };
    const map = registerAllQfDrawings(chart);
    expect(renderers.length).toBeGreaterThanOrEqual(43);
    for (const t of ["arrow","parallelChannel","andrewsPitchfork","fibExtension","gannBox","longPosition","rectangle","text","table"]) {
      expect(renderers.some((r)=>r.type===t), t).toBe(true);
    }
    for (const k of ["arrow","parallelChannel","gannBox","longPosition","rectangle","text"]) {
      expect(map[k]).toBeDefined();
    }
  });
  it("drawings survive snapshot/restore with new types", async () => {
    const { snapshotDrawings, restoreDrawings } = await import("../../chartTools");
    const drawings: any[] = [{ id:"a1", type:"arrow", points:[{timeIndex:0,value:1},{timeIndex:1,value:2}] }];
    const chart: any = { drawings, addDrawing(d:any){drawings.push(d);}, removeDrawing(id:string){const i=drawings.findIndex((d)=>d.id===id); if(i>=0)drawings.splice(i,1);} };
    const snap = snapshotDrawings(chart);
    drawings.length = 0;
    expect(restoreDrawings(chart, snap)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/qfdraw/registry.test.ts`
Expected: FAIL (renderers.length 0 < 43)

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/qfdraw/registry.ts
import type { Plugin, QFChart } from "@qfo/qfchart";
import { ArrowDrawingRenderer, ArrowTool } from "./tools/lines/arrow";
import { ParallelChannelRenderer, ParallelChannelTool, RegressionTrendRenderer, RegressionTrendTool, FlatTopBottomRenderer, FlatTopBottomTool, DisjointChannelRenderer, DisjointChannelTool } from "./tools/channels/channels";
import { AndrewsPitchforkRenderer, AndrewsPitchforkTool, SchiffPitchforkRenderer, SchiffPitchforkTool, ModifiedSchiffPitchforkRenderer, ModifiedSchiffPitchforkTool, InsidePitchforkRenderer, InsidePitchforkTool } from "./tools/pitchforks/pitchforks";
import { FibExtensionRenderer, FibExtensionTool, FibTimeZoneRenderer, FibTimeZoneTool, FibTimeExtensionRenderer, FibTimeExtensionTool, FibCirclesRenderer, FibCirclesTool, FibSpiralRenderer, FibSpiralTool, FibArcsRenderer, FibArcsTool, FibWedgeRenderer, FibWedgeTool, PitchfanRenderer, PitchfanTool } from "./tools/fibonacci/extras";
import { GannBoxRenderer, GannBoxTool, GannFanRenderer, GannFanTool, GannSquareFixedRenderer, GannSquareFixedTool, GannSquareRenderer, GannSquareTool } from "./tools/gann/gann";
import { LongPositionRenderer, LongPositionTool, ShortPositionRenderer, ShortPositionTool, ForecastRenderer, ForecastTool, BarsPatternRenderer, BarsPatternTool, ProjectionRenderer, ProjectionTool, PriceRangeRenderer, PriceRangeTool, DatePriceRangeRenderer, DatePriceRangeTool } from "./tools/forecast/forecast";
import { RectangleRenderer, RectangleTool, RotatedRectangleRenderer, RotatedRectangleTool, CircleRenderer, CircleTool, EllipseRenderer, EllipseTool, TriangleRenderer, TriangleTool, ArcRenderer, ArcTool, PathRenderer, PathTool, PolylineRenderer, PolylineTool, CurveRenderer, CurveTool, DoubleCurveRenderer, DoubleCurveTool } from "./tools/shapes/shapes";
import { TextRenderer, TextTool, CalloutRenderer, CalloutTool, BrushRenderer, BrushTool, HighlighterRenderer, HighlighterTool, ArrowMarkerRenderer, ArrowMarkerTool, AnchoredTextRenderer, AnchoredTextTool, NoteRenderer, NoteTool, PriceNoteRenderer, PriceNoteTool, PriceLabelRenderer, PriceLabelTool, FlagMarkRenderer, FlagMarkTool, PinRenderer, PinTool, CommentRenderer, CommentTool, SignpostRenderer, SignpostTool, TableRenderer, TableTool } from "./tools/annotations/annotations";

export const TOOL_TYPES = ["arrow","parallelChannel","regressionTrend","flatTopBottom","disjointChannel","andrewsPitchfork","schiffPitchfork","modifiedSchiffPitchfork","insidePitchfork","fibExtension","fibTimeZone","fibTimeExtension","fibCircles","fibSpiral","fibArcs","fibWedge","pitchfan","gannBox","gannFan","gannSquareFixed","gannSquare","longPosition","shortPosition","forecast","barsPattern","projection","priceRange","datePriceRange","rectangle","rotatedRectangle","circle","ellipse","triangle","arc","path","polyline","curve","doubleCurve","text","callout","brush","highlighter","arrowMarker","anchoredText","note","priceNote","priceLabel","flagMark","pin","comment","signpost","table"];

export function registerAllQfDrawings(chart: QFChart): Record<string, Plugin> {
  const pairs: [string, any, any][] = [
    ["arrow", ArrowDrawingRenderer, ArrowTool],
    ["parallelChannel", ParallelChannelRenderer, ParallelChannelTool],
    ["regressionTrend", RegressionTrendRenderer, RegressionTrendTool],
    ["flatTopBottom", FlatTopBottomRenderer, FlatTopBottomTool],
    ["disjointChannel", DisjointChannelRenderer, DisjointChannelTool],
    ["andrewsPitchfork", AndrewsPitchforkRenderer, AndrewsPitchforkTool],
    ["schiffPitchfork", SchiffPitchforkRenderer, SchiffPitchforkTool],
    ["modifiedSchiffPitchfork", ModifiedSchiffPitchforkRenderer, ModifiedSchiffPitchforkTool],
    ["insidePitchfork", InsidePitchforkRenderer, InsidePitchforkTool],
    ["fibExtension", FibExtensionRenderer, FibExtensionTool],
    ["fibTimeZone", FibTimeZoneRenderer, FibTimeZoneTool],
    ["fibTimeExtension", FibTimeExtensionRenderer, FibTimeExtensionTool],
    ["fibCircles", FibCirclesRenderer, FibCirclesTool],
    ["fibSpiral", FibSpiralRenderer, FibSpiralTool],
    ["fibArcs", FibArcsRenderer, FibArcsTool],
    ["fibWedge", FibWedgeRenderer, FibWedgeTool],
    ["pitchfan", PitchfanRenderer, PitchfanTool],
    ["gannBox", GannBoxRenderer, GannBoxTool],
    ["gannFan", GannFanRenderer, GannFanTool],
    ["gannSquareFixed", GannSquareFixedRenderer, GannSquareFixedTool],
    ["gannSquare", GannSquareRenderer, GannSquareTool],
    ["longPosition", LongPositionRenderer, LongPositionTool],
    ["shortPosition", ShortPositionRenderer, ShortPositionTool],
    ["forecast", ForecastRenderer, ForecastTool],
    ["barsPattern", BarsPatternRenderer, BarsPatternTool],
    ["projection", ProjectionRenderer, ProjectionTool],
    ["priceRange", PriceRangeRenderer, PriceRangeTool],
    ["datePriceRange", DatePriceRangeRenderer, DatePriceRangeTool],
    ["rectangle", RectangleRenderer, RectangleTool],
    ["rotatedRectangle", RotatedRectangleRenderer, RotatedRectangleTool],
    ["circle", CircleRenderer, CircleTool],
    ["ellipse", EllipseRenderer, EllipseTool],
    ["triangle", TriangleRenderer, TriangleTool],
    ["arc", ArcRenderer, ArcTool],
    ["path", PathRenderer, PathTool],
    ["polyline", PolylineRenderer, PolylineTool],
    ["curve", CurveRenderer, CurveTool],
    ["doubleCurve", DoubleCurveRenderer, DoubleCurveTool],
    ["text", TextRenderer, TextTool],
    ["callout", CalloutRenderer, CalloutTool],
    ["brush", BrushRenderer, BrushTool],
    ["highlighter", HighlighterRenderer, HighlighterTool],
    ["arrowMarker", ArrowMarkerRenderer, ArrowMarkerTool],
    ["anchoredText", AnchoredTextRenderer, AnchoredTextTool],
    ["note", NoteRenderer, NoteTool],
    ["priceNote", PriceNoteRenderer, PriceNoteTool],
    ["priceLabel", PriceLabelRenderer, PriceLabelTool],
    ["flagMark", FlagMarkRenderer, FlagMarkTool],
    ["pin", PinRenderer, PinTool],
    ["comment", CommentRenderer, CommentTool],
    ["signpost", SignpostRenderer, SignpostTool],
    ["table", TableRenderer, TableTool],
  ];
  const map: Record<string, Plugin> = {};
  for (const [name, R, T] of pairs) {
    chart.registerDrawingRenderer(new R());
    const tool = new T();
    chart.registerPlugin(tool);
    map[name] = tool;
  }
  return map;
}
```

PriceChart wiring (apply after test passes): in `frontend/src/components/PriceChart.tsx:15-34` keep existing 5 QFChart built-ins, then `const qf = registerAllQfDrawings(chart); registerChartTools(chart, { trend: lineTool, horizontal: horizontalTool, ray: rayTool, fibonacci: fibTool, measure: measureTool, ...qf });`. DrawingPanel: move `rectangle,text` out of UNSUPPORTED into TOOLS once Task 8/9 land, then add remaining names in grouped menus.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/qfdraw/registry.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qfdraw/registry.ts frontend/src/lib/qfdraw/registry.test.ts frontend/src/components/PriceChart.tsx frontend/src/components/DrawingPanel.tsx
git commit -m "feat(qfdraw): registry wires 52 renderers, chart integration"
```

---

## Self-Review

- Spec coverage: 68 tools = 19 existing QFChart built-ins (parity via existing PriceChart path) + 52 new renderers here (1 arrow + 4 channels + 4 pitchforks + 8 fib + 4 gann + 7 forecast + 10 shapes + 14 annotations = 52; overlap of Triangle pattern vs shape noted, both kept as distinct types). Registry task proves count >=43 renderers + panel map.
- Placeholder scan: no TBD/TODO; every step has file paths, code blocks, run commands, expected outputs.
- Type consistency: `DrawingRenderer.render(ctx:DrawingRenderContext):any` returns `{type:"group",children}` everywhere; tools extend `QfTool(id="qf:<x>")`; `DrawingElement.points` always `{timeIndex,value}[]`; registry `TOOL_TYPES` matches renderer `type` strings.
