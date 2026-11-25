// frontend/src/lib/axisZoom.ts
// QFChart ships an X dataZoom (wheel + drag) but leaves the price axis on
// auto-scale. This controller adds TradingView-style Y zoom: wheel over the
// price scale (or Shift+wheel anywhere), drag the price scale, double-click
// it to reset. The manual scale is re-applied after QFChart rebuilds its
// option, so it survives range/data changes.
import type { QFChart } from "@qfo/qfchart";

export interface ZoomRange {
  min: number;
  max: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Scale a value range around an anchor, keeping the cursor value fixed. */
export function zoomRange(range: ZoomRange, factor: number, anchor: number): ZoomRange {
  const span = range.max - range.min;
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(factor) || factor <= 0) return range;
  const ratio = span === 0 ? 0.5 : Math.min(1, Math.max(0, (anchor - range.min) / span));
  const nextSpan = span * factor;
  const min = anchor - ratio * nextSpan;
  return { min, max: min + nextSpan };
}

function gridRect(ec: any): Rect | null {
  try {
    const grid = ec?.getModel?.()?.getComponent?.("grid", 0);
    const rect = grid?.coordinateSystem?.getRect?.();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  } catch {
    return null;
  }
}

function valueAt(ec: any, rect: Rect, y: number): number | null {
  try {
    const point = ec?.convertFromPixel?.({ gridIndex: 0 }, [rect.x + rect.width / 2, y]);
    if (Array.isArray(point) && typeof point[1] === "number" && Number.isFinite(point[1])) {
      return point[1];
    }
  } catch {
    // Outside the rendered grid or before first paint.
  }
  return null;
}

function currentRange(ec: any, rect: Rect): ZoomRange | null {
  const top = valueAt(ec, rect, rect.y);
  const bottom = valueAt(ec, rect, rect.y + rect.height);
  if (top === null || bottom === null || top === bottom) return null;
  return { min: Math.min(top, bottom), max: Math.max(top, bottom) };
}

export function attachAxisZoom(chart: QFChart): () => void {
  const ec = chart.getChart?.() as any;
  const dom = ec?.getDom?.() as HTMLElement | undefined;
  if (!ec || !dom) return () => {};

  let state: ZoomRange | null = null;
  let drag:
    | { startY: number; range: ZoomRange; anchor: number }
    | null = null;

  const apply = (range: ZoomRange) => {
    try {
      ec.setOption({ yAxis: [{ min: range.min, max: range.max }] });
    } catch {
      // A disposed ECharts instance after a chart rebuild.
    }
  };

  const localPoint = (e: MouseEvent | WheelEvent) => {
    const box = dom.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top, width: box.width, height: box.height };
  };

  const overPriceScale = (rect: Rect, localX: number) =>
    localX >= rect.x + rect.width - 1;

  const onWheel = (e: WheelEvent) => {
    const rect = gridRect(ec);
    if (!rect) return;
    const local = localPoint(e);
    if (!overPriceScale(rect, local.x) && !e.shiftKey) return;
    const anchor = valueAt(ec, rect, local.y);
    if (anchor === null) return;
    const base = state ?? currentRange(ec, rect);
    if (!base) return;
    const factor = Math.exp((e.deltaY || 0) * 0.0015);
    if (!Number.isFinite(factor) || factor === 1) return;
    state = zoomRange(base, factor, anchor);
    apply(state);
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerDown = (e: PointerEvent | MouseEvent) => {
    if (e.button !== 0) return;
    const rect = gridRect(ec);
    if (!rect) return;
    const local = localPoint(e);
    if (!overPriceScale(rect, local.x)) return;
    const anchor = valueAt(ec, rect, local.y);
    const base = state ?? currentRange(ec, rect);
    if (anchor === null || !base) return;
    drag = { startY: e.clientY, range: base, anchor };
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const factor = Math.exp((e.clientY - drag.startY) * 0.005);
    state = zoomRange(drag.range, factor, drag.anchor);
    apply(state);
    e.preventDefault();
  };

  const onPointerUp = () => {
    drag = null;
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
  };

  const onDblClick = (e: MouseEvent) => {
    const rect = gridRect(ec);
    if (!rect) return;
    const local = localPoint(e);
    if (!overPriceScale(rect, local.x)) return;
    state = null;
    e.preventDefault();
    e.stopPropagation();
    const raw = chart as unknown as { render?: () => void };
    if (typeof raw.render === "function") raw.render();
    else {
      try {
        ec.setOption({ yAxis: [{ min: null, max: null }] });
      } catch {
        // Disposed chart.
      }
    }
  };

  const onChartUpdated = () => {
    if (!state) return;
    const current = ec.getOption?.()?.yAxis?.[0];
    if (current?.min !== state.min || current?.max !== state.max) apply(state);
  };

  dom.addEventListener("wheel", onWheel, { passive: false, capture: true });
  dom.addEventListener("pointerdown", onPointerDown, { capture: true });
  dom.addEventListener("dblclick", onDblClick, { capture: true });
  chart.events?.on?.("chart:updated", onChartUpdated);

  return () => {
    dom.removeEventListener("wheel", onWheel, { capture: true });
    dom.removeEventListener("pointerdown", onPointerDown, { capture: true });
    dom.removeEventListener("dblclick", onDblClick, { capture: true });
    chart.events?.off?.("chart:updated", onChartUpdated);
    onPointerUp();
  };
}
