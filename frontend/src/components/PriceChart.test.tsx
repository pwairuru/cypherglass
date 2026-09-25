import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import PriceChart from "./PriceChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn().mockImplementation(() => ({ registerPlugin: vi.fn(), setMarketData: vi.fn(), addIndicator: vi.fn(), updateData: vi.fn() })), LineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
describe("PriceChart", () => {
  it("renders container", () => {
    const { container } = render(<PriceChart chartKey="k" bars={[]} />);
    expect(container.querySelector("[data-testid='price-chart']")).toBeInTheDocument();
  });
});
