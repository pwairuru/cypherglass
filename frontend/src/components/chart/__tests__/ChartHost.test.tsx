import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import { AuthProvider } from "../../../context/AuthContext";
import { ThemeProvider } from "../../../context/ThemeContext";
import ChartHost from "../ChartHost";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));

vi.mock("../../../charts/renderers/TimeSeriesRenderer", () => ({
  default: ({ spec }: { spec: { title: string } }) => (
    <div data-testid="time-series-renderer">{spec.title}</div>
  ),
}));

const mockedFetch = vi.mocked(apiFetch);

function seriesResponse() {
  return {
    chartId: "valuation.mvrv",
    from: null,
    to: null,
    grain: "daily",
    series: [
      {
        metric: "mvrv_daily",
        label: "MVRV",
        unit: "ratio",
        axis: "left",
        style: "line",
        points: [
          { t: "2024-01-01", v: 1.2 },
          { t: "2024-01-02", v: 1.4 },
        ],
        meta: { proxy: false },
      },
      {
        metric: "price_close_daily",
        label: "BTC price",
        unit: "USD",
        axis: "right",
        style: "line",
        points: [
          { t: "2024-01-01", v: 42000 },
          { t: "2024-01-02", v: 43000 },
        ],
        meta: { proxy: false },
      },
    ],
  };
}

function renderChart(chartId = "valuation.mvrv") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/charts/${chartId}`]}>
            <Routes>
              <Route path="/charts/:chartId" element={<ChartHost chartId={chartId} />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("ChartHost", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(seriesResponse());
  });
  afterEach(() => cleanup());

  it("renders the chart title, renderer and legend", async () => {
    renderChart();
    expect(screen.getByRole("heading", { name: "MVRV / Z-Score / Momentum" })).toBeInTheDocument();
    expect(await screen.findByTestId("time-series-renderer")).toBeInTheDocument();
    expect(await screen.findByText("BTC price")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Z-Score" })).toBeInTheDocument();
  });

  it("toggles a series from the legend", async () => {
    renderChart();
    const button = await screen.findByRole("button", { name: /MVRV/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("shows an explicit data-required state for new charts", async () => {
    renderChart("urpd.distribution");
    expect(await screen.findByText("Data not ingested yet")).toBeInTheDocument();
    expect(screen.getAllByText(/urpd_bins/).length).toBeGreaterThan(0);
  });
});
