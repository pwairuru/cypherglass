import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QFChart } from "@qfo/qfchart";
import OnchainChart from "./OnchainChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn().mockImplementation(() => ({ registerPlugin: vi.fn(), setMarketData: vi.fn(), addIndicator: vi.fn(), updateData: vi.fn(), destroy: vi.fn(), events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } })), LineTool: vi.fn(), RayTool: vi.fn(), HorizontalLineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
describe("OnchainChart", () => {
  it("renders container", () => {
    const { container } = render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    expect(container.querySelector("[data-testid='onchain-chart']")).toBeInTheDocument();
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
      { time: Math.floor(Date.parse("2024-01-01") / 1000), open: 1.2, high: 1.2, low: 1.2, close: 1.2, volume: 0 },
    ]);
  });
  it("adds onchain series as non-overlay indicator", () => {
    render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    const inst = vi.mocked(QFChart).mock.results[0].value as {
      addIndicator: ReturnType<typeof vi.fn>;
    };
    const overlayCall = inst.addIndicator.mock.calls.find(([name]) => name === "MVRV");
    expect(overlayCall).toBeDefined();
    expect(overlayCall![2]).toEqual({ isOverlay: false });
    expect(overlayCall![1].line.data).toEqual([
      { time: Math.floor(Date.parse("2024-01-01") / 1000), value: 1.2 },
    ]);
  });
});
