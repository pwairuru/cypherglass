// frontend/src/components/DrawingStyleToolbar.tsx
// Floating TradingView/CMC-style toolbar for the selected drawing: colour,
// width, dash, duplicate, delete and "save as default". Driven by QFChart's
// drawing:selected / drawing:deselected / drawing:deleted / chart:updated
// events, and positioned next to the drawing's midpoint in chart pixels.
import { useEffect, useState, type RefObject } from "react";
import { Check, Copy, Trash2, X } from "lucide-react";
import type { QFChart } from "@qfo/qfchart";
import {
  clearChartDrawingSelection,
  duplicateChartDrawing,
  updateDrawingStyle,
  type DrawingStylePatch,
} from "../lib/chartTools";
import {
  DRAWING_COLORS,
  DRAWING_LINE_STYLES,
  DRAWING_WIDTHS,
  humanizeDrawingType,
  normalizeDrawingStyle,
  saveDefaultDrawingStyle,
  type DrawingLineStyle,
  type QfDrawingStyle,
} from "../lib/qfdraw/style";

const TYPE_LABELS: Record<string, string> = {
  line: "Trend line",
  "horizontal-line": "Horizontal line",
  "vertical-line": "Vertical line",
  ray: "Ray",
  "horizontal-ray": "Horizontal ray",
  "vertical-ray": "Vertical ray",
  "extended-line": "Extended line",
  arrow: "Arrow",
  parallelChannel: "Parallel channel",
  regressionTrend: "Regression trend",
  flatTopBottom: "Flat top/bottom",
  disjointChannel: "Disjoint channel",
  rectangle: "Rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  text: "Text",
  callout: "Callout",
  brush: "Brush",
  highlighter: "Highlighter",
  note: "Note",
  priceNote: "Price note",
  priceLabel: "Price label",
};

const POPUP_WIDTH = 268;
const POPUP_HEIGHT = 150;
const DASH_PREVIEW: Record<DrawingLineStyle, string | undefined> = {
  solid: undefined,
  dashed: "7 4",
  dotted: "2 3",
};

interface Position {
  left: number;
  top: number;
}

export default function DrawingStyleToolbar({
  chart,
  containerRef,
  onChange,
}: {
  chart: QFChart | null;
  containerRef: RefObject<HTMLElement | null>;
  onChange?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [version, setVersion] = useState(0);
  const [savedTick, setSavedTick] = useState(false);

  const close = () => {
    if (chart) clearChartDrawingSelection(chart);
    setSelectedId(null);
  };

  // A rebuilt chart (range/mode switch) restores the same drawing ids; do not
  // keep editing a drawing that is no longer selected on the new instance.
  useEffect(() => {
    setSelectedId(null);
    setPosition(null);
  }, [chart]);

  // Subscribe to chart selection/lifecycle events.
  useEffect(() => {
    if (!chart?.events) return;
    const onSelected = (payload?: { id?: string }) => {
      if (payload?.id) {
        setSelectedId(payload.id);
        setVersion((v) => v + 1);
      }
    };
    const onDeselected = () => setSelectedId(null);
    const onDeleted = (payload?: { id?: string }) => {
      setSelectedId((current) => (payload?.id && payload.id === current ? null : current));
    };
    const onUpdated = () => setVersion((v) => v + 1);
    chart.events.on("drawing:selected", onSelected);
    chart.events.on("drawing:deselected", onDeselected);
    chart.events.on("drawing:deleted", onDeleted);
    chart.events.on("chart:updated", onUpdated);
    return () => {
      chart.events.off?.("drawing:selected", onSelected);
      chart.events.off?.("drawing:deselected", onDeselected);
      chart.events.off?.("drawing:deleted", onDeleted);
      chart.events.off?.("chart:updated", onUpdated);
    };
  }, [chart]);

  // Close on Escape; keep the chart selection itself until the user clicks
  // the background (matches TradingView).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // close() reads the current chart/selection; both are reflected here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, chart]);

  // Reposition after pan/zoom/resize and after style edits.
  useEffect(() => {
    if (!selectedId) return;
    const onResize = () => setVersion((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selectedId]);

  const drawing = selectedId && chart ? chart.getDrawing(selectedId) : undefined;
  const style = drawing
    ? normalizeDrawingStyle(drawing.type, (drawing.style ?? {}) as QfDrawingStyle)
    : null;

  useEffect(() => {
    if (!chart || !selectedId || !drawing || !containerRef.current) {
      setPosition(null);
      return;
    }
    const pixels = drawing.points
      .map((p) =>
        chart.coordinateConversion.dataToPixel({
          ...p,
          paneIndex: p.paneIndex ?? drawing.paneIndex ?? 0,
        }),
      )
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pixels.length === 0) {
      setPosition(null);
      return;
    }
    const mid = pixels.reduce(
      (acc, p) => ({ x: acc.x + p.x / pixels.length, y: acc.y + p.y / pixels.length }),
      { x: 0, y: 0 },
    );
    const host = containerRef.current.getBoundingClientRect();
    const dom = chart.getChart?.()?.getDom?.() as HTMLElement | undefined;
    const canvas = dom?.getBoundingClientRect();
    const x = (canvas ? canvas.left - host.left : 0) + mid.x;
    const y = (canvas ? canvas.top - host.top : 0) + mid.y;
    const hostWidth = host.width || 600;
    const hostHeight = host.height || 400;
    const maxLeft = Math.max(8, hostWidth - POPUP_WIDTH - 8);
    const maxTop = Math.max(8, hostHeight - POPUP_HEIGHT - 8);
    const left = Math.min(Math.max(8, x - POPUP_WIDTH / 2), maxLeft);
    let top = y - POPUP_HEIGHT - 12;
    if (top < 8) top = Math.min(y + 18, maxTop);
    setPosition({ left, top: Math.min(Math.max(8, top), maxTop) });
  }, [chart, containerRef, drawing, selectedId, version]);

  if (!chart || !selectedId || !drawing || !style || !position) return null;

  const apply = (patch: DrawingStylePatch) => {
    const next = updateDrawingStyle(chart, selectedId, patch);
    if (!next) return;
    setVersion((v) => v + 1);
    onChange?.();
  };

  const label = TYPE_LABELS[drawing.type] ?? humanizeDrawingType(drawing.type);

  return (
    <div
      className="drawing-style-toolbar"
      role="dialog"
      aria-label="Drawing style"
      style={{ left: position.left, top: position.top }}
    >
      <div className="dst-head">
        <span className="dst-title">{label}</span>
        <button
          type="button"
          className="dst-close"
          aria-label="Close drawing style"
          title="Close"
          onClick={close}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="dst-colors" role="group" aria-label="Drawing colour">
        {DRAWING_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="dst-swatch"
            style={{ background: color }}
            aria-label={`Color ${color}`}
            title={color}
            aria-pressed={style.color?.toLowerCase() === color.toLowerCase()}
            data-color={color}
            onClick={() => apply({ color })}
          />
        ))}
      </div>

      <div className="dst-row">
        <span className="dst-label">Width</span>
        <div className="dst-widths" role="group" aria-label="Line width">
          {DRAWING_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              aria-label={`Width ${width}`}
              title={`${width}px`}
              aria-pressed={style.lineWidth === width}
              onClick={() => apply({ lineWidth: width })}
            >
              <span className="dst-line-preview" style={{ height: Math.max(1, width) }} />
              <span>{width}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="dst-row">
        <span className="dst-label">Style</span>
        <div className="dst-styles" role="group" aria-label="Line style">
          {DRAWING_LINE_STYLES.map((lineStyle) => (
            <button
              key={lineStyle}
              type="button"
              aria-label={`Line style ${lineStyle}`}
              title={lineStyle}
              aria-pressed={style.lineStyle === lineStyle}
              onClick={() => apply({ lineStyle })}
            >
              <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="25"
                  y2="4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={DASH_PREVIEW[lineStyle]}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="dst-actions">
        <button
          type="button"
          aria-label="Save style as default"
          title="Save as default for new drawings"
          onClick={() => {
            saveDefaultDrawingStyle(style);
            setSavedTick(true);
            window.setTimeout(() => setSavedTick(false), 1200);
          }}
        >
          {savedTick ? <Check size={14} aria-hidden="true" /> : <span className="dst-star">★</span>}
        </button>
        <button
          type="button"
          aria-label="Duplicate drawing"
          title="Duplicate"
          onClick={() => {
            const id = duplicateChartDrawing(chart, selectedId);
            if (id) onChange?.();
          }}
        >
          <Copy size={14} aria-hidden="true" />
        </button>
        <span className="dst-spacer" />
        <button
          type="button"
          className="dst-danger"
          aria-label="Delete drawing"
          title="Delete (Del)"
          onClick={() => {
            chart.removeDrawing(selectedId);
            clearChartDrawingSelection(chart);
            setSelectedId(null);
            onChange?.();
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
