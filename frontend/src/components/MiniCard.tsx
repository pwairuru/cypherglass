import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { describeChart, explainMetric } from "../lib/metricCopy";
import OnchainChart, { type SeriesPoint } from "./OnchainChart";
import type { OhlcBar } from "./PriceChart";

interface MiniCardProps {
  metricId: string;
  title: string;
  category?: string;
  description?: string;
  token: string | null;
  from: string;
  to: string;
  priceBars?: OhlcBar[];
}

export default function MiniCard({ metricId, title, category, description, token, from, to, priceBars }: MiniCardProps) {
  const q = useQuery({
    queryKey: ["mini-series", token, metricId, from, to],
    queryFn: () =>
      apiFetch<{ points: SeriesPoint[]; unit: string }>(
        `/api/v1/metrics/${metricId}/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: token !== null,
    retry: false,
  });
  const points = q.data?.points ?? [];
  const unit = q.data?.unit ?? "";
  const explainer =
    points.length > 0
      ? describeChart({ metricId, category, backendDesc: description, points, unit })
      : explainMetric(metricId, category, description);
  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-head">
        <div>
          <h2 style={{ fontSize: 14 }}>{title}</h2>
          <span className="chart-meta">{metricId} · {points.length} pts</span>
        </div>
      </div>
      {q.isPending && <p>Loading…</p>}
      {q.isError && (
        <p role="alert" className="error">
          Failed to load {metricId}
        </p>
      )}
      {!q.isPending && !q.isError && points.length === 0 && (
        <p className="chart-empty">No data for {title}.</p>
      )}
      {points.length > 0 && (
        <div style={{ height: 220 }}>
          <OnchainChart
            chartKey={`mini-${metricId}`}
            title={title}
            points={points}
            priceBars={priceBars}
          />
        </div>
      )}
      {explainer && <p className="chart-desc chart-desc-below">{explainer}</p>}
    </section>
  );
}

export function useRiskSummary(token: string | null, from: string, to: string) {
  const q = useQuery({
    queryKey: ["mini-series", token, "risk_daily", from, to],
    queryFn: () =>
      apiFetch<{ points: SeriesPoint[]; unit: string }>(
        `/api/v1/metrics/risk_daily/series?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        token ?? undefined,
      ),
    enabled: token !== null,
    retry: false,
  });
  const pts = q.data?.points ?? [];
  const latest = pts.length ? pts[pts.length - 1].v : null;
  const regime = latest === null ? "—" : latest > 60 ? "risk-on (overheated)" : latest > 35 ? "neutral" : "risk-off (fear)";
  return { latest, regime, isPending: q.isPending, isError: q.isError };
}

export const OVERVIEW_METRICS = [
  { id: "price_close_daily", title: "BTC close" },
  { id: "mvrv_daily", title: "MVRV" },
  { id: "nupl_daily", title: "NUPL" },
  { id: "sopr_daily", title: "SOPR" },
  { id: "hashrate_daily", title: "Hashrate" },
  { id: "active_addresses_daily", title: "Active addresses" },
  { id: "transfer_volume_daily", title: "Transfer volume" },
  { id: "realized_cap_daily", title: "Realized cap" },
  { id: "puell_daily", title: "Puell multiple" },
] as const;
