import { CATALOG } from "./generated/catalog";
import type { ChartSpec, ChartSummary } from "./types";

const byId = new Map<string, ChartSpec>(CATALOG.map((chart) => [chart.id, chart]));

export function getChart(id: string): ChartSpec | undefined {
  return byId.get(id);
}

export function listCharts(): ChartSummary[] {
  return CATALOG.map(toSummary);
}

export function chartsByCategory(): Record<string, ChartSummary[]> {
  const groups: Record<string, ChartSummary[]> = {};
  for (const chart of CATALOG) {
    (groups[chart.category] ??= []).push(toSummary(chart));
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return groups;
}

export function chartCategories(): string[] {
  return Object.keys(chartsByCategory()).sort();
}

export function toSummary(chart: ChartSpec): ChartSummary {
  return {
    id: chart.id,
    title: chart.title,
    category: chart.category,
    status: chart.status,
    implementation: chart.implementation,
    phase: chart.phase,
    priority: chart.priority,
    question: chart.question,
    archetype: chart.archetype,
    metrics: chart.metrics,
    defaultMetric: chart.defaultMetric,
    newMetrics: chart.newMetrics,
    controls: chart.controls,
  };
}
