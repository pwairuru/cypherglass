import { describe, it, expect, vi } from "vitest";
import type { DrawingElement, QFChart } from "@qfo/qfchart";
import {
  clearChartDrawings,
  drawingIds,
  restoreDrawings,
  snapshotDrawings,
  undoChartDrawing,
  registerChartTools,
  activateChartTool,
  clearChartDrawingSelection,
  duplicateChartDrawing,
  selectChartDrawing,
  updateDrawingStyle,
} from "./chartTools";

// Fake chart honoring the real QFChart drawing contract (verified in
// qfchart.min.es.js): addDrawing pushes the full element incl. id,
// removeDrawing splices by id and no-ops on unknown ids.
function fakeChartWithDrawings(initial: DrawingElement[] = []): QFChart {
  const drawings: DrawingElement[] = initial.map((d) => ({ ...d }));
  return {
    drawings,
    selectedDrawingId: null,
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    render: vi.fn(),
    addDrawing(d: DrawingElement) {
      drawings.push(d);
    },
    removeDrawing(id: string) {
      const i = drawings.findIndex((d) => d.id === id);
      if (i !== -1) drawings.splice(i, 1);
    },
    getDrawing(id: string) {
      return drawings.find((d) => d.id === id);
    },
    updateDrawing(d: DrawingElement) {
      const i = drawings.findIndex((x) => x.id === d.id);
      if (i !== -1) drawings[i] = d;
    },
  } as unknown as QFChart;
}

const d1: DrawingElement = {
  id: "line-1",
  type: "line",
  points: [
    { timeIndex: 0, value: 1 },
    { timeIndex: 1, value: 2 },
  ],
};
const d2: DrawingElement = {
  id: "fib-2",
  type: "fibonacci",
  points: [
    { timeIndex: 0, value: 1 },
    { timeIndex: 5, value: 3 },
  ],
};

describe("chartTools drawing round-trip", () => {
  it("snapshot → clear → restore returns the same drawings (reload-persist)", () => {
    const chart = fakeChartWithDrawings([d1, d2]);
    const snapshot = snapshotDrawings(chart);
    expect(clearChartDrawings(chart)).toBe(2);
    expect(drawingIds(chart)).toEqual([]);
    expect(restoreDrawings(chart, snapshot)).toBe(2);
    expect(drawingIds(chart)).toEqual(["line-1", "fib-2"]);
    expect(snapshotDrawings(chart)).toEqual(snapshot);
  });

  it("restore skips invalid entries and duplicate ids without lying about count", () => {
    const chart = fakeChartWithDrawings([d1]);
    const restored = restoreDrawings(chart, [
      d2,
      { id: 42, type: "line", points: [] },
      { type: "line", points: [] },
      d1, // duplicate
      "garbage",
    ]);
    expect(restored).toBe(1);
    expect(drawingIds(chart)).toEqual(["line-1", "fib-2"]);
    // Second restore of the same snapshot is a no-op (rebuild-safe).
    expect(restoreDrawings(chart, snapshotDrawings(chart))).toBe(0);
    expect(drawingIds(chart)).toHaveLength(2);
  });

  it("restore rejects non-array snapshots", () => {
    expect(restoreDrawings(fakeChartWithDrawings(), null)).toBe(0);
    expect(restoreDrawings(fakeChartWithDrawings(), { state: [] })).toBe(0);
  });

  it("migrates legacy line styles on restore but keeps user colours", () => {
    const chart = fakeChartWithDrawings();
    const legacy: DrawingElement = {
      id: "old-line",
      type: "line",
      points: [
        { timeIndex: 0, value: 1 },
        { timeIndex: 1, value: 2 },
      ],
      style: { color: "#d1d4dc", lineWidth: 1 },
    };
    const custom: DrawingElement = {
      ...legacy,
      id: "custom-line",
      style: { color: "#F23645", lineWidth: 1 },
    };
    expect(restoreDrawings(chart, [legacy, custom])).toBe(2);
    expect(chart.getDrawing("old-line")?.style).toMatchObject({
      color: "#2962FF",
      lineWidth: 2,
      lineStyle: "solid",
    });
    expect(chart.getDrawing("custom-line")?.style).toMatchObject({
      color: "#F23645",
      lineWidth: 1,
      lineStyle: "solid",
    });
  });

  it("undo removes the last drawing and returns its id", () => {
    const chart = fakeChartWithDrawings([d1, d2]);
    expect(undoChartDrawing(chart)).toBe("fib-2");
    expect(drawingIds(chart)).toEqual(["line-1"]);
    expect(undoChartDrawing(chart)).toBe("line-1");
    expect(undoChartDrawing(chart)).toBeNull();
  });
});

function fakeChart() {
  return { disableTools: vi.fn() } as any;
}

function fakeTool(id: string) {
  return { id, init: vi.fn(), activate: vi.fn(), deactivate: vi.fn() };
}

describe("drawing style editing", () => {
  it("patches colour, width and line style on the selected drawing", () => {
    const chart = fakeChartWithDrawings([{ ...d1, style: { color: "#d1d4dc", lineWidth: 1 } }]);
    const next = updateDrawingStyle(chart, "line-1", {
      color: "#F23645",
      lineWidth: 3,
      lineStyle: "dashed",
    });
    expect(next?.style).toMatchObject({
      color: "#F23645",
      lineWidth: 3,
      lineStyle: "dashed",
    });
    expect(chart.getDrawing("line-1")?.style).toMatchObject({
      color: "#F23645",
      lineWidth: 3,
      lineStyle: "dashed",
    });
  });

  it("returns null for an unknown drawing id", () => {
    const chart = fakeChartWithDrawings([d1]);
    expect(updateDrawingStyle(chart, "nope", { color: "#089981" })).toBeNull();
    expect(drawingIds(chart)).toEqual(["line-1"]);
  });

  it("duplicates a drawing with a new id, cumulative offset and a copied style", () => {
    const chart = fakeChartWithDrawings([
      { ...d1, style: { color: "#9C27B0", lineWidth: 2 } },
    ]);
    const id = duplicateChartDrawing(chart, "line-1");
    expect(id).not.toBeNull();
    expect(id).not.toBe("line-1");
    const copy = chart.getDrawing(id!);
    expect(copy).toMatchObject({ type: "line", style: { color: "#9C27B0", lineWidth: 2 } });
    expect(copy?.points.map((p) => p.timeIndex)).toEqual([1, 2]);
    expect(drawingIds(chart)).toEqual(["line-1", id]);
    expect((chart as any).selectedDrawingId).toBe(id);
    expect(chart.events.emit).toHaveBeenCalledWith("drawing:selected", { id });

    // A second duplicate of the same original must not land on the first.
    const id2 = duplicateChartDrawing(chart, "line-1");
    expect(chart.getDrawing(id2!)?.points.map((p) => p.timeIndex)).toEqual([2, 3]);
    expect(id2).not.toBe(id);
  });

  it("does not duplicate an unknown drawing", () => {
    const chart = fakeChartWithDrawings([d1]);
    expect(duplicateChartDrawing(chart, "nope")).toBeNull();
    expect(drawingIds(chart)).toEqual(["line-1"]);
  });
});

describe("drawing selection helpers", () => {
  it("selects an existing drawing and re-renders", () => {
    const chart = fakeChartWithDrawings([d1]);
    selectChartDrawing(chart, "line-1");
    expect((chart as any).selectedDrawingId).toBe("line-1");
    expect(chart.events.emit).toHaveBeenCalledWith("drawing:selected", { id: "line-1" });
    expect((chart as any).render).toHaveBeenCalled();
  });

  it("ignores unknown drawing ids", () => {
    const chart = fakeChartWithDrawings([d1]);
    selectChartDrawing(chart, "nope");
    expect((chart as any).selectedDrawingId).toBeNull();
    expect(chart.events.emit).not.toHaveBeenCalled();
  });

  it("clears the current selection without touching drawings", () => {
    const chart = fakeChartWithDrawings([d1]);
    (chart as any).selectedDrawingId = "line-1";
    clearChartDrawingSelection(chart);
    expect((chart as any).selectedDrawingId).toBeNull();
    expect(chart.events.emit).toHaveBeenCalledWith("drawing:deselected", { id: "line-1" });
    expect((chart as any).render).toHaveBeenCalled();
    expect(drawingIds(chart)).toEqual(["line-1"]);
  });

  it("is a no-op when nothing is selected", () => {
    const chart = fakeChartWithDrawings([d1]);
    clearChartDrawingSelection(chart);
    expect(chart.events.emit).not.toHaveBeenCalled();
    expect((chart as any).render).not.toHaveBeenCalled();
  });
});

describe("activateChartTool", () => {
  it("deactivates the previously activated tool so only one tool is live", () => {
    const chart = fakeChart();
    const a = fakeTool("a");
    const b = fakeTool("b");
    registerChartTools(chart, { a, b });
    expect(activateChartTool(chart, "a")).toBe(true);
    expect(a.activate).toHaveBeenCalledTimes(1);
    // Stand-down targets every non-requested tool (idle ones get a
    // harmless reset), so b is touched even though it was never live.
    expect(b.deactivate).toHaveBeenCalledTimes(1);
    expect(activateChartTool(chart, "b")).toBe(true);
    // a must be stood down before b goes live; otherwise both draw.
    expect(a.deactivate).toHaveBeenCalledTimes(1);
    expect(b.activate).toHaveBeenCalledTimes(1);
  });
  it("returns false for unknown tools without touching the registry", () => {
    const chart = fakeChart();
    const a = fakeTool("a");
    registerChartTools(chart, { a });
    expect(activateChartTool(chart, "nope")).toBe(false);
    expect(a.activate).not.toHaveBeenCalled();
    expect(a.deactivate).not.toHaveBeenCalled();
  });
});
