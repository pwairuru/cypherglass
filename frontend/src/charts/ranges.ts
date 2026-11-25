export type RangePreset =
  | "1d"
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "ytd"
  | "1y"
  | "2y"
  | "4y"
  | "cycle"
  | "all"
  | "custom";

export interface Range {
  from: string | null;
  to: string | null;
}

export const RANGE_PRESETS: { id: RangePreset; label: string; days?: number }[] = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "1Y", days: 365 },
  { id: "2y", label: "2Y", days: 730 },
  { id: "4y", label: "4Y", days: 1460 },
  { id: "cycle", label: "Cycle" },
  { id: "all", label: "All" },
];

/** Most recent Bitcoin halving, the start of the current cycle. */
export const CYCLE_START = "2024-04-20";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoDateTime(date: Date): string {
  return date.toISOString();
}

function rollingFrom(now: Date, days: number): string {
  return isoDateTime(new Date(now.getTime() - days * 86_400_000));
}

export function resolveRange(preset: RangePreset, now: Date = new Date()): Range {
  switch (preset) {
    case "1d":
      return { from: rollingFrom(now, 1), to: isoDateTime(now) };
    case "1w":
      return { from: rollingFrom(now, 7), to: isoDateTime(now) };
    case "1m":
      return { from: rollingFrom(now, 30), to: isoDateTime(now) };
    case "3m":
      return { from: rollingFrom(now, 90), to: isoDateTime(now) };
    case "6m":
      return { from: rollingFrom(now, 180), to: isoDateTime(now) };
    case "ytd":
      return { from: `${now.getUTCFullYear()}-01-01`, to: isoDateTime(now) };
    case "1y":
      return { from: rollingFrom(now, 365), to: isoDateTime(now) };
    case "2y":
      return { from: rollingFrom(now, 730), to: isoDateTime(now) };
    case "4y":
      return { from: rollingFrom(now, 1460), to: isoDateTime(now) };
    case "cycle":
      return { from: CYCLE_START, to: isoDateTime(now) };
    case "all":
      return { from: null, to: null };
    case "custom":
      return { from: null, to: null };
  }
}

export type Grain = "auto" | "hourly" | "daily" | "weekly" | "monthly";

export function autoGrain(range: RangePreset): Exclude<Grain, "auto"> {
  switch (range) {
    case "1d":
    case "1w":
      return "hourly";
    case "1m":
    case "3m":
    case "6m":
    case "ytd":
    case "1y":
    case "2y":
      return "daily";
    case "4y":
    case "cycle":
      return "weekly";
    case "all":
    case "custom":
      return "monthly";
  }
}

export function isRangePreset(value: string): value is RangePreset {
  return (
    ["1d", "1w", "1m", "3m", "6m", "ytd", "1y", "2y", "4y", "cycle", "all", "custom"] as string[]
  ).includes(value);
}

export function effectiveRange(
  state: { range: RangePreset; from?: string; to?: string },
  now: Date = new Date(),
): Range {
  if (state.range === "custom" && state.from && state.to) {
    return { from: state.from, to: state.to };
  }
  return resolveRange(state.range, now);
}
