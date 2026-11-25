import type { ChartData, ChartSeriesData, ChartSpec, ChartState } from "../types";
import { formatValue } from "../format";
import { lastValue } from "../overlays";

function Sparkline({ series }: { series: ChartSeriesData }) {
  const points = series.points
    .filter((p) => p.v !== null)
    .slice(-120)
    .map((p) => p.v as number);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const width = 240;
  const height = 48;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="chart-sparkline"
      role="img"
      aria-label={`${series.label} trend`}
      preserveAspectRatio="none"
    >
      <path d={path} fill="none" stroke="var(--cg-metric, #0EA5A0)" strokeWidth="2" />
    </svg>
  );
}

export default function DashboardRenderer({
  spec,
  data,
  state,
}: {
  spec: ChartSpec;
  data: ChartData;
  state: ChartState;
}) {
  const series = data.series.filter((s) => !state.hidden.includes(s.metric));
  if (series.length === 0) {
    return <p className="chart-empty">No cards have data yet.</p>;
  }
  return (
    <div className="chart-dashboard-grid">
      {series.map((s) => {
        const current = lastValue(s);
        const prior = [...s.points].reverse().filter((p) => p.v !== null)[1]?.v ?? null;
        const change =
          current !== null && prior !== null && prior !== 0
            ? ((current - prior) / Math.abs(prior)) * 100
            : null;
        return (
          <article className="chart-mini-card" key={s.metric}>
            <header>
              <h3>{s.label}</h3>
              {s.meta?.proxy && <span className="badge badge-proxy">PROXY</span>}
            </header>
            <strong>{formatValue(current, s.unit)}</strong>
            {change !== null && (
              <span className={change >= 0 ? "delta is-up" : "delta is-down"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
            <Sparkline series={s} />
          </article>
        );
      })}
    </div>
  );
}
