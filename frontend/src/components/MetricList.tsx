import { useMemo, useState } from "react";
import { groupMetrics } from "../lib/metricGroups";

export interface MetricSummary {
  id: string;
  title: string;
  category?: string;
  unit?: string;
  interval?: string;
  disabled?: boolean;
  description?: string;
}

interface MetricListProps {
  metrics: MetricSummary[];
  selected: string | null;
  onSelect: (groupKey: string) => void;
}

export default function MetricList({ metrics, selected, onSelect }: MetricListProps) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupMetrics(metrics), [metrics]);
  const q = query.trim().toLowerCase();
  const visible = q
    ? groups.filter(
        (g) =>
          g.label.toLowerCase().includes(q) ||
          g.key.toLowerCase().includes(q) ||
          g.variants.some(
            (v) =>
              v.id.toLowerCase().includes(q) ||
              v.title.toLowerCase().includes(q),
          ),
      )
    : groups;

  return (
    <div className="metric-list">
      <input
        className="input"
        type="search"
        placeholder="Search metrics"
        aria-label="Search metrics"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul>
        {visible.map((g) => {
          const disabled = g.variants.every((v) => v.disabled);
          return (
            <li key={g.key}>
              <button
                type="button"
                className="metric-item"
                disabled={disabled}
                aria-disabled={disabled}
                aria-current={selected === g.key}
                onClick={() => {
                  if (!disabled) onSelect(g.key);
                }}
              >
                <span>{g.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
