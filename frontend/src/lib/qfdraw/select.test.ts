// frontend/src/lib/qfdraw/select.test.ts
import { describe, it, expect } from "vitest";
import { withSelection, sampleIndices } from "./select";

function ctx(pixelPoints: [number, number][], isSelected: boolean): any {
  return {
    drawing: { id: "d", type: "t", points: [], style: { color: "#123456" } },
    pixelPoints, isSelected, api: {}, coordSys: { x: 0, y: 0, width: 300, height: 200 },
  };
}
const inner = {
  type: "t",
  render: () => ({
    type: "group",
    children: [
      { type: "line", shape: {}, style: {} },
      { type: "text", style: { text: "hi" } },
    ],
  }),
};

describe("withSelection", () => {
  it("names body shapes line, silences text, adds point handles", () => {
    const g = withSelection(inner).render(ctx([[10, 10], [90, 40]], false));
    const line = g.children.find((c: any) => c.type === "line");
    expect(line.name).toBe("line");
    expect(line.silent).toBeUndefined();
    const text = g.children.find((c: any) => c.type === "text");
    expect(text.silent).toBe(true);
    const handles = g.children.filter((c: any) => String(c.name).startsWith("point-"));
    expect(handles.map((c: any) => c.name)).toEqual(["point-0", "point-1"]);
    expect(handles[0].shape).toEqual({ cx: 10, cy: 10, r: 5 });
    expect(handles[0].style).toMatchObject({ stroke: "#123456", lineWidth: 2 });
    expect(handles.every((c: any) => c.style.opacity === 0)).toBe(true);
  });
  it("shows handles when selected", () => {
    const g = withSelection(inner).render(ctx([[10, 10]], true));
    const handles = g.children.filter((c: any) => String(c.name).startsWith("point-"));
    expect(handles).toHaveLength(1);
    expect(handles[0].style.opacity).toBe(1);
  });
  it("does not rename shapes that already have a name", () => {
    const named = { type: "x", render: () => ({ type: "group", children: [{ type: "rect", name: "custom", shape: {}, style: {} }] }) };
    const g = withSelection(named).render(ctx([], false));
    expect(g.children[0].name).toBe("custom");
  });
  it("caps handles and keeps first/last indices", () => {
    expect(sampleIndices(3, 50)).toEqual([0, 1, 2]);
    const idx = sampleIndices(500, 50);
    expect(idx.length).toBeLessThanOrEqual(50);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(499);
  });
});
