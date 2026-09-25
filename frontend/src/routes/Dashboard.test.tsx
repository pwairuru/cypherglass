import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { QFChart } from "@qfo/qfchart";
import Dashboard from "./Dashboard";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));

vi.mock("@qfo/qfchart", () => {
  const mockPlugin = () => ({ activate: vi.fn(), deactivate: vi.fn() });
  // Mirror the real drawing contract (qfchart.min.es.js): addDrawing pushes
  // the full element, removeDrawing splices by id — so snapshot/restore and
  // Clear/Undo run the real code path, not the empty-array guard.
  const mockChart = () => {
    const drawings: unknown[] = [];
    return {
      drawings,
      registerPlugin: vi.fn(),
      setMarketData: vi.fn(),
      addIndicator: vi.fn(),
      updateData: vi.fn(),
      destroy: vi.fn(),
      disableTools: vi.fn(),
      events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
      addDrawing: vi.fn((d: unknown) => {
        drawings.push(d);
      }),
      removeDrawing: vi.fn((id: string) => {
        const i = drawings.findIndex(
          (d) => (d as { id: string }).id === id,
        );
        if (i !== -1) drawings.splice(i, 1);
      }),
      getDrawing: vi.fn(),
      updateDrawing: vi.fn(),
    };
  };
  return {
    QFChart: vi.fn().mockImplementation(mockChart),
    LineTool: vi.fn().mockImplementation(mockPlugin),
    RayTool: vi.fn().mockImplementation(mockPlugin),
    HorizontalLineTool: vi.fn().mockImplementation(mockPlugin),
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
    localStorage.clear();
    localStorage.setItem("cypherglass_token", "test-token");
    mockApi();
  });
  afterEach(() => cleanup());

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

  it("restores saved drawings on reload; Undo/Clear act on real drawings", async () => {
    const saved = [
      {
        id: "line-1",
        type: "line",
        points: [
          { timeIndex: 0, value: 1 },
          { timeIndex: 1, value: 2 },
        ],
      },
      {
        id: "fib-2",
        type: "fibonacci",
        points: [
          { timeIndex: 0, value: 1 },
          { timeIndex: 5, value: 3 },
        ],
      },
    ];
    localStorage.setItem(
      "cg-drawings:price-daily:v1",
      JSON.stringify({ version: 1, state: saved }),
    );
    renderDashboard();
    await screen.findByTestId("price-chart");

    // The hero and onchain charts mount in query-resolution order, so
    // locate the hero by its restore calls rather than instance index.
    const instances = vi.mocked(QFChart).mock.results.map((r) => r.value as {
      addDrawing: ReturnType<typeof vi.fn>;
      removeDrawing: ReturnType<typeof vi.fn>;
    });
    const hero = instances.find((i) => i.addDrawing.mock.calls.length > 0);
    expect(hero).toBeDefined();
    expect(hero!.addDrawing).toHaveBeenCalledTimes(2);

    const undo = screen.getAllByRole("button", { name: "Undo" })[0];
    fireEvent.click(undo);
    expect(hero!.removeDrawing).toHaveBeenCalledTimes(1);
    expect(hero!.removeDrawing).toHaveBeenCalledWith("fib-2");
    expect(JSON.parse(
      localStorage.getItem("cg-drawings:price-daily:v1")!,
    ).state).toHaveLength(1);

    const clear = screen.getAllByRole("button", { name: "Clear" })[0];
    fireEvent.click(clear);
    expect(JSON.parse(
      localStorage.getItem("cg-drawings:price-daily:v1")!,
    ).state).toHaveLength(0);
  });

  it("rectangle/text tools are disabled (no QFChart plugin for them)", async () => {
    renderDashboard();
    await screen.findByTestId("price-chart");
    const rect = screen.getAllByRole("button", { name: "rectangle" })[0];
    const text = screen.getAllByRole("button", { name: "text" })[0];
    expect(rect).toBeDisabled();
    expect(text).toBeDisabled();
  });
});
