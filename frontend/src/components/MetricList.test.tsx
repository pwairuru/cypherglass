import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricList from "./MetricList";

const METRICS = [
  { id: "block_stats_daily", title: "Blocks / day" },
  { id: "tx_volume_hourly", title: "TX volume / hour" },
  { id: "address_activity_daily", title: "Active addresses / day" },
];

describe("MetricList filter", () => {
  it("typing block narrows 3 items to 1", async () => {
    const onSelect = vi.fn();
    render(<MetricList metrics={METRICS} selected={null} onSelect={onSelect} />);
    expect(screen.getAllByRole("button").filter((b) => b.textContent?.includes("/"))).toHaveLength(3);
    await userEvent.type(screen.getByPlaceholderText(/search metrics/i), "block");
    const visible = screen.getAllByRole("button").filter((b) => b.textContent?.includes("/"));
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("block_stats_daily");
  });
});
