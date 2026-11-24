import { useMemo } from "react";
import { simulateDca, simulateLumpSum, type DcaBar } from "../lib/dca";

const FREQS = [
  { label: "Daily", days: 1 },
  { label: "Weekly", days: 7 },
  { label: "Monthly", days: 30 },
] as const;

function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function DcaLab(props: {
  bars: DcaBar[];
  from: string;
  to: string;
  loading: boolean;
  amount: string;
  onAmount: (v: string) => void;
  everyDays: number;
  onEveryDays: (d: number) => void;
}) {
  const { bars, from, to, loading, amount, onAmount, everyDays, onEveryDays } = props;
  const result = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const contribution = Number(amount);
    const dca = simulateDca(bars, contribution, everyDays, fromMs, toMs);
    const lump = simulateLumpSum(bars, dca.invested, fromMs, toMs);
    return { dca, lump };
  }, [bars, from, to, amount, everyDays]);
  const { dca, lump } = result;
  const winner = dca.value === lump.value ? "Tie" : dca.value > lump.value ? "DCA wins" : "Lump sum wins";
  return (
    <section className="chart-card" aria-label="DCA Lab">
      <div className="chart-head">
        <div>
          <h2>DCA Lab</h2>
          <p className="chart-meta">
            Recurring buys at daily closes vs one lump-sum buy at the range start, from loaded OHLC bars.
          </p>
        </div>
      </div>
      <div className="filter-label">
        <span aria-hidden="true">Buy</span>
        <input
          aria-label="Contribution in USD"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          style={{ width: 110 }}
        />
        <span aria-hidden="true">USD every</span>
        <div className="chart-segmented" role="group" aria-label="Frequency">
          {FREQS.map((f) => (
            <button
              key={f.days}
              type="button"
              className={`btn-segmented${everyDays === f.days ? " is-active" : ""}`}
              aria-pressed={everyDays === f.days}
              onClick={() => onEveryDays(f.days)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p>Loading price bars…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
          <div>
            <h3>DCA</h3>
            <p className="chart-meta">Buys: {dca.buys}</p>
            <p className="chart-meta">Invested: {money(dca.invested)}</p>
            <p className="chart-meta">BTC: {dca.btc.toFixed(8)}</p>
            <p className="chart-meta">Value: {money(dca.value)}</p>
            <p className="chart-meta">Multiple: {dca.multiple.toFixed(2)}x</p>
          </div>
          <div>
            <h3>Lump sum</h3>
            <p className="chart-meta">Buys: {lump.buys}</p>
            <p className="chart-meta">Invested: {money(lump.invested)}</p>
            <p className="chart-meta">BTC: {lump.btc.toFixed(8)}</p>
            <p className="chart-meta">Value: {money(lump.value)}</p>
            <p className="chart-meta">Multiple: {lump.multiple.toFixed(2)}x</p>
          </div>
          <div>
            <h3>Verdict</h3>
            <p className="chart-meta">{winner}</p>
          </div>
        </div>
      )}
    </section>
  );
}
