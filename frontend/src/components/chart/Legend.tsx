import type { ChartSeriesData } from "../../charts/types";
import { formatValue } from "../../charts/format";
import { lastValue } from "../../charts/overlays";

export default function Legend({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeriesData[];
  hidden: string[];
  onToggle: (metric: string) => void;
}) {
  if (series.length === 0) return null;
  return (
    <ul className="chart-legend" aria-label="Series legend">
      {series.map((s, index) => {
        const isHidden = hidden.includes(s.metric);
        return (
          <li key={`${s.metric}-${s.axis}-${index}`} className={isHidden ? "is-hidden" : undefined}>
            <button
              type="button"
              onClick={() => onToggle(s.metric)}
              aria-pressed={!isHidden}
              title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span className={`legend-swatch axis-${s.axis}`} aria-hidden="true" />
              <span className="legend-label">{s.label}</span>
              <span className="legend-value">{formatValue(lastValue(s), s.unit)}</span>
              <span className="legend-axis">{s.axis}</span>
              {s.meta?.proxy && <span className="badge badge-proxy">PROXY</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
