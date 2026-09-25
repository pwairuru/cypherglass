import type { DrawingElement, Plugin, QFChart } from "@qfo/qfchart";

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
  const tool = toolRegistry.get(chart)?.get(name);
  if (!tool) return false;
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
      chart.addDrawing(entry as DrawingElement);
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
