/** Dollar-cost averaging simulator (pure math, no network).
 * Mirrors LookIntoBitcoin's DCA portfolio tool: recurring buys at bar closes
 * vs a lump-sum buy at the range start, using loaded OHLC bars. */

export interface DcaBar {
  time: number;
  close: number | null;
}

export interface DcaResult {
  buys: number;
  invested: number;
  btc: number;
  lastPrice: number;
  value: number;
  multiple: number;
}

const EMPTY: DcaResult = {
  buys: 0,
  invested: 0,
  btc: 0,
  lastPrice: 0,
  value: 0,
  multiple: 0,
};

function cleanBars(bars: DcaBar[], fromMs: number, toMs: number): DcaBar[] {
  return bars
    .filter((b) => b.time >= fromMs && b.time <= toMs && b.close !== null && Number.isFinite(b.close) && (b.close as number) > 0)
    .sort((a, b) => a.time - b.time);
}

export function simulateDca(
  bars: DcaBar[],
  contributionUsd: number,
  everyDays: number,
  fromMs: number,
  toMs: number,
): DcaResult {
  if (!(contributionUsd > 0) || !(everyDays > 0)) return { ...EMPTY };
  const rows = cleanBars(bars, fromMs, toMs);
  if (rows.length === 0) return { ...EMPTY };
  const stepMs = everyDays * 24 * 60 * 60 * 1000;
  let nextBuy = fromMs;
  let buys = 0;
  let btc = 0;
  for (const r of rows) {
    if (r.time >= nextBuy) {
      btc += contributionUsd / (r.close as number);
      buys += 1;
      nextBuy = r.time + stepMs;
    }
  }
  const invested = buys * contributionUsd;
  const lastPrice = rows[rows.length - 1].close as number;
  const value = btc * lastPrice;
  return { buys, invested, btc, lastPrice, value, multiple: invested > 0 ? value / invested : 0 };
}

export function simulateLumpSum(
  bars: DcaBar[],
  amountUsd: number,
  fromMs: number,
  toMs: number,
): DcaResult {
  if (!(amountUsd > 0)) return { ...EMPTY };
  const rows = cleanBars(bars, fromMs, toMs);
  if (rows.length === 0) return { ...EMPTY };
  const first = rows[0].close as number;
  const lastPrice = rows[rows.length - 1].close as number;
  const btc = amountUsd / first;
  const value = btc * lastPrice;
  return { buys: 1, invested: amountUsd, btc, lastPrice, value, multiple: value / amountUsd };
}
