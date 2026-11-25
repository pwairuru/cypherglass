const UNITS_WITH_SPACE = new Set([
  "sat/vB",
  "sats",
  "WU",
  "bytes",
  "blocks",
  "tx",
  "days",
  "years",
]);

/** Human value with an explicit unit. Used by tooltips and the legend. */
export function formatValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (unit === "USD") {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
    if (abs >= 1) return `$${value.toFixed(2)}`;
    if (abs >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toPrecision(3)}`;
  }
  if (unit === "pct" || unit === "%") return `${value.toFixed(2)}%`;
  if (unit === "BTC") return `${formatNumber(value)} BTC`;
  if (unit === "ratio") return value.toFixed(3);
  if (unit === "score") return value.toFixed(1);
  if (UNITS_WITH_SPACE.has(unit)) return `${formatNumber(value)} ${unit}`;
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
}

/** Compact axis label. Units live in the axis title, so this stays short. */
export function formatAxis(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "";
  if (unit === "USD") {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
    if (abs >= 1) return `$${value.toFixed(0)}`;
    if (abs >= 0.01) return `$${value.toFixed(3)}`;
    return `$${value.toPrecision(2)}`;
  }
  if (unit === "pct" || unit === "%") return `${value.toFixed(0)}%`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(3);
}

export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}k`;
  if (abs >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Null stays null; log axes must never plot non-positive values. */
export function logSafe<T extends { v: number | null }>(points: T[]): T[] {
  return points.map((p) => (p.v !== null && p.v <= 0 ? { ...p, v: null } : p));
}
