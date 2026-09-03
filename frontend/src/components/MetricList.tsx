import { useState } from "react";

export interface MetricSummary {
  id: string;
  title: string;
  category?: string;
  unit?: string;
  interval?: string;
  disabled?: boolean;
}

interface MetricListProps {
  metrics: MetricSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export default function MetricList({ metrics, selected, onSelect }: MetricListProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? metrics.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.title.toLowerCase().includes(q),
      )
    : metrics;

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
        {visible.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="metric-item"
              disabled={Boolean(m.disabled)}
              aria-disabled={Boolean(m.disabled)}
              aria-current={selected === m.id}
              onClick={() => {
                if (!m.disabled) onSelect(m.id);
              }}
            >
              <span>{m.id}</span>
              <span>{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
