import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricList from "./MetricList";

afterEach(() => cleanup());

const METRICS = [
  { id: "blocks_hourly", title: "Blocks / hour", category: "network" },
  { id: "blocks_daily", title: "Blocks / day", category: "network" },
  { id: "tx_count_daily", title: "Transactions / day", category: "fees" },
];

describe("MetricList groups", () => {
  it("renders one title-only row per group, no underscore ids", async () => {
    const onSelect = vi.fn();
    render(<MetricList metrics={METRICS} selected={null} onSelect={onSelect} />);
    // Category headers + metric rows both render as buttons.
    expect(screen.getByRole("button", { name: /Network and blocks/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fees and transactions/ })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Transactions / day" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Blocks" })).toBeNull();
  });

  it("collapses a category section", async () => {
    const onSelect = vi.fn();
    render(<MetricList metrics={METRICS} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Network and blocks/ }));
    expect(screen.queryByRole("button", { name: "Blocks" })).toBeNull();
    // Other category stays open.
    expect(screen.getByRole("button", { name: "Transactions / day" })).toBeInTheDocument();
  });
});
