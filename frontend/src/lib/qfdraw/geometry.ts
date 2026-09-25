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
