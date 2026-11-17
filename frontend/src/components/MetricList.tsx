import { useEffect, useMemo, useState } from "react";
import { groupByCategory } from "../lib/metricGroups";

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const cats = useMemo(() => groupByCategory(metrics), [metrics]);
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return cats;
    return cats
      .map((c) => ({
        ...c,
        groups: c.groups.filter(
          (g) =>
            g.label.toLowerCase().includes(q) ||
            g.key.toLowerCase().includes(q) ||
            g.variants.some(
              (v) =>
                v.id.toLowerCase().includes(q) ||
                v.title.toLowerCase().includes(q),
            ),
        ),
      }))
      .filter((c) => c.groups.length > 0);
  }, [cats, q]);

  // Keep the selected metric visible: expand its category on change.
  useEffect(() => {
    if (!selected) return;
    const owner = cats.find((c) => c.groups.some((g) => g.key === selected));
    if (owner) {
      setCollapsed((prev) => {
        if (!prev.has(owner.category)) return prev;
        const next = new Set(prev);
        next.delete(owner.category);
        return next;
      });
    }
  }, [selected, cats]);

  const toggle = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const total = metrics.length;

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
      <p className="metric-total" aria-label={`${total} metrics`}>
        {q
          ? `${filtered.reduce((n, c) => n + c.groups.length, 0)} of ${cats.length} groups`
          : `${total} metrics in ${cats.length} groups`}
      </p>
      <div className="metric-groups">
        {filtered.map((c) => {
          const isClosed = collapsed.has(c.category);
          return (
            <section key={c.category} className="metric-group" aria-label={c.label}>
              <button
                type="button"
                className="metric-group-head"
                aria-expanded={!isClosed}
                onClick={() => toggle(c.category)}
              >
                <span className="metric-group-caret" aria-hidden="true">
                  {isClosed ? "▸" : "▾"}
                </span>
                <span>{c.label}</span>
                <span className="metric-group-count">{c.groups.length}</span>
              </button>
              {!isClosed && (
                <ul>
                  {c.groups.map((g) => {
                    const disabled = g.variants.every((v) => v.disabled);
                    return (
                      <li key={g.key}>
                        <button
                          type="button"
                          className="metric-item"
                          disabled={disabled}
                          aria-disabled={disabled}
                          aria-current={selected === g.key ? "true" : undefined}
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
              )}
            </section>
          );
        })}
        {filtered.length === 0 && (
          <p className="chart-empty" style={{ minHeight: 0 }}>
            No metrics match.
          </p>
        )}
      </div>
    </div>
  );
}
