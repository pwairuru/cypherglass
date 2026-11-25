import { apiFetch } from "../lib/api";
import type { ChartData, ChartSeriesData } from "./types";

export interface SeriesRequest {
  metrics?: string[];
  from?: string | null;
  to?: string | null;
  grain?: string;
  variant?: string;
  maxPoints?: number;
  transform?: string;
  params?: Record<string, unknown>;
}

export function seriesQuery(request: SeriesRequest): string {
  const params = new URLSearchParams();
  if (request.metrics && request.metrics.length > 0) {
    params.set("metrics", request.metrics.join(","));
  }
  if (request.from) params.set("from", request.from);
  if (request.to) params.set("to", request.to);
  if (request.grain && request.grain !== "auto") params.set("grain", request.grain);
  if (request.variant) params.set("variant", request.variant);
  if (request.maxPoints) params.set("max_points", String(request.maxPoints));
  if (request.transform && request.transform !== "raw") {
    params.set("transform", request.transform);
  }
  if (request.params && Object.keys(request.params).length > 0) {
    params.set("params", JSON.stringify(request.params));
  }
  return params.toString();
}

interface RawSeries {
  metric: string;
  label: string;
  unit: string;
  axis: ChartSeriesData["axis"];
  style?: ChartSeriesData["style"];
  points: ChartSeriesData["points"];
  bars?: ChartSeriesData["bars"];
  meta?: ChartSeriesData["meta"];
}

interface RawResponse {
  chartId: string;
  from: string | null;
  to: string | null;
  grain: string;
  series: RawSeries[];
  generatedAt?: string;
}

export async function fetchChartSeries(
  chartId: string,
  request: SeriesRequest,
  token?: string,
): Promise<ChartData> {
  const query = seriesQuery(request);
  const raw = await apiFetch<RawResponse>(
    `/api/v1/charts/${encodeURIComponent(chartId)}/series${query ? `?${query}` : ""}`,
    token,
  );
  return {
    chartId: raw.chartId,
    from: raw.from,
    to: raw.to,
    grain: raw.grain,
    generatedAt: raw.generatedAt,
    series: raw.series.map((s) => ({
      ...s,
      meta: {
        ...s.meta,
        proxy: s.meta?.proxy ?? s.metric.includes("_proxy"),
      },
    })),
  };
}

export async function fetchChartCsv(
  chartId: string,
  request: SeriesRequest,
  token?: string,
): Promise<string> {
  const query = seriesQuery(request);
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:8002"}/api/v1/charts/${encodeURIComponent(
      chartId,
    )}/series.csv${query ? `?${query}` : ""}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) throw new Error(`CSV export failed (${response.status})`);
  return response.text();
}

export async function fetchCoverage(
  token?: string,
): Promise<{ min_day: string; max_day: string }> {
  return apiFetch("/api/v1/metrics/coverage", token);
}
