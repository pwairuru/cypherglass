use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("catalog.json");

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub version: u32,
    pub counts: CatalogCounts,
    #[serde(default)]
    pub charts: Vec<ChartSpec>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCounts {
    pub charts: usize,
    pub existing_charts: usize,
    pub new_charts: usize,
    pub metrics: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSpec {
    pub id: String,
    pub title: String,
    pub category: String,
    pub status: String,
    #[serde(default = "default_implementation")]
    pub implementation: String,
    pub phase: String,
    pub priority: String,
    pub question: String,
    #[serde(default)]
    pub parity: Vec<String>,
    pub archetype: String,
    #[serde(default)]
    pub chart_types: Vec<String>,
    #[serde(default)]
    pub panes: Vec<String>,
    #[serde(default)]
    pub axes: Vec<AxisSpec>,
    #[serde(default)]
    pub metrics: Vec<String>,
    #[serde(default)]
    pub legacy_metrics: Vec<String>,
    #[serde(default)]
    pub disabled_metrics: Vec<String>,
    #[serde(default)]
    pub new_metrics: Vec<String>,
    #[serde(default)]
    pub default_metric: Option<String>,
    #[serde(default)]
    pub series: Vec<SeriesSpec>,
    #[serde(default)]
    pub variants: Vec<VariantSpec>,
    #[serde(default)]
    pub controls: Vec<String>,
    #[serde(default)]
    pub annotations: Vec<String>,
    #[serde(default)]
    pub expected: Vec<String>,
    #[serde(default)]
    pub acceptance: Vec<String>,
    #[serde(default)]
    pub data_freshness: String,
    #[serde(default)]
    pub data_requirements: Option<String>,
}

fn default_implementation() -> String {
    "not_started".to_string()
}

fn default_axis() -> String {
    "left".to_string()
}

fn default_style() -> String {
    "line".to_string()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AxisSpec {
    pub id: String,
    pub unit: String,
    pub scale: String,
    #[serde(default)]
    pub min: Option<serde_json::Value>,
    #[serde(default)]
    pub max: Option<serde_json::Value>,
    #[serde(default)]
    pub decimals: Option<u32>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSpec {
    #[serde(default, rename = "type")]
    pub series_type: Option<String>,
    #[serde(default)]
    pub open: Option<String>,
    #[serde(default)]
    pub high: Option<String>,
    #[serde(default)]
    pub low: Option<String>,
    #[serde(default)]
    pub close: Option<String>,
    #[serde(default)]
    pub volume: Option<String>,
    #[serde(default)]
    pub metric: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default = "default_axis")]
    pub axis: String,
    #[serde(default = "default_style")]
    pub style: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub dash: Option<String>,
    #[serde(default)]
    pub hidden_by_default: Option<bool>,
    #[serde(default)]
    pub transform: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantSpec {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub series: Vec<String>,
    #[serde(default)]
    pub cohort: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

/// Summary returned by the catalog index.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSummary<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub category: &'a str,
    pub status: &'a str,
    pub implementation: &'a str,
    pub phase: &'a str,
    pub priority: &'a str,
    pub question: &'a str,
    pub archetype: &'a str,
    pub metrics: &'a [String],
    pub default_metric: Option<&'a str>,
    pub new_metrics: &'a [String],
    pub controls: &'a [String],
}

impl ChartSpec {
    pub fn summary(&self) -> ChartSummary<'_> {
        ChartSummary {
            id: &self.id,
            title: &self.title,
            category: &self.category,
            status: &self.status,
            implementation: &self.implementation,
            phase: &self.phase,
            priority: &self.priority,
            question: &self.question,
            archetype: &self.archetype,
            metrics: &self.metrics,
            default_metric: self.default_metric.as_deref(),
            new_metrics: &self.new_metrics,
            controls: &self.controls,
        }
    }

    /// True when the chart only needs metrics that exist in the registry.
    pub fn has_ingested_data(&self) -> bool {
        self.new_metrics.is_empty()
    }
}

static CATALOG: OnceLock<Catalog> = OnceLock::new();

pub fn catalog() -> &'static Catalog {
    CATALOG.get_or_init(|| {
        serde_json::from_str(CATALOG_JSON).expect("generated chart catalog must be valid JSON")
    })
}

pub fn charts() -> &'static [ChartSpec] {
    &catalog().charts
}

pub fn chart(id: &str) -> Option<&'static ChartSpec> {
    charts().iter().find(|c| c.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::registry::by_id;
    use std::collections::HashSet;

    #[test]
    fn catalog_parses_and_counts_match() {
        let c = catalog();
        assert_eq!(c.charts.len(), 109);
        assert_eq!(c.counts.charts, c.charts.len());
        assert_eq!(
            c.charts.iter().filter(|x| x.status == "existing").count(),
            68
        );
        assert_eq!(c.charts.iter().filter(|x| x.status == "new").count(), 41);
    }

    #[test]
    fn every_referenced_metric_exists() {
        let mut covered = HashSet::new();
        for c in charts() {
            for m in &c.metrics {
                assert!(
                    by_id(m).is_some(),
                    "{} references unknown metric {}",
                    c.id,
                    m
                );
                covered.insert(m.as_str());
            }
            for s in &c.series {
                if let Some(m) = s.metric.as_deref() {
                    assert!(by_id(m).is_some(), "{} series references {}", c.id, m);
                }
                for m in [
                    s.open.as_deref(),
                    s.high.as_deref(),
                    s.low.as_deref(),
                    s.close.as_deref(),
                    s.volume.as_deref(),
                ]
                .into_iter()
                .flatten()
                {
                    assert!(by_id(m).is_some(), "{} OHLC references {}", c.id, m);
                }
            }
            for v in &c.variants {
                for m in &v.series {
                    assert!(by_id(m).is_some(), "{} variant references {}", c.id, m);
                }
            }
        }
        assert_eq!(covered.len(), 267);
    }

    #[test]
    fn lookup_works() {
        assert_eq!(
            chart("valuation.mvrv").unwrap().title,
            "MVRV / Z-Score / Momentum"
        );
        assert!(chart("nope").is_none());
    }

    #[test]
    fn every_chart_has_axes_or_is_composite() {
        for c in charts() {
            let composite = matches!(c.archetype.as_str(), "table" | "dashboard_grid");
            if !composite {
                assert!(!c.axes.is_empty(), "{} has no axes", c.id);
            }
        }
    }
}
