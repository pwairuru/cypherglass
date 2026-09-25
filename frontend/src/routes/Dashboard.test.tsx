import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import Dashboard from "./Dashboard";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));

vi.mock("@qfo/qfchart", () => {
  const mockPlugin = () => ({ activate: vi.fn(), deactivate: vi.fn() });
  const mockChart = () => ({
    registerPlugin: vi.fn(),
    setMarketData: vi.fn(),
    addIndicator: vi.fn(),
    updateData: vi.fn(),
    destroy: vi.fn(),
    disableTools: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    addDrawing: vi.fn(),
    removeDrawing: vi.fn(),
    getDrawing: vi.fn(),
    updateDrawing: vi.fn(),
  });
  return {
    QFChart: vi.fn().mockImplementation(mockChart),
    LineTool: vi.fn().mockImplementation(mockPlugin),
    FibonacciTool: vi.fn().mockImplementation(mockPlugin),
    MeasureTool: vi.fn().mockImplementation(mockPlugin),
  };
});

const mockedFetch = vi.mocked(apiFetch);

function mockApi() {
  mockedFetch.mockImplementation((path: string) => {
    if (path === "/api/v1/metrics")
      return Promise.resolve([
        { id: "price_ohlc_daily", title: "BTC/USDT / Day" },
        { id: "mvrv_daily", title: "MVRV / Day" },
      ]);
    if (path === "/api/v1/metrics/coverage")
      return Promise.resolve({ min_day: "2024-01-01", max_day: "2024-02-01" });
    if (path.includes("/series"))
      return Promise.resolve({
        points: [{ t: "2024-01-15T00:00:00Z", v: 1.5 }],
        unit: "",
      });
    if (path.includes("/ohlc"))
      return Promise.resolve({
        bars: [
          { time: 1704067200000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        ],
      });
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("Dashboard QFChart integration", () => {
  beforeEach(() => {
    localStorage.setItem("cypherglass_token", "test-token");
    mockApi();
  });

  it("renders price hero + onchain card, each with drawings + export/import", async () => {
    renderDashboard();
    expect(await screen.findByTestId("price-chart")).toBeInTheDocument();
    expect(await screen.findByTestId("onchain-chart")).toBeInTheDocument();

    const panels = document.querySelectorAll('aside[aria-label="Drawing tools"]');
    expect(panels).toHaveLength(2);

    expect(
      screen.getAllByRole("button", { name: /export drawings/i }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /import drawings/i }),
    ).toHaveLength(2);

    const ohlcCalls = mockedFetch.mock.calls.filter(([p]) =>
      (p as string).includes("price_ohlc_daily/ohlc"),
    );
    expect(ohlcCalls.length).toBeGreaterThan(0);
  });

  it("overlay selector toggles price overlay without unmounting card", async () => {
    renderDashboard();
    await screen.findByTestId("onchain-chart");
    const overlay = screen.getByLabelText(/overlay/i);
    fireEvent.change(overlay, { target: { value: "none" } });
    const chart = await screen.findByTestId("onchain-chart");
    expect(chart.closest("section")).not.toBeNull();
  });
});
