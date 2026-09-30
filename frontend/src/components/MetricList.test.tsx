import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricList from "./MetricList";

afterEach(() => cleanup());

const METRICS = [
  { id: "blocks_hourly", title: "Blocks / hour" },
  { id: "blocks_daily", title: "Blocks / day" },
  { id: "tx_count_daily", title: "Transactions / day" },
];

describe("MetricList groups", () => {
  it("renders one title-only row per group, no underscore ids", async () => {
    const onSelect = vi.fn();
    render(<MetricList metrics={METRICS} selected={null} onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Blocks" })).toBeInTheDocument();
    expect(screen.queryByText("blocks_hourly")).toBeNull();
    expect(screen.queryByText("blocks_daily")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Blocks" }));
    expect(onSelect).toHaveBeenCalledWith("blocks");
  });

  it("typing trans narrows 2 groups to 1", async () => {
    const onSelect = vi.fn();
    render(<MetricList metrics={METRICS} selected={null} onSelect={onSelect} />);
    await userEvent.type(screen.getByPlaceholderText(/search metrics/i), "trans");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /transactions/i })).toBeInTheDocument();
  });
});
