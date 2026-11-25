import { Link, useParams } from "react-router-dom";
import ChartHost from "../components/chart/ChartHost";

export default function ChartPage() {
  const { chartId = "" } = useParams();
  return (
    <div className="chart-page-shell">
      <nav className="chart-page-nav">
        <Link to="/charts">← Chart catalog</Link>
        <Link to="/">Dashboard</Link>
      </nav>
      <ChartHost chartId={chartId} />
    </div>
  );
}
