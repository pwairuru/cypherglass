import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { useAuth } from "../context/AuthContext";
import { fetchChartSeries } from "../charts/data";
import { getChart, listCharts } from "../charts/registry";
import { applyTransform } from "../charts/transforms";
import type { ChartPoint } from "../charts/types";
import EChart from "../charts/renderers/EChart";
import EmptyState from "../components/chart/EmptyState";
import { chartTextColor, gridLineColor } from "../lib/chartTheme";

const DEFAULT_IDS = ["valuation.mvrv", "profitability.sopr", "price.btc", "risk.composite"];

interface CompareSeries {
  chartId: string;
  title: string;
  metric: string;
  label: string;
  points: ChartPoint[];
}

async function loadCompare(ids: string[], token?: string): Promise<CompareSeries[]> {
  const loaded = await Promise.all(
    ids.map(async (id) => {
      const chart = getChart(id);
      if (!chart) return null;
      const metric =
        chart.defaultMetric ??
        chart.series.find((s) => s.metric && !s.hiddenByDefault)?.metric ??
        chart.metrics[0];
      if (!metric) return null;
      const data = await fetchChartSeries(id, { metrics: [metric], maxPoints: 2000 }, token);
      const series = data.series.find((s) => s.metric === metric) ?? data.series[0];
      if (!series) return null;
      return {
        chartId: id,
        title: chart.title,
        metric,
        label: `${chart.title} · ${series.label}`,
        points: applyTransform(series.points, "index"),
      };
    }),
  );
  return loaded.filter((x): x is CompareSeries => x !== null);
}

function correlation(a: ChartPoint[], b: ChartPoint[]): number | null {
  const bMap = new Map(b.map((p) => [p.t, p.v]));
  const pairs = a
    .map((p) => [p.v, bMap.get(p.t)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null && p[1] !== undefined);
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const sx = pairs.reduce((s, p) => s + p[0], 0);
  const sy = pairs.reduce((s, p) => s + p[1], 0);
  const sxx = pairs.reduce((s, p) => s + p[0] * p[0], 0);
  const syy = pairs.reduce((s, p) => s + p[1] * p[1], 0);
  const sxy = pairs.reduce((s, p) => s + p[0] * p[1], 0);
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const { token } = useAuth();
  const ids = useMemo(() => {
    const raw = params.get("charts");
    const parsed = raw?.split(",").filter((id) => getChart(id)).slice(0, 4) ?? [];
    return parsed.length > 0 ? parsed : DEFAULT_IDS;
  }, [params]);
  const [draft, setDraft] = useState<string[]>(ids);

  const query = useQuery({
    queryKey: ["compare", ids],
    queryFn: () => loadCompare(ids, token ?? undefined),
    staleTime: 60_000,
  });

  const setSlot = (index: number, id: string) => {
    const next = [...draft];
    next[index] = id;
    setDraft(next);
    setParams({ charts: next.filter(Boolean).join(",") }, { replace: true });
  };

  const option = useMemo<EChartsOption>(() => {
    const text = chartTextColor();
    return {
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 30, bottom: 60 },
      xAxis: {
        type: "time",
        axisLabel: { color: text },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "index = 100",
        axisLabel: { color: text, formatter: (v: number) => `${v.toFixed(0)}` },
        splitLine: { lineStyle: { color: gridLineColor() } },
      },
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: text }, type: "scroll" },
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 18 }],
      series: (query.data ?? []).map((s) => ({
        name: s.label,
        type: "line" as const,
        showSymbol: false,
        connectNulls: false,
        data: s.points.map((p) => [
          Date.parse(p.t.includes("T") ? p.t : `${p.t}T00:00:00Z`),
          p.v,
        ]),
      })),
    };
  }, [query.data]);

  return (
    <div className="charts-catalog">
      <header>
        <div>
          <p className="chart-breadcrumb">CypherGlass / Compare</p>
          <h1>Compare overlay</h1>
          <p className="chart-question">
            Normalised to index=100 so charts with different units share one axis and crosshair.
          </p>
        </div>
        <Link className="btn" to="/charts">
          Chart catalog
        </Link>
      </header>

      <div className="chart-toolbar">
        {[0, 1, 2, 3].map((slot) => (
          <label className="chart-select" key={slot}>
            Slot {slot + 1}
            <select value={draft[slot] ?? ""} onChange={(e) => setSlot(slot, e.target.value)}>
              <option value="">None</option>
              {listCharts().map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {query.isLoading && <p className="chart-loading">Loading comparison…</p>}
      {query.isError && <EmptyState title="Could not load comparison" detail="Check the selected charts." />}
      {query.data && query.data.length === 0 && (
        <EmptyState title="No comparable data" detail="Choose charts with ingested metrics." />
      )}
      {query.data && query.data.length > 0 && (
        <>
          <EChart option={option} height={460} ariaLabel="Compare overlay chart" />
          <div className="chart-table-wrap" style={{ marginTop: 16 }}>
            <table className="chart-table">
              <caption>Correlation matrix (Pearson, aligned dates)</caption>
              <thead>
                <tr>
                  <th scope="col">Chart</th>
                  {query.data.map((s) => (
                    <th scope="col" key={s.chartId}>
                      {s.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.map((row) => (
                  <tr key={row.chartId}>
                    <th scope="row">{row.title}</th>
                    {query.data.map((col) => {
                      const value = correlation(row.points, col.points);
                      return <td key={col.chartId}>{value === null ? "—" : value.toFixed(3)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
