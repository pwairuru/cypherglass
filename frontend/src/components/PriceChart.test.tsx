import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QFChart } from "@qfo/qfchart";
import PriceChart from "./PriceChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn().mockImplementation(() => ({ registerPlugin: vi.fn(), registerDrawingRenderer: vi.fn(), setMarketData: vi.fn(), addIndicator: vi.fn(), updateData: vi.fn() })), LineTool: vi.fn(), RayTool: vi.fn(), HorizontalLineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
const bars = [{ time: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];
describe("PriceChart", () => {
  beforeEach(() => { vi.mocked(QFChart).mockClear(); });
  it("renders container", () => {
    const { container } = render(<PriceChart chartKey="k" bars={[]} />);
    expect(container.querySelector("[data-testid='price-chart']")).toBeInTheDocument();
  });
  it("defaults to visible candles with SMA overlay only", () => {
    render(<PriceChart chartKey="k" bars={bars} />);
    const opts = vi.mocked(QFChart).mock.calls[0][1];
    expect(opts).not.toMatchObject({ upColor: "transparent" });
    const inst = vi.mocked(QFChart).mock.results[0].value as { setMarketData: ReturnType<typeof vi.fn>; addIndicator: ReturnType<typeof vi.fn> };
    expect(inst.setMarketData).toHaveBeenCalledWith(bars);
    expect(inst.addIndicator.mock.calls.map(([n]) => n)).toEqual(["SMA_20"]);
  });
  it("line mode hides candles and adds a close-price line", () => {
    render(<PriceChart chartKey="k" bars={bars} mode="line" />);
    const opts = vi.mocked(QFChart).mock.calls[0][1];
    expect(opts).toMatchObject({ upColor: "transparent", downColor: "transparent" });
    const inst = vi.mocked(QFChart).mock.results[0].value as { addIndicator: ReturnType<typeof vi.fn> };
    const price = inst.addIndicator.mock.calls.find(([n]) => n === "price");
    expect(price).toBeDefined();
    expect(price![1].price.data).toEqual([{ time: 1704067200000, value: 1.5 }]);
    expect(inst.addIndicator.mock.calls.some(([n]) => n === "SMA_20")).toBe(true);
  });
});
