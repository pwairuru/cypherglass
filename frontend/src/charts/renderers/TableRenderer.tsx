import { useMemo } from "react";
import type { ChartData, ChartPoint, ChartSpec, ChartState } from "../types";
import { formatValue } from "../format";

export interface MonthlyReturn {
  year: number;
  month: number;
  ret: number;
}

export function monthlyReturns(points: ChartPoint[]): MonthlyReturn[] {
  const lastByMonth = new Map<string, number>();
  for (const p of points) {
    if (p.v === null) continue;
    const key = p.t.slice(0, 7);
    lastByMonth.set(key, p.v);
  }
  const keys = [...lastByMonth.keys()].sort();
  const out: MonthlyReturn[] = [];
  for (let i = 1; i < keys.length; i += 1) {
    const prev = lastByMonth.get(keys[i - 1]) as number;
    const cur = lastByMonth.get(keys[i]) as number;
    if (prev === 0) continue;
    const [year, month] = keys[i].split("-").map(Number);
    out.push({ year, month, ret: (cur / prev - 1) * 100 });
  }
  return out;
}

export interface SeasonalityRow {
  month: number;
  average: number;
  median: number;
  positive: number;
  n: number;
}

export function seasonalityRows(returns: MonthlyReturn[]): SeasonalityRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const values = returns.filter((r) => r.month === month).map((r) => r.ret);
    if (values.length === 0) {
      return { month, average: 0, median: 0, positive: 0, n: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      month,
      average,
      median,
      positive: (values.filter((v) => v > 0).length / values.length) * 100,
      n: values.length,
    };
  });
}

export interface DrawdownEpisode {
  start: string;
  trough: string;
  end: string | null;
  depth: number;
}

export function drawdownEpisodes(points: ChartPoint[]): DrawdownEpisode[] {
  const episodes: DrawdownEpisode[] = [];
  let current: DrawdownEpisode | null = null;
  for (const p of points) {
    if (p.v === null) continue;
    if (p.v < 0) {
      if (!current) {
        current = { start: p.t, trough: p.t, end: null, depth: p.v };
      } else if (p.v < current.depth) {
        current.depth = p.v;
        current.trough = p.t;
      }
    } else if (current) {
      current.end = p.t;
      episodes.push(current);
      current = null;
    }
  }
  if (current) episodes.push(current);
  return episodes.sort((a, b) => a.depth - b.depth);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function heatColor(value: number, maxAbs: number): string {
  if (maxAbs === 0) return "transparent";
  const strength = Math.min(1, Math.abs(value) / maxAbs);
  return value >= 0
    ? `rgba(34,197,94,${0.12 + strength * 0.55})`
    : `rgba(239,68,68,${0.12 + strength * 0.55})`;
}

export default function TableRenderer({
  spec,
  data,
  state,
}: {
  spec: ChartSpec;
  data: ChartData;
  state: ChartState;
}) {
  const series = data.series.find((s) => !state.hidden.includes(s.metric)) ?? data.series[0];
  const returns = useMemo(() => monthlyReturns(series?.points ?? []), [series]);
  const seasonality = useMemo(() => seasonalityRows(returns), [returns]);
  const drawdowns = useMemo(() => drawdownEpisodes(series?.points ?? []), [series]);

  if (!series) {
    return <p className="chart-empty">No table data yet.</p>;
  }

  if (spec.id === "technical.seasonality") {
    return (
      <div className="chart-table-wrap">
        <table className="chart-table">
          <caption>{spec.title}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Avg return</th>
              <th scope="col">Median</th>
              <th scope="col">Positive</th>
              <th scope="col">Years</th>
            </tr>
          </thead>
          <tbody>
            {seasonality.map((row) => (
              <tr key={row.month}>
                <th scope="row">{MONTHS[row.month - 1]}</th>
                <td style={{ color: row.average >= 0 ? "#22c55e" : "#ef4444" }}>
                  {row.average.toFixed(2)}%
                </td>
                <td>{row.median.toFixed(2)}%</td>
                <td>{row.positive.toFixed(0)}%</td>
                <td>{row.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (spec.id === "technical.monthly_returns") {
    const years = [...new Set(returns.map((r) => r.year))].sort();
    const maxAbs = Math.max(...returns.map((r) => Math.abs(r.ret)), 0.01);
    return (
      <div className="chart-table-wrap">
        <table className="chart-table chart-table-matrix">
          <caption>{spec.title}</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              {MONTHS.map((m) => (
                <th scope="col" key={m}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                {MONTHS.map((_, i) => {
                  const cell = returns.find((r) => r.year === year && r.month === i + 1);
                  return (
                    <td
                      key={i}
                      style={{ background: cell ? heatColor(cell.ret, maxAbs) : undefined }}
                    >
                      {cell ? `${cell.ret.toFixed(1)}%` : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (spec.id === "technical.drawdown_table") {
    return (
      <div className="chart-table-wrap">
        <table className="chart-table">
          <caption>{spec.title}</caption>
          <thead>
            <tr>
              <th scope="col">Start</th>
              <th scope="col">Trough</th>
              <th scope="col">Recovered</th>
              <th scope="col">Depth</th>
            </tr>
          </thead>
          <tbody>
            {drawdowns.slice(0, 20).map((d) => (
              <tr key={`${d.start}-${d.trough}`}>
                <td>{d.start.slice(0, 10)}</td>
                <td>{d.trough.slice(0, 10)}</td>
                <td>{d.end ? d.end.slice(0, 10) : "ongoing"}</td>
                <td style={{ color: "#ef4444" }}>{d.depth.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        <caption>{spec.title}</caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            <th scope="col">Latest</th>
            <th scope="col">Unit</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s) => {
            const last = [...s.points].reverse().find((p) => p.v !== null)?.v ?? null;
            return (
              <tr key={s.metric}>
                <th scope="row">{s.label}</th>
                <td>{formatValue(last, s.unit)}</td>
                <td>{s.unit}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
