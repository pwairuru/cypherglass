import { Link } from "react-router-dom";
import { useLayouts } from "../hooks/useAlerts";
import { getChart } from "../charts/registry";
import { defaultChartState, serializeChartState } from "../charts/urlState";
import type { ChartState } from "../charts/types";

export default function Layouts() {
  const layouts = useLayouts();

  return (
    <div className="charts-catalog">
      <header>
        <div>
          <p className="chart-breadcrumb">CypherGlass / Layouts</p>
          <h1>Saved layouts</h1>
          <p className="chart-question">
            Range, grain, variant, axes, series and annotation state saved per account.
          </p>
        </div>
        <Link className="btn" to="/charts">
          Chart catalog
        </Link>
      </header>

      {layouts.isLoading && <p className="chart-loading">Loading layouts…</p>}
      {layouts.isError && <p className="chart-empty">Could not load layouts.</p>}
      {layouts.data && layouts.data.length === 0 && (
        <p className="chart-empty">
          No saved layouts yet. Open any chart and press the save button.
        </p>
      )}
      {layouts.data && layouts.data.length > 0 && (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <caption>Layouts</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Chart</th>
                <th scope="col">Updated</th>
                <th scope="col">Default</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {layouts.data.map((layout) => {
                const spec = layout.chart_id ? getChart(layout.chart_id) : undefined;
                const state = spec
                  ? serializeChartState({
                      ...defaultChartState(spec),
                      ...(layout.spec as unknown as Partial<ChartState>),
                    } as ChartState)
                  : "";
                return (
                  <tr key={layout.id}>
                    <th scope="row">{layout.name}</th>
                    <td>
                      {spec && layout.chart_id ? (
                        <Link to={`/charts/${layout.chart_id}?${state}`}>{spec.title}</Link>
                      ) : (
                        layout.chart_id ?? "—"
                      )}
                    </td>
                    <td>{new Date(layout.updated_at).toLocaleString()}</td>
                    <td>{layout.is_default ? "yes" : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-segmented"
                        onClick={() => layouts.remove.mutate(layout.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
