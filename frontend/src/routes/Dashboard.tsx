import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import MetricList, { type MetricSummary } from "../components/MetricList";
import ChartPane, { type SeriesPoint } from "../components/ChartPane";

interface SeriesOut {
  points: SeriesPoint[];
  unit: string;
}

const RANGES = [7, 30, 90] as const;

export default function Dashboard() {
  const { token, logout } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);

  const to = new Date().toISOString();
  const from = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const metricsQuery = useQuery({
    queryKey: ["metrics"],
    queryFn: () => apiFetch<MetricSummary[]>("/api/v1/metrics", token ?? undefined),
    enabled: token !== null,
  });

  const metrics = metricsQuery.data ?? [];

  useEffect(() => {
    if (selected === null && metrics.length > 0) {
      const first = metrics.find((m) => !m.disabled);
      if (first) setSelected(first.id);
    }
  }, [metrics, selected]);

  const activeMetric = metrics.find((m) => m.id === selected);
  const seriesEnabled = token !== null && selected !== null && activeMetric?.disabled !== true;

  const seriesQuery = useQuery({
    queryKey: ["series", selected, from, to],
    queryFn: () =>
      apiFetch<SeriesOut>(
        `/api/v1/metrics/${selected}/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: seriesEnabled,
  });

  return (
    <div className="dashboard">
      <header>
        <h1>CypherGlass Analytics</h1>
        <div>
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              className="btn"
              disabled={rangeDays === d}
              onClick={() => setRangeDays(d)}
            >
              {d}d
            </button>
          ))}
          <button className="btn" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      {metricsQuery.isPending && <p>Loading metrics…</p>}
      {metricsQuery.isError && (
        <p className="error">
          {metricsQuery.error instanceof Error ? metricsQuery.error.message : "Failed to load metrics"}
        </p>
      )}
      <div className="dashboard-body">
        <aside style={{ width: 280 }}>
          <MetricList metrics={metrics} selected={selected} onSelect={setSelected} />
        </aside>
        <main>
          {activeMetric && (
            <ChartPane
              title={activeMetric.title}
              unit={activeMetric.unit ?? ""}
              series={seriesQuery.data}
              loading={seriesQuery.isPending && seriesEnabled}
              error={
                seriesQuery.isError
                  ? seriesQuery.error instanceof Error
                    ? seriesQuery.error.message
                    : "Failed to load series"
                  : null
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
