import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { fetchChartSeries, type SeriesRequest } from "../charts/data";
import type { ChartData } from "../charts/types";

export function chartQueryKey(chartId: string, request: SeriesRequest) {
  return ["chart-series", chartId, request] as const;
}

export function useChartData(
  chartId: string,
  request: SeriesRequest,
  enabled = true,
) {
  const { token } = useAuth();
  return useQuery<ChartData>({
    queryKey: chartQueryKey(chartId, request),
    queryFn: () => fetchChartSeries(chartId, request, token ?? undefined),
    enabled: enabled && Boolean(chartId),
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
  });
}
