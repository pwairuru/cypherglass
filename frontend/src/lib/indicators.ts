export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0) return values.map(() => null);
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let s = 0;
    for (let k = i + 1 - period; k <= i; k++) s += values[k];
    return s / period;
  });
}

export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev = values[0] ?? 0;
  values.forEach((v, i) => {
    if (i + 1 < period) { out.push(i === 0 ? v : null); if (i === 0) prev = v; return; }
    prev = i + 1 === period ? values.slice(0, period).reduce((a, b) => a + b, 0) / period : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length <= period || period <= 0) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: number[]): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const macdLine: (number | null)[] = values.map((_, i) =>
    fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null,
  );
  const defined: number[] = [];
  const idx: number[] = [];
  macdLine.forEach((v, i) => {
    if (v != null) {
      defined.push(v);
      idx.push(i);
    }
  });
  const signalLine: (number | null)[] = values.map(() => null);
  if (defined.length > 0) {
    const sig = ema(defined, 9);
    sig.forEach((v, j) => {
      if (v != null) signalLine[idx[j]] = v;
    });
  }
  const histogram: (number | null)[] = values.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null
      ? (macdLine[i] as number) - (signalLine[i] as number)
      : null,
  );
  return { macdLine, signalLine, histogram };
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(values, period);
  const upper: (number | null)[] = values.map(() => null);
  const lower: (number | null)[] = values.map(() => null);
  values.forEach((_, i) => {
    if (i + 1 < period || middle[i] == null) return;
    const mean = middle[i] as number;
    let sumSq = 0;
    for (let k = i + 1 - period; k <= i; k++) sumSq += (values[k] - mean) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  });
  return { upper, middle, lower };
}
