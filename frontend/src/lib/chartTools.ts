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

export function restoreDrawings(chart: QFChart, snapshot: unknown): number {
  if (!Array.isArray(snapshot)) return 0;
  let restored = 0;
  for (const entry of snapshot) {
    try {
      chart.addDrawing(entry as DrawingElement);
      restored += 1;
    } catch {
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
  return ids.length;
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
