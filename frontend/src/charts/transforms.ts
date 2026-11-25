import type { ChartPoint, TransformId } from "./types";

function firstValue(points: ChartPoint[]): { value: number; index: number } | null {
  for (let i = 0; i < points.length; i += 1) {
    const v = points[i].v;
    // A zero base cannot be normalised; skip leading zeros (early BTC price
    // history) and anchor on the first real positive value.
    if (v !== null && Number.isFinite(v) && v !== 0) return { value: v, index: i };
  }
  return null;
}

function pct(points: ChartPoint[]): ChartPoint[] {
  const anchor = firstValue(points);
  if (!anchor) return points.map((p) => ({ ...p, v: null }));
  return points.map((p, i) => ({
    t: p.t,
    v: p.v === null || i < anchor.index ? null : (p.v / anchor.value - 1) * 100,
  }));
}

function index(points: ChartPoint[]): ChartPoint[] {
  const anchor = firstValue(points);
  if (!anchor) return points.map((p) => ({ ...p, v: null }));
  return points.map((p, i) => ({
    t: p.t,
    v: p.v === null || i < anchor.index ? null : (p.v / anchor.value) * 100,
  }));
}

function zscore(points: ChartPoint[]): ChartPoint[] {
  const values = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (values.length === 0) return points.map((p) => ({ ...p }));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return points.map((p) => ({
    t: p.t,
    v: p.v === null ? null : std === 0 ? 0 : (p.v - mean) / std,
  }));
}

function sma(points: ChartPoint[], window: number): ChartPoint[] {
  const out: ChartPoint[] = [];
  const values: number[] = [];
  for (const p of points) {
    if (p.v === null) {
      out.push({ t: p.t, v: null });
      continue;
    }
    values.push(p.v);
    if (values.length > window) values.shift();
    out.push({
      t: p.t,
      v:
        values.length === window
          ? values.reduce((a, b) => a + b, 0) / window
          : null,
    });
  }
  return out;
}

/** Display-time transforms. Server transforms are authoritative for API
 *  responses; this module powers the legend toggle and local previews. */
export function applyTransform(
  points: ChartPoint[],
  transform: TransformId,
  price?: ChartPoint[],
): ChartPoint[] {
  switch (transform) {
    case "raw":
      return points.map((p) => ({ ...p }));
    case "pct":
      return pct(points);
    case "index":
      return index(points);
    case "zscore":
      return zscore(points);
    case "sma7":
      return sma(points, 7);
    case "sma30":
      return sma(points, 30);
    case "btc": {
      if (!price || price.length === 0) return points.map((p) => ({ ...p }));
      const byDate = new Map(price.map((p) => [p.t, p.v]));
      return points.map((p) => {
        const priceValue = byDate.get(p.t);
        return {
          t: p.t,
          v:
            p.v === null || priceValue === null || priceValue === undefined || priceValue === 0
              ? null
              : p.v / priceValue,
        };
      });
    }
    default:
      return points.map((p) => ({ ...p }));
  }
}
