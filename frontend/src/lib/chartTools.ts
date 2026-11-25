import type { DrawingElement, Plugin, QFChart } from "@qfo/qfchart";
import {
  normalizeDrawingStyle,
  type DrawingLineStyle,
  type QfDrawingStyle,
} from "./qfdraw/style";

export interface DrawingStylePatch {
  color?: string;
  lineWidth?: number;
  lineStyle?: DrawingLineStyle;
  [key: string]: unknown;
}

// Maps DrawingPanel tool names to the plugin instance registered on a chart.
// PriceChart/OnchainChart register their plugins here via registerChartTools;
// Dashboard activates them via activateChartTool on DrawingPanel callbacks.
const toolRegistry = new WeakMap<QFChart, Map<string, Plugin>>();

export function registerChartTools(
  chart: QFChart,
  tools: Record<string, Plugin>,
): void {
  toolRegistry.set(chart, new Map(Object.entries(tools)));
}

export function activateChartTool(chart: QFChart, name: string): boolean {
  const tools = toolRegistry.get(chart);
  const tool = tools?.get(name);
  if (!tools || !tool) return false;
  // QFChart core tracks the active plugin only through its own toolbar
  // (activatePlugin sets activePluginId); we activate instances directly,
  // so chart.disableTools() is a no-op for them and previously activated
  // tools would stay live, duplicating drawings on every later click
  // (seen live: 9 stray horizontal-lines from one stale tool). Deactivate
  // every other registered tool first; deactivate() on an idle tool is a
  // harmless reset (unbinds missing handlers, unlock guarded by flag).
  for (const [key, other] of tools) {
    if (key !== name) {
      try {
        other.deactivate?.();
      } catch {
        // One bad tool must not block activation of the requested one.
      }
    }
  }
  chart.disableTools?.();
  tool.activate?.();
  return true;
}

// QFChart typings expose add/remove/get(single)/update for drawings but no
// list-all API, so Clear/Undo/snapshot read the runtime `drawings` array
// (verified in qfchart.min.es.js: addDrawing pushes {id, ...}, removeDrawing
// splices by id). Guarded: unknown shapes yield empty results, never throws.
export function drawingIds(chart: QFChart): string[] {
  const raw = (chart as unknown as { drawings?: unknown }).drawings;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (d): d is { id: string } =>
        typeof d === "object" && d !== null && typeof (d as { id: unknown }).id === "string",
    )
    .map((d) => d.id);
}

export function snapshotDrawings(chart: QFChart): DrawingElement[] {
  const raw = (chart as unknown as { drawings?: unknown }).drawings;
  if (!Array.isArray(raw)) return [];
  return JSON.parse(JSON.stringify(raw)) as DrawingElement[];
}

// A snapshot entry is only restorable if it carries the fields QFChart's
// addDrawing actually persists (verified in qfchart.min.es.js:
// addDrawing(t){this.drawings.push(t),...} — full element incl. id, no regen).
function isRestorable(entry: unknown): entry is DrawingElement {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as { id?: unknown; type?: unknown; points?: unknown };
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    Array.isArray(e.points)
  );
}

export function restoreDrawings(chart: QFChart, snapshot: unknown): number {
  if (!Array.isArray(snapshot)) return 0;
  // Skip ids already on the chart: restore runs on every chart rebuild, and
  // re-pushing the same ids would pile up duplicates (addDrawing never dedupes).
  const present = new Set(drawingIds(chart));
  let restored = 0;
  for (const entry of snapshot) {
    if (!isRestorable(entry) || present.has(entry.id)) continue;
    try {
      // Drawings saved before the style toolbar keep their geometry but get
      // the current line defaults (old QFChart built-ins wrote #d1d4dc/1px).
      // Entries without any style stay untouched so round-trip snapshots are
      // byte-identical for fixtures/integrations that omit style.
      const restoredEntry = entry.style
        ? ({
            ...entry,
            style: normalizeDrawingStyle(
              entry.type,
              entry.style as QfDrawingStyle,
            ) as DrawingElement["style"],
          } as DrawingElement)
        : entry;
      chart.addDrawing(restoredEntry);
      present.add(entry.id);
      restored += 1;
    } catch {
      // Invalid per current renderer set or wrong shape: skip, count honestly.
      continue;
    }
  }
  return restored;
}

export function clearChartDrawings(chart: QFChart): number {
  const ids = drawingIds(chart);
  for (const id of ids) {
    try {
      chart.removeDrawing(id);
    } catch {
      continue;
    }
  }
  // Honest count: removals that actually left the drawings array
  // (removeDrawing is a no-op for unknown ids, never throws).
  return ids.length - drawingIds(chart).length;
}

export function undoChartDrawing(chart: QFChart): string | null {
  const ids = drawingIds(chart);
  const last = ids[ids.length - 1] ?? null;
  if (last === null) return null;
  try {
    chart.removeDrawing(last);
  } catch {
    return null;
  }
  return last;
}

/** Merge style fields into an existing drawing and re-render. The QFChart
 *  DrawingElement type only advertises color/lineWidth, but renderItem keeps
 *  the whole object, so lineStyle and future fields survive. */
export function updateDrawingStyle(
  chart: QFChart,
  id: string,
  patch: DrawingStylePatch,
): DrawingElement | null {
  const drawing = chart.getDrawing(id);
  if (!drawing) return null;
  const next = {
    ...drawing,
    style: {
      ...(drawing.style ?? {}),
      ...patch,
    },
  } as DrawingElement;
  chart.updateDrawing(next);
  return next;
}

/** Select a drawing through QFChart's own state and re-render, so the drag
 *  handles and the floating style toolbar follow the new selection. */
export function selectChartDrawing(chart: QFChart, id: string): boolean {
  if (!chart.getDrawing(id)) return false;
  const raw = chart as unknown as {
    selectedDrawingId?: string | null;
    render?: () => void;
  };
  raw.selectedDrawingId = id;
  chart.events.emit("drawing:selected", { id });
  raw.render?.();
  return true;
}

/** Clear QFChart's internal drawing selection (the same state a background
 *  click clears) without synthesising a canvas click that an armed drawing
 *  tool might consume. */
export function clearChartDrawingSelection(chart: QFChart): void {
  const raw = chart as unknown as {
    selectedDrawingId?: string | null;
    render?: () => void;
  };
  const id = raw.selectedDrawingId;
  if (typeof id !== "string") return;
  raw.selectedDrawingId = null;
  chart.events.emit("drawing:deselected", { id });
  raw.render?.();
}

/** Copy a drawing with a cumulative visible offset and select the copy so the
 *  style toolbar edits the duplicate, not the original. */
export function duplicateChartDrawing(chart: QFChart, id: string): string | null {
  const drawing = chart.getDrawing(id);
  if (!drawing) return null;
  // Count siblings of the same type: repeated duplicates step further right
  // instead of stacking on top of each other.
  const sameType = drawingIds(chart)
    .map((drawingId) => chart.getDrawing(drawingId))
    .filter((entry) => entry?.type === drawing.type).length;
  const offset = Math.max(1, sameType);
  const copyId = `${drawing.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const copy = {
    ...drawing,
    id: copyId,
    points: drawing.points.map((p) => ({ ...p, timeIndex: p.timeIndex + offset })),
    style: drawing.style ? { ...drawing.style } : undefined,
  } as DrawingElement;
  chart.addDrawing(copy);
  selectChartDrawing(chart, copyId);
  return copyId;
}
