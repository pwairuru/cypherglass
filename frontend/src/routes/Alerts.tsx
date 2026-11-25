import { Link } from "react-router-dom";
import { useAlerts } from "../hooks/useAlerts";
import { getChart } from "../charts/registry";

export default function Alerts() {
  const alerts = useAlerts();

  return (
    <div className="charts-catalog">
      <header>
        <div>
          <p className="chart-breadcrumb">CypherGlass / Alerts</p>
          <h1>Chart alerts</h1>
          <p className="chart-question">
            Rules evaluate in the separate scheduler binary and write one event per data bucket.
          </p>
        </div>
        <Link className="btn" to="/charts">
          Chart catalog
        </Link>
      </header>

      {alerts.isLoading && <p className="chart-loading">Loading alerts…</p>}
      {alerts.isError && <p className="chart-empty">Could not load alerts.</p>}
      {alerts.data && alerts.data.length === 0 && (
        <p className="chart-empty">
          No alerts yet. Open a chart and use the bell button to create one.
        </p>
      )}
      {alerts.data && alerts.data.length > 0 && (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <caption>Alert rules</caption>
            <thead>
              <tr>
                <th scope="col">Chart</th>
                <th scope="col">Metric</th>
                <th scope="col">Rule</th>
                <th scope="col">Cooldown</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.data.map((alert) => (
                <tr key={alert.id}>
                  <th scope="row">
                    <Link to={`/charts/${alert.chart_id}`}>
                      {getChart(alert.chart_id)?.title ?? alert.chart_id}
                    </Link>
                  </th>
                  <td>{alert.metric_id}</td>
                  <td>
                    {alert.rule.kind} {alert.rule.threshold}
                  </td>
                  <td>{alert.cooldown_seconds}s</td>
                  <td>{alert.is_active ? "active" : "paused"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-segmented"
                      onClick={() =>
                        alerts.update.mutate({ id: alert.id, is_active: !alert.is_active })
                      }
                    >
                      {alert.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="btn-segmented"
                      onClick={() => alerts.remove.mutate(alert.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
