import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import OnchainChart from "./OnchainChart";
vi.mock("@qfo/qfchart", () => ({ QFChart: vi.fn(), LineTool: vi.fn(), FibonacciTool: vi.fn(), MeasureTool: vi.fn() }));
describe("OnchainChart", () => {
  it("renders container", () => {
    const { container } = render(<OnchainChart chartKey="k" title="MVRV" points={[{ t: "2024-01-01", v: 1.2 }]} />);
    expect(container.querySelector("[data-testid='onchain-chart']")).toBeInTheDocument();
  });
});
