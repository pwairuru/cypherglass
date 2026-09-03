import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import MetricList, { type MetricSummary } from "../components/MetricList";
import ChartPane, { type SeriesPoint } from "../components/ChartPane";
import ThemeSwitcher from "../components/ThemeSwitcher";

interface SeriesOut {
  points: SeriesPoint[];
  unit: string;
}

const RANGES = [7, 30, 90] as const;

export default function Dashboard() {
  const { token, logout } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);

  const metricsQuery = useQuery({
    queryKey: ["metrics"],
    queryFn: () => apiFetch<MetricSummary[]>("/api/v1/metrics", token ?? undefined),
    enabled: token !== null,
  });

  const coverageQuery = useQuery({
    queryKey: ["coverage"],
    queryFn: () =>
      apiFetch<{ min_day: string; max_day: string }>(
        "/api/v1/metrics/coverage",
        token ?? undefined,
      ),
    enabled: token !== null,
    retry: false,
  });

  const metrics = metricsQuery.data ?? [];

  // Anchor range to data era (decoder still syncing early chain).
  const { to, from } = useMemo(() => {
    const anchor = coverageQuery.data?.max_day
      ? new Date(`${coverageQuery.data.max_day}T23:59:59Z`).getTime()
      : Date.now();
    const to = new Date(anchor).toISOString();
    const minT = coverageQuery.data?.min_day
      ? new Date(`${coverageQuery.data.min_day}T00:00:00Z`).getTime()
      : 0;
    const from = new Date(
      Math.max(anchor - rangeDays * 24 * 60 * 60 * 1000, minT),
    ).toISOString();
    return { to, from };
  }, [rangeDays, coverageQuery.data]);

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
          <ThemeSwitcher />
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
        <aside className="metric-rail">
          <MetricList metrics={metrics} selected={selected} onSelect={setSelected} />
        </aside>
        <main className="chart-area">
          {activeMetric && (
            <section className="chart-card">
              <div className="chart-head">
                <div>
                  <h2>{activeMetric.title}</h2>
                  {activeMetric.description && <p className="chart-desc">{activeMetric.description}</p>}
                </div>
                <div className="chart-filters" role="group" aria-label="Range">
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
                </div>
              </div>
              <div className="chart-fill">
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
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
