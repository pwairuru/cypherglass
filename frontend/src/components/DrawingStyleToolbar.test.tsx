import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { QFChart } from "@qfo/qfchart";
import DrawingStyleToolbar from "./DrawingStyleToolbar";
import { defaultDrawingStyle } from "../lib/qfdraw/style";

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

function makeChart() {
  const handlers = new Map<string, (payload?: any) => void>();
  const drawing = {
    id: "d1",
    type: "line",
    points: [
      { timeIndex: 0, value: 100 },
      { timeIndex: 10, value: 200 },
    ],
    style: { color: "#2962FF", lineWidth: 2, lineStyle: "solid" },
  };
  const drawings: any[] = [drawing];
  const chart = {
    drawings,
    selectedDrawingId: null as string | null,
    events: {
      on: (event: string, handler: (payload?: any) => void) => handlers.set(event, handler),
      off: (event: string, handler: (payload?: any) => void) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      },
      emit: (event: string, payload?: any) => handlers.get(event)?.(payload),
    },
    getDrawing: vi.fn((id: string) => drawings.find((d) => d.id === id)),
    updateDrawing: vi.fn((next: any) => {
      const i = drawings.findIndex((d) => d.id === next.id);
      if (i !== -1) drawings[i] = next;
    }),
    removeDrawing: vi.fn((id: string) => {
      const i = drawings.findIndex((d) => d.id === id);
      if (i !== -1) drawings.splice(i, 1);
    }),
    addDrawing: vi.fn((d: any) => drawings.push(d)),
    render: vi.fn(),
    coordinateConversion: {
      dataToPixel: () => ({ x: 120, y: 140 }),
    },
    getChart: () => ({
      getDom: () => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
      }),
    }),
  } as unknown as QFChart;
  return { chart, handlers, drawing };
}

function harness() {
  const first = makeChart();
  const ref = createRef<HTMLDivElement>();
  const onChange = vi.fn();
  const ui = (chart: QFChart) => (
    <div ref={ref} style={{ width: 600, height: 400 }}>
      <DrawingStyleToolbar chart={chart} containerRef={ref} onChange={onChange} />
    </div>
  );
  const view = render(ui(first.chart));
  const select = () =>
    act(() => {
      (first.chart as any).selectedDrawingId = "d1";
      first.handlers.get("drawing:selected")?.({ id: "d1" });
    });
  return {
    ...first,
    onChange,
    select,
    rerender: (chart: QFChart) => view.rerender(ui(chart)),
  };
}

describe("DrawingStyleToolbar", () => {
  it("appears when a drawing is selected and shows its current style", () => {
    const h = harness();
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
    h.select();
    expect(screen.getByRole("dialog", { name: /drawing style/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Color #2962FF" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Width 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("updates the selected drawing colour through the chart", () => {
    const h = harness();
    h.select();
    fireEvent.click(screen.getByRole("button", { name: "Color #F23645" }));
    expect(h.chart.updateDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "d1",
        style: expect.objectContaining({ color: "#F23645" }),
      }),
    );
    expect(h.onChange).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Color #F23645" })).toHaveAttribute("aria-pressed", "true");
  });

  it("updates width and dash", () => {
    const h = harness();
    h.select();
    fireEvent.click(screen.getByRole("button", { name: "Width 3" }));
    expect(h.chart.updateDrawing).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ lineWidth: 3 }) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Line style dashed" }));
    expect(h.chart.updateDrawing).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ lineStyle: "dashed" }) }),
    );
  });

  it("saves the current style as the default for new drawings", () => {
    const h = harness();
    h.select();
    fireEvent.click(screen.getByRole("button", { name: "Color #089981" }));
    fireEvent.click(screen.getByRole("button", { name: /save style as default/i }));
    expect(defaultDrawingStyle()).toMatchObject({ color: "#089981", lineWidth: 2 });
  });

  it("duplicates the drawing, selects the copy and deletes that copy", () => {
    const h = harness();
    h.select();
    fireEvent.click(screen.getByRole("button", { name: /duplicate drawing/i }));
    expect(h.chart.addDrawing).toHaveBeenCalled();
    const copyId = (h.chart as any).selectedDrawingId as string;
    expect(copyId).not.toBe("d1");
    expect(screen.getByRole("dialog", { name: /drawing style/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete drawing/i }));
    expect(h.chart.removeDrawing).toHaveBeenCalledWith(copyId);
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
  });

  it("closes on deselect, delete event and Escape", () => {
    const h = harness();
    h.select();
    act(() => h.handlers.get("drawing:deselected")?.({ id: "d1" }));
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
    h.select();
    act(() => h.handlers.get("drawing:deleted")?.({ id: "d1" }));
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
    h.select();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
  });

  it("clears the chart selection when closed with X or Escape", () => {
    const h = harness();
    h.select();
    expect((h.chart as any).selectedDrawingId).toBe("d1");
    fireEvent.click(screen.getByRole("button", { name: /close drawing style/i }));
    expect((h.chart as any).selectedDrawingId).toBeNull();
    expect((h.chart as any).render).toHaveBeenCalled();
    h.select();
    expect((h.chart as any).selectedDrawingId).toBe("d1");
    fireEvent.keyDown(document, { key: "Escape" });
    expect((h.chart as any).selectedDrawingId).toBeNull();
  });

  it("closes when the chart is rebuilt", () => {
    const h = harness();
    h.select();
    expect(screen.getByRole("dialog", { name: /drawing style/i })).toBeInTheDocument();
    const next = makeChart();
    h.rerender(next.chart);
    expect(screen.queryByRole("dialog", { name: /drawing style/i })).not.toBeInTheDocument();
  });
});
