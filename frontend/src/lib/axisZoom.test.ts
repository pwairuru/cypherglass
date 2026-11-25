import { describe, it, expect, vi } from "vitest";
import { attachAxisZoom, zoomRange } from "./axisZoom";

const RECT = { x: 20, y: 20, width: 540, height: 360 };

function harness() {
  const handlers = new Map<string, (payload?: any) => void>();
  let option: any = { yAxis: [{ min: 100, max: 200 }] };
  const dom = document.createElement("div");
  Object.defineProperty(dom, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0, toJSON: () => ({}) }),
  });
  const ec = {
    getDom: () => dom,
    getModel: () => ({
      getComponent: () => ({ coordinateSystem: { getRect: () => RECT } }),
    }),
    getOption: () => option,
    setOption: vi.fn((next: any) => {
      if (next.yAxis?.[0]) {
        option = { ...option, yAxis: [{ ...option.yAxis[0], ...next.yAxis[0] }] };
      }
    }),
    convertFromPixel: (_finder: any, point: number[]) => {
      const value = 200 - ((point[1] - RECT.y) / RECT.height) * 100;
      return [0, value];
    },
  };
  const chart = {
    getChart: () => ec,
    render: vi.fn(),
    events: {
      on: (event: string, handler: (payload?: any) => void) => handlers.set(event, handler),
      off: (event: string, handler: (payload?: any) => void) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      },
    },
  } as any;
  const detach = attachAxisZoom(chart);
  return { chart, ec, dom, handlers, detach, option: () => option };
}

function wheel(dom: HTMLElement, init: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  dom.dispatchEvent(event);
  return event;
}

function pointer(dom: HTMLElement, type: string, init: MouseEventInit) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  (type === "pointerdown" ? dom : window).dispatchEvent(event);
  return event;
}

describe("zoomRange", () => {
  it("zooms in and out around the anchor value", () => {
    expect(zoomRange({ min: 100, max: 200 }, 0.5, 150)).toEqual({ min: 125, max: 175 });
    expect(zoomRange({ min: 100, max: 200 }, 2, 150)).toEqual({ min: 50, max: 250 });
  });

  it("keeps the anchor fixed when it is off-centre", () => {
    const next = zoomRange({ min: 0, max: 100 }, 0.5, 25);
    expect(next.min).toBeCloseTo(12.5);
    expect(next.max).toBeCloseTo(62.5);
  });
});

describe("attachAxisZoom", () => {
  it("zooms Y with the wheel over the price scale", () => {
    const h = harness();
    const event = wheel(h.dom, { clientX: 590, clientY: 200, deltaY: -100 });
    expect(event.defaultPrevented).toBe(true);
    expect(h.ec.setOption).toHaveBeenCalled();
    const axis = h.ec.setOption.mock.calls.at(-1)![0].yAxis[0];
    expect(axis.max - axis.min).toBeLessThan(100);
    h.detach();
  });

  it("zooms Y with Shift+wheel over the plot", () => {
    const h = harness();
    wheel(h.dom, { clientX: 100, clientY: 200, deltaY: -100, shiftKey: true });
    expect(h.ec.setOption).toHaveBeenCalled();
    h.detach();
  });

  it("leaves plain wheel over the plot to the X dataZoom", () => {
    const h = harness();
    const event = wheel(h.dom, { clientX: 100, clientY: 200, deltaY: -100 });
    expect(event.defaultPrevented).toBe(false);
    expect(h.ec.setOption).not.toHaveBeenCalled();
    h.detach();
  });

  it("drags the price scale to scale Y and resets on double click", () => {
    const h = harness();
    const down = pointer(h.dom, "pointerdown", { clientX: 590, clientY: 150, button: 0 });
    expect(down.defaultPrevented).toBe(true);
    pointer(h.dom, "pointermove", { clientX: 590, clientY: 250 });
    pointer(h.dom, "pointerup", { clientX: 590, clientY: 250 });
    const zoomed = h.ec.setOption.mock.calls.at(-1)![0].yAxis[0];
    expect(zoomed.max - zoomed.min).toBeGreaterThan(100);

    h.dom.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 590, clientY: 150 }));
    expect(h.chart.render).toHaveBeenCalled();
    h.detach();
  });

  it("reapplies the manual scale after QFChart rebuilds the option", () => {
    const h = harness();
    wheel(h.dom, { clientX: 590, clientY: 200, deltaY: -100 });
    const applied = h.ec.setOption.mock.calls.at(-1)![0].yAxis[0];
    // Simulate a full QFChart render resetting the axis to auto functions.
    (h as any).chart.getChart().getOption = () => ({ yAxis: [{ min: () => 0, max: () => 1 }] });
    h.handlers.get("chart:updated")?.();
    const last = h.ec.setOption.mock.calls.at(-1)![0].yAxis[0];
    expect(last).toEqual(applied);
    h.detach();
  });

  it("detaches all listeners", () => {
    const h = harness();
    h.detach();
    wheel(h.dom, { clientX: 590, clientY: 200, deltaY: -100 });
    expect(h.ec.setOption).not.toHaveBeenCalled();
    expect(h.handlers.has("chart:updated")).toBe(false);
  });
});
