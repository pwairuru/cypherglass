import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { chartsByCategory } from "../charts/registry";
import ThemeSwitcher from "../components/ThemeSwitcher";

export default function Charts() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const groups = useMemo(() => chartsByCategory(), []);
  const categories = useMemo(() => Object.keys(groups).sort(), [groups]);
  const charts = useMemo(() => {
    const list = category === "all" ? Object.values(groups).flat() : groups[category] ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.question.toLowerCase().includes(q) ||
        c.metrics.some((m) => m.includes(q)),
    );
  }, [category, groups, query]);

  return (
    <div className="charts-catalog">
      <header>
        <div>
          <p className="chart-breadcrumb">CypherGlass / Charts</p>
          <h1>Chart catalog</h1>
          <p className="chart-question">
            109 catalogued chart pages. Each page is a designed instrument, not a raw metric.
          </p>
        </div>
        <div className="catalog-actions">
          <Link className="btn" to="/">
            Dashboard
          </Link>
          <Link className="btn" to="/compare">
            Compare
          </Link>
          <Link className="btn" to="/alerts">
            Alerts
          </Link>
          <Link className="btn" to="/layouts">
            Layouts
          </Link>
          <ThemeSwitcher />
        </div>
      </header>

      <div className="catalog-filters">
        <label className="catalog-search">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Search chart, metric or question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search charts"
          />
        </label>
        <label className="chart-select">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All ({Object.values(groups).flat().length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} ({groups[c].length})
              </option>
            ))}
          </select>
        </label>
        <span className="chart-meta" role="status">
          {charts.length} charts
        </span>
      </div>

      <div className="catalog-grid">
        {charts.map((c) => (
          <Link key={c.id} className="catalog-card" to={`/charts/${c.id}`}>
            <div className="catalog-card-head">
              <h2>{c.title}</h2>
              <span className={`badge status-${c.status}`}>{c.status}</span>
            </div>
            <p>{c.question}</p>
            <p className="chart-meta">
              {c.archetype.replace(/_/g, " ")} · {c.metrics.length} metrics
              {c.newMetrics.length > 0 ? ` · ${c.newMetrics.length} missing` : ""}
            </p>
            {c.newMetrics.length > 0 && (
              <span className="badge badge-p2">data required</span>
            )}
          </Link>
        ))}
      </div>
      {charts.length === 0 && (
        <p className="chart-empty">No charts match “{query}”.</p>
      )}
    </div>
  );
}
