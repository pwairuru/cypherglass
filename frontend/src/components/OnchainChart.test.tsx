import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QFChart } from "@qfo/qfchart";
import OnchainChart from "./OnchainChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn().mockImplementation(() => ({ registerPlugin: vi.fn(), registerDrawingRenderer: vi.fn(), setMarketData: vi.fn(), addIndicator: vi.fn(), updateData: vi.fn(), destroy: vi.fn(), events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } })), MeasureTool: vi.fn() }));
describe("OnchainChart", () => {
  it("renders container", () => {
    const { container } = render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    expect(container.querySelector("[data-testid='onchain-chart']")).toBeInTheDocument();
  });
  it("registers the first-party line family", () => {
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    const inst = vi.mocked(QFChart).mock.results[0].value as { registerPlugin: ReturnType<typeof vi.fn> };
    const types = inst.registerPlugin.mock.calls.map(([p]) => (p as { drawingType?: string }).drawingType);
    expect(types).toEqual(expect.arrayContaining(["line", "ray", "horizontal-line", "fibonacci"]));
  });
  it("hides base candles (transparent) and feeds market data", () => {
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    const opts = vi.mocked(QFChart).mock.calls[0][1];
    expect(opts).toMatchObject({ upColor: "transparent", downColor: "transparent" });
    const inst = vi.mocked(QFChart).mock.results[0].value as {
      setMarketData: ReturnType<typeof vi.fn>;
      addIndicator: ReturnType<typeof vi.fn>;
    };
    expect(inst.setMarketData).toHaveBeenCalledTimes(1);
    expect(inst.setMarketData.mock.calls[0][0]).toEqual([
      { time: Date.parse("2024-01-01"), open: 1.2, high: 1.2, low: 1.2, close: 1.2, volume: 0 },
    ]);
  });
  it("adds onchain series as overlay indicator (single pane)", () => {
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    const inst = vi.mocked(QFChart).mock.results[0].value as {
      addIndicator: ReturnType<typeof vi.fn>;
    };
    const overlayCall = inst.addIndicator.mock.calls.find(([name]) => name === "MVRV");
    expect(overlayCall).toBeDefined();
    expect(overlayCall![2]).toEqual({ isOverlay: true });
    expect(overlayCall![1].line.data).toEqual([
      { time: Date.parse("2024-01-01"), value: 1.2 },
    ]);
  });
  it("candles mode uses real price OHLC, keeps metric line, drops price line", () => {
    const priceBars = [{ time: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} priceBars={priceBars} mode="candles" />);
    const calls = vi.mocked(QFChart).mock.calls;
    const opts = calls[calls.length - 1][1];
    expect(opts).not.toMatchObject({ upColor: "transparent" });
    const results = vi.mocked(QFChart).mock.results;
    const inst = results[results.length - 1].value as {
      setMarketData: ReturnType<typeof vi.fn>;
      addIndicator: ReturnType<typeof vi.fn>;
    };
    expect(inst.setMarketData.mock.calls[0][0]).toEqual(priceBars);
    const names = inst.addIndicator.mock.calls.map(([n]) => n);
    expect(names).toContain("MVRV");
    expect(names).not.toContain("price");
  });
  it("candles mode without price bars falls back to line behavior", () => {
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} mode="candles" />);
    const calls = vi.mocked(QFChart).mock.calls;
    const opts = calls[calls.length - 1][1];
    expect(opts).toMatchObject({ upColor: "transparent", downColor: "transparent" });
    const results = vi.mocked(QFChart).mock.results;
    const inst = results[results.length - 1].value as {
      setMarketData: ReturnType<typeof vi.fn>;
    };
    expect(inst.setMarketData.mock.calls[0][0]).toEqual([
      { time: Date.parse("2024-01-01"), open: 1.2, high: 1.2, low: 1.2, close: 1.2, volume: 0 },
    ]);
  });
});
