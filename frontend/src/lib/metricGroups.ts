export interface GroupableMetric {
  id: string;
  title: string;
  category?: string;
  unit?: string;
  interval?: string;
  disabled?: boolean;
  description?: string;
}

export interface MetricGroup {
  key: string;
  label: string;
  variants: GroupableMetric[];
}

const LEGACY_IDS = new Set([
  "block_stats_daily",
  "tx_volume_hourly",
  "address_activity_daily",
]);

const GRAIN_SUFFIXES = ["_hourly", "_daily", "_weekly"] as const;

export function grainOf(id: string): string {
  for (const s of GRAIN_SUFFIXES) {
    if (id.endsWith(s)) return s.slice(1);
  }
  return "single";
}

function baseKey(id: string): string {
  for (const s of GRAIN_SUFFIXES) {
    if (id.endsWith(s)) return id.slice(0, -s.length);
  }
  return id;
}

function baseLabel(title: string): string {
  const i = title.indexOf(" / ");
  return i > 0 ? title.slice(0, i) : title;
}

const GRAIN_ORDER = ["hourly", "daily", "weekly", "single"];

export const CATEGORY_ORDER = [
  "price",
  "valuation",
  "profitability",
  "risk",
  "cycle",
  "supply",
  "flow",
  "fees",
  "mining",
  "network",
  "addresses",
  "script",
  "issuance",
  "other",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  price: "Price",
  valuation: "Valuation",
  profitability: "Profitability",
  risk: "Risk",
  cycle: "Cycle bands",
  supply: "Supply and HODL",
  flow: "Flow and volume",
  fees: "Fees and transactions",
  mining: "Mining",
  network: "Network and blocks",
  addresses: "Addresses and outputs",
  script: "Script types",
  issuance: "Issuance and halving",
  onchain: "Other",
  other: "Other",
};

function categoryOf(group: MetricGroup): string {
  const counts = new Map<string, number>();
  for (const v of group.variants) {
    const c = v.category ?? "other";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = "other";
  let bestN = -1;
  for (const [c, n] of counts) {
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  if (best === "onchain") return "other";
  return CATEGORY_LABELS[best] ? best : "other";
}

export interface CategoryGroup {
  category: string;
  label: string;
  groups: MetricGroup[];
}

export function groupByCategory(metrics: GroupableMetric[]): CategoryGroup[] {
  const flat = groupMetrics(metrics);
  const byCat = new Map<string, MetricGroup[]>();
  for (const g of flat) {
    const c = categoryOf(g);
    const arr = byCat.get(c);
    if (arr) arr.push(g);
    else byCat.set(c, [g]);
  }
  const out: CategoryGroup[] = [];
  for (const c of CATEGORY_ORDER) {
    const groups = byCat.get(c);
    if (!groups || groups.length === 0) continue;
    groups.sort((a, b) => a.label.localeCompare(b.label));
    out.push({ category: c, label: CATEGORY_LABELS[c] ?? c, groups });
  }
  // Any unknown category not in the order still shows, at the end.
  for (const [c, groups] of byCat) {
    if ((CATEGORY_ORDER as readonly string[]).includes(c)) continue;
    groups.sort((a, b) => a.label.localeCompare(b.label));
    out.push({ category: c, label: CATEGORY_LABELS[c] ?? c, groups });
  }
  return out;
}

export function groupMetrics(metrics: GroupableMetric[]): MetricGroup[] {
  const seen = new Map<string, MetricGroup>();
  for (const m of metrics) {
    if (LEGACY_IDS.has(m.id)) continue;
    const key = baseKey(m.id);
    const g = seen.get(key);
    if (g) {
      g.variants.push(m);
    } else {
      seen.set(key, { key, label: baseLabel(m.title), variants: [m] });
    }
  }
  const groups = [...seen.values()];
  for (const g of groups) {
    if (g.variants.length > 1) {
      g.label = baseLabel(g.variants[0].title);
      g.variants.sort(
        (a, b) => GRAIN_ORDER.indexOf(grainOf(a.id)) - GRAIN_ORDER.indexOf(grainOf(b.id)),
      );
    } else {
      g.label = g.variants[0].title;
    }
  }
  return groups;
}
