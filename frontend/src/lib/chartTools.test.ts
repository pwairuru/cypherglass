import { describe, it, expect } from "vitest";
import type { DrawingElement, QFChart } from "@qfo/qfchart";
import {
  clearChartDrawings,
  drawingIds,
  restoreDrawings,
  snapshotDrawings,
  undoChartDrawing,
} from "./chartTools";

// Fake chart honoring the real QFChart drawing contract (verified in
// qfchart.min.es.js): addDrawing pushes the full element incl. id,
// removeDrawing splices by id and no-ops on unknown ids.
function fakeChart(initial: DrawingElement[] = []): QFChart {
  const drawings: DrawingElement[] = initial.map((d) => ({ ...d }));
  return {
    drawings,
    addDrawing(d: DrawingElement) {
      drawings.push(d);
    },
    removeDrawing(id: string) {
      const i = drawings.findIndex((d) => d.id === id);
      if (i !== -1) drawings.splice(i, 1);
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
    const chart = fakeChart([d1, d2]);
    const snapshot = snapshotDrawings(chart);
    expect(clearChartDrawings(chart)).toBe(2);
    expect(drawingIds(chart)).toEqual([]);
    expect(restoreDrawings(chart, snapshot)).toBe(2);
    expect(drawingIds(chart)).toEqual(["line-1", "fib-2"]);
    expect(snapshotDrawings(chart)).toEqual(snapshot);
  });

  it("restore skips invalid entries and duplicate ids without lying about count", () => {
    const chart = fakeChart([d1]);
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
    expect(restoreDrawings(fakeChart(), null)).toBe(0);
    expect(restoreDrawings(fakeChart(), { state: [] })).toBe(0);
  });

  it("undo removes the last drawing and returns its id", () => {
    const chart = fakeChart([d1, d2]);
    expect(undoChartDrawing(chart)).toBe("fib-2");
    expect(drawingIds(chart)).toEqual(["line-1"]);
    expect(undoChartDrawing(chart)).toBe("line-1");
    expect(undoChartDrawing(chart)).toBeNull();
  });

  it("helpers degrade to empty on charts without a drawings array", () => {
    const bare = {} as QFChart;
    expect(drawingIds(bare)).toEqual([]);
    expect(snapshotDrawings(bare)).toEqual([]);
    expect(clearChartDrawings(bare)).toBe(0);
    expect(undoChartDrawing(bare)).toBeNull();
  });
});
