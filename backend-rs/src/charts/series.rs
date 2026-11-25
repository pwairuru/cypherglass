use crate::ch::{ChClient, SeriesPoint};
use crate::charts::catalog::{chart, ChartSpec, SeriesSpec};
use crate::charts::downsample::downsample;
use crate::charts::params::ChartParams;
use crate::charts::transform::{apply, Transform};
use crate::error::ApiError;
use crate::metrics::registry::by_id;
use crate::metrics::service::{norm_date, ts_to_ms, OhlcBar};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const DEFAULT_MAX_POINTS: usize = 2000;
const MAX_POINTS_LIMIT: usize = 10_000;
const MAX_SERIES: usize = 8;
const SQL_LIMIT: usize = 20_000;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct SeriesQuery {
    #[serde(default)]
    pub metrics: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub grain: Option<String>,
    #[serde(default)]
    pub max_points: Option<usize>,
    #[serde(default)]
    pub transform: Option<String>,
    #[serde(default)]
    pub params: Option<String>,
    #[serde(default)]
    pub variant: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesMeta {
    pub proxy: bool,
    pub downsampled: bool,
    pub transform: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSeriesOut {
    pub metric: String,
    pub label: String,
    pub unit: String,
    pub axis: String,
    pub style: String,
    pub points: Vec<SeriesPoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bars: Option<Vec<OhlcBar>>,
    pub meta: SeriesMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartSeriesResponse {
    pub chart_id: String,
    pub from: Option<String>,
    pub to: Option<String>,
    pub grain: String,
    pub series: Vec<ChartSeriesOut>,
    pub generated_at: String,
}

pub async fn get_chart_series(
    ch: &ChClient,
    chart_id: &str,
    query: &SeriesQuery,
) -> Result<ChartSeriesResponse, ApiError> {
    let spec = chart(chart_id).ok_or_else(|| ApiError::not_found("Unknown chart"))?;
    let params = ChartParams::parse(query.params.as_deref())?;
    let transform = Transform::parse(query.transform.as_deref())?;
    if let Some(points) = query.max_points {
        if !(100..=MAX_POINTS_LIMIT).contains(&points) {
            return Err(ApiError::unprocessable(format!(
                "max_points must be between 100 and {MAX_POINTS_LIMIT}"
            )));
        }
    }
    let max_points = query.max_points.unwrap_or(DEFAULT_MAX_POINTS);

    let specs = resolve_series_specs(spec, query.metrics.as_deref(), query.variant.as_deref())?;
    let grain = query
        .grain
        .clone()
        .filter(|g| g != "auto" && !g.is_empty())
        .unwrap_or_else(|| default_grain(spec, &specs));

    let mut out = Vec::with_capacity(specs.len());
    for series in specs {
        if series.series_type.as_deref() == Some("ohlc") {
            let mut bars = fetch_ohlc(
                ch,
                &grain,
                query.from.as_deref(),
                query.to.as_deref(),
                max_points,
            )
            .await?;
            if bars.len() > max_points {
                let points: Vec<SeriesPoint> = bars
                    .iter()
                    .map(|b| SeriesPoint {
                        t: b.time.to_string(),
                        v: b.close,
                    })
                    .collect();
                let keep: std::collections::HashSet<String> = downsample(&points, max_points)
                    .into_iter()
                    .map(|p| p.t)
                    .collect();
                bars.retain(|b| keep.contains(&b.time.to_string()));
            }
            let points: Vec<SeriesPoint> = bars
                .iter()
                .filter_map(|b| {
                    b.close.map(|v| SeriesPoint {
                        t: chrono::DateTime::from_timestamp_millis(b.time)
                            .map(|d| d.format("%Y-%m-%dT%H:%M:%SZ").to_string())
                            .unwrap_or_else(|| b.time.to_string()),
                        v: Some(v),
                    })
                })
                .collect();
            out.push(ChartSeriesOut {
                metric: series
                    .close
                    .clone()
                    .unwrap_or_else(|| "price_close_daily".to_string()),
                label: series.label.clone().unwrap_or_else(|| "BTC/USD".into()),
                unit: "USD".into(),
                axis: series.axis.clone(),
                style: "candle".into(),
                points,
                bars: Some(bars),
                meta: SeriesMeta {
                    proxy: false,
                    downsampled: false,
                    transform: "raw".into(),
                    stale_reason: None,
                },
            });
            continue;
        }

        let metric_id = series
            .metric
            .clone()
            .ok_or_else(|| ApiError::unprocessable("series is missing metric"))?;
        let mid = by_id(&metric_id)
            .ok_or_else(|| ApiError::unprocessable(format!("unknown metric {metric_id}")))?;
        if mid.disabled {
            continue;
        }

        let kind = metric_date_kind(mid.sql);
        let from = query.from.clone().unwrap_or_else(|| default_from(kind));
        let to = query.to.clone().unwrap_or_else(|| default_to(kind));
        let from = norm_date(&from, kind)?;
        let to = norm_date(&to, kind)?;
        if from > to {
            return Err(ApiError::unprocessable("from must be <= to"));
        }

        // Metric SQL is ascending. Take the newest rows first, then restore
        // chronological order, so a hard LIMIT cannot silently return 2009
        // when the user asked for All.
        let sql = format!(
            "SELECT * FROM ({}) ORDER BY 1 DESC LIMIT {}",
            mid.sql, SQL_LIMIT
        );
        let params_sql = [("from", from.as_str()), ("to", to.as_str())];
        let mut points = ch
            .query_series(&sql, &params_sql)
            .await
            .map_err(|e| ApiError::bad_gateway(format!("clickhouse unavailable: {}", e.class())))?;
        points.reverse();

        if params.cohort.as_deref().is_some_and(|c| c != "all") {
            // Cohort metrics are addressed by metric id (e.g. sth_sopr) until
            // derived cohort series land; do not silently relabel an aggregate.
            if !metric_id.contains("sth") && !metric_id.contains("lth") {
                return Err(ApiError::unprocessable(
                    "cohort selection is not available for this metric yet",
                ));
            }
        }

        points = maybe_resample(points, mid.id, mid.grain, &grain);
        let before = points.len();
        let points = apply(&points, transform);
        let points = downsample(&points, max_points);
        let downsampled = points.len() < before || before > max_points;

        out.push(ChartSeriesOut {
            metric: metric_id.clone(),
            label: series
                .label
                .clone()
                .unwrap_or_else(|| mid.title.to_string()),
            unit: mid.unit.to_string(),
            axis: series.axis.clone(),
            style: series.style.clone(),
            points,
            bars: None,
            meta: SeriesMeta {
                proxy: metric_id.contains("_proxy"),
                downsampled,
                transform: transform.label().to_string(),
                stale_reason: None,
            },
        });
    }

    let resolved_from = query.from.clone().or_else(|| {
        out.first()
            .and_then(|s| s.points.first().map(|p| p.t.clone()))
    });
    let resolved_to = query.to.clone().or_else(|| {
        out.first()
            .and_then(|s| s.points.last().map(|p| p.t.clone()))
    });

    Ok(ChartSeriesResponse {
        chart_id: spec.id.clone(),
        from: resolved_from,
        to: resolved_to,
        grain,
        series: out,
        generated_at: Utc::now().to_rfc3339(),
    })
}

/// Select series specs from the catalog, optionally overridden by the
/// `metrics` query (variant tabs and the series picker).
pub fn resolve_series_specs(
    spec: &ChartSpec,
    metrics: Option<&str>,
    variant_id: Option<&str>,
) -> Result<Vec<SeriesSpec>, ApiError> {
    let variant_metrics: Option<HashSet<String>> = variant_id
        .and_then(|id| spec.variants.iter().find(|v| v.id == id))
        .map(|v| v.series.iter().cloned().collect());

    if let Some(raw) = metrics {
        let ids: Vec<String> = raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        if ids.len() > MAX_SERIES {
            return Err(ApiError::unprocessable(format!(
                "at most {MAX_SERIES} series per chart request"
            )));
        }
        if ids.is_empty() {
            return Err(ApiError::unprocessable("metrics must not be empty"));
        }

        let allowed: HashSet<&str> = spec
            .metrics
            .iter()
            .map(String::as_str)
            .chain(spec.series.iter().filter_map(|s| s.metric.as_deref()))
            .chain(std::iter::once("price_close_daily"))
            .collect();

        let mut out = Vec::with_capacity(ids.len());
        for id in ids {
            if by_id(&id).is_none() {
                return Err(ApiError::unprocessable(format!("unknown metric {id}")));
            }
            if !allowed.contains(id.as_str()) {
                return Err(ApiError::unprocessable(format!(
                    "metric {id} is not part of chart {}",
                    spec.id
                )));
            }
            if let Some(existing) = spec
                .series
                .iter()
                .find(|s| s.metric.as_deref() == Some(&id))
            {
                out.push(existing.clone());
            } else {
                out.push(SeriesSpec {
                    series_type: None,
                    open: None,
                    high: None,
                    low: None,
                    close: None,
                    volume: None,
                    metric: Some(id.clone()),
                    label: by_id(&id).map(|m| m.title.to_string()),
                    axis: "left".into(),
                    style: "line".into(),
                    color: None,
                    width: None,
                    dash: None,
                    hidden_by_default: None,
                    transform: None,
                });
            }
        }
        return Ok(out);
    }

    let mode_variant = variant_id.is_some_and(|id| {
        matches!(
            id,
            "percent"
                | "absolute"
                | "realized"
                | "btc"
                | "usd"
                | "cumulative"
                | "count"
                | "share"
                | "supply"
                | "ratio"
                | "default"
                | "unified"
                | "details"
                | "candles"
                | "line"
        )
    });

    let mut out = Vec::new();
    for series in &spec.series {
        if let (Some(vm), Some(metric)) = (&variant_metrics, series.metric.as_deref()) {
            if mode_variant {
                out.push(series.clone());
                continue;
            }
            // Keep OHLC/price and heat context overlays; filter the primary
            // metric series to the selected variant.
            let context_axis =
                series.axis == "right" || series.axis == "color" || series.axis == "y";
            if !vm.contains(metric) && !context_axis {
                continue;
            }
        }
        out.push(series.clone());
    }

    if variant_id == Some("line") {
        out.retain(|s| s.axis != "color");
    }

    if let Some(vm) = &variant_metrics {
        for metric in vm {
            if out
                .iter()
                .any(|s| s.metric.as_deref() == Some(metric.as_str()))
            {
                continue;
            }
            let Some(m) = by_id(metric) else { continue };
            let axis = if m.unit == "USD" && spec.axes.iter().any(|a| a.id == "right") {
                "right"
            } else {
                "left"
            };
            out.push(SeriesSpec {
                series_type: None,
                open: None,
                high: None,
                low: None,
                close: None,
                volume: None,
                metric: Some(metric.clone()),
                label: Some(m.title.to_string()),
                axis: axis.into(),
                style: "line".into(),
                color: None,
                width: None,
                dash: None,
                hidden_by_default: None,
                transform: None,
            });
        }
    }

    if out.is_empty() {
        if let Some(default) = spec.default_metric.clone() {
            out.push(SeriesSpec {
                series_type: None,
                open: None,
                high: None,
                low: None,
                close: None,
                volume: None,
                metric: Some(default.clone()),
                label: by_id(&default).map(|m| m.title.to_string()),
                axis: "left".into(),
                style: "line".into(),
                color: None,
                width: None,
                dash: None,
                hidden_by_default: None,
                transform: None,
            });
        }
    }

    Ok(out)
}

fn default_grain(spec: &ChartSpec, series: &[SeriesSpec]) -> String {
    if let Some(metric) = series.iter().find_map(|s| s.metric.as_deref()) {
        if let Some(m) = by_id(metric) {
            return m.grain.to_string();
        }
    }
    if spec.data_freshness == "hourly" {
        "hourly".into()
    } else {
        "daily".into()
    }
}

fn metric_date_kind(sql: &str) -> &'static str {
    if sql.contains("{from:DateTime}") {
        "DateTime"
    } else {
        "Date"
    }
}

fn default_from(kind: &str) -> String {
    if kind == "DateTime" {
        "2009-01-03 00:00:00".into()
    } else {
        "2009-01-03".into()
    }
}

fn default_to(kind: &str) -> String {
    if kind == "DateTime" {
        Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        Utc::now().format("%Y-%m-%d").to_string()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Aggregation {
    Mean,
    Sum,
    Last,
}

fn aggregation_for(metric_id: &str) -> Aggregation {
    let id = metric_id.to_ascii_lowercase();
    if id.contains("cumulative")
        || id.contains("supply")
        || id.contains("height")
        || id.contains("realized")
        || id.contains("market_cap")
        || id.contains("thermocap")
        || id.contains("price")
        || id.contains("difficulty")
        || id.contains("hashrate")
        || id.contains("open_interest")
        || id.contains("hodl")
    {
        Aggregation::Last
    } else if id.contains("fees")
        || id.contains("tx_count")
        || id.contains("blocks_")
        || id.contains("transfer_count")
        || id.contains("large_tx")
        || id.contains("miner_revenue")
        || id.contains("subsidy")
        || id.contains("reward")
        || id.contains("etf_flow")
        || id.contains("fee_bucket")
    {
        Aggregation::Sum
    } else {
        Aggregation::Mean
    }
}

fn maybe_resample(
    points: Vec<SeriesPoint>,
    metric_id: &str,
    native: &str,
    requested: &str,
) -> Vec<SeriesPoint> {
    let rank = |grain: &str| match grain {
        "hourly" => 0,
        "daily" => 1,
        "weekly" => 2,
        "monthly" => 3,
        _ => 1,
    };
    if requested == "auto" || requested.is_empty() || rank(requested) <= rank(native) {
        return points;
    }
    let bucket: fn(&str) -> String = match requested {
        "weekly" => week_key,
        "monthly" => month_key,
        _ => return points,
    };
    let aggregation = aggregation_for(metric_id);

    let mut out: Vec<SeriesPoint> = Vec::new();
    let mut current_key: Option<String> = None;
    let mut sum = 0.0;
    let mut count = 0usize;
    let mut last = 0.0;
    for point in points {
        let key = bucket(&point.t);
        if current_key.as_deref() != Some(key.as_str()) {
            if let Some(prev) = current_key.take() {
                if count > 0 {
                    out.push(SeriesPoint {
                        t: prev,
                        v: Some(match aggregation {
                            Aggregation::Mean => sum / count as f64,
                            Aggregation::Sum => sum,
                            Aggregation::Last => last,
                        }),
                    });
                }
            }
            current_key = Some(key);
            sum = 0.0;
            count = 0;
        }
        if let Some(v) = point.v {
            sum += v;
            count += 1;
            last = v;
        }
    }
    if let Some(prev) = current_key {
        if count > 0 {
            out.push(SeriesPoint {
                t: prev,
                v: Some(match aggregation {
                    Aggregation::Mean => sum / count as f64,
                    Aggregation::Sum => sum,
                    Aggregation::Last => last,
                }),
            });
        }
    }
    out
}

fn month_key(t: &str) -> String {
    match t.get(0..7) {
        Some(month) => format!("{month}-01"),
        None => t.to_string(),
    }
}

fn week_key(t: &str) -> String {
    use chrono::{Datelike, NaiveDate};
    let date = t
        .get(0..10)
        .and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());
    match date {
        Some(d) => {
            let weekday = d.weekday().num_days_from_monday() as i64;
            (d - chrono::Duration::days(weekday))
                .format("%Y-%m-%d")
                .to_string()
        }
        None => t.to_string(),
    }
}

pub async fn fetch_ohlc(
    ch: &ChClient,
    grain: &str,
    from: Option<&str>,
    to: Option<&str>,
    max_points: usize,
) -> Result<Vec<OhlcBar>, ApiError> {
    let (kind, sql) = match grain {
        "hourly" => (
            "DateTime",
            "SELECT ts, open, high, low, close, volume FROM bitcoin.price_ohlc_hourly WHERE symbol = 'BTCUSDT' AND ts BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY ts",
        ),
        "weekly" => (
            "Date",
            "SELECT toStartOfWeek(day) AS bucket, argMin(open, day), max(high), min(low), argMax(close, day), sum(volume) FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} GROUP BY bucket ORDER BY bucket",
        ),
        "monthly" => (
            "Date",
            "SELECT toStartOfMonth(day) AS bucket, argMin(open, day), max(high), min(low), argMax(close, day), sum(volume) FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} GROUP BY bucket ORDER BY bucket",
        ),
        _ => (
            "Date",
            "SELECT day, open, high, low, close, volume FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} ORDER BY day",
        ),
    };
    let from = norm_date(from.unwrap_or(&default_from(kind)), kind)?;
    let to = norm_date(to.unwrap_or(&default_to(kind)), kind)?;
    if from > to {
        return Err(ApiError::unprocessable("from must be <= to"));
    }
    let params = [("from", from.as_str()), ("to", to.as_str())];
    let sql = format!("SELECT * FROM ({sql}) ORDER BY 1 DESC LIMIT {SQL_LIMIT}");
    let mut rows = ch
        .query(&sql, &params)
        .await
        .map_err(|e| ApiError::bad_gateway(format!("clickhouse unavailable: {}", e.class())))?;
    rows.reverse();

    let mut bars = Vec::with_capacity(rows.len());
    for row in rows {
        if row.len() < 6 {
            continue;
        }
        bars.push(OhlcBar {
            time: ts_to_ms(&row[0])?,
            open: crate::ch::value_to_f64_opt(&row[1]),
            high: crate::ch::value_to_f64_opt(&row[2]),
            low: crate::ch::value_to_f64_opt(&row[3]),
            close: crate::ch::value_to_f64_opt(&row[4]),
            volume: crate::ch::value_to_f64_opt(&row[5]),
        });
    }
    if bars.len() > max_points {
        let points: Vec<SeriesPoint> = bars
            .iter()
            .map(|b| SeriesPoint {
                t: b.time.to_string(),
                v: b.close,
            })
            .collect();
        let keep: std::collections::HashSet<String> = downsample(&points, max_points)
            .into_iter()
            .map(|p| p.t)
            .collect();
        bars.retain(|b| keep.contains(&b.time.to_string()));
    }
    Ok(bars)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_variant_metrics() {
        let spec = chart("valuation.mvrv").unwrap();
        let specs = resolve_series_specs(spec, Some("mvrv_z_daily"), None).unwrap();
        assert_eq!(specs.len(), 1);
        assert_eq!(specs[0].metric.as_deref(), Some("mvrv_z_daily"));
    }

    #[test]
    fn variant_adds_metric_missing_from_default_series() {
        let spec = chart("valuation.mvrv").unwrap();
        let specs = resolve_series_specs(spec, None, Some("z")).unwrap();
        let metrics: Vec<_> = specs.iter().filter_map(|s| s.metric.as_deref()).collect();
        assert!(metrics.contains(&"mvrv_z_daily"));
        assert!(metrics.contains(&"price_close_daily"));
    }

    #[test]
    fn rejects_metric_outside_chart() {
        let spec = chart("valuation.mvrv").unwrap();
        let err = resolve_series_specs(spec, Some("sopr_daily"), None).unwrap_err();
        assert_eq!(err.status, 422);
    }

    #[test]
    fn caps_series_count() {
        let spec = chart("price.btc").unwrap();
        let eight = "price_sma20_daily,price_sma50_daily,price_sma200_daily,price_ema21_daily,price_close_daily,price_high_daily,price_low_daily,price_open_daily,price_volume_daily";
        let err = resolve_series_specs(spec, Some(eight), None).unwrap_err();
        assert_eq!(err.status, 422);
    }

    #[test]
    fn resamples_daily_to_weekly_by_mean() {
        let pts = vec![
            SeriesPoint {
                t: "2024-01-01".into(),
                v: Some(1.0),
            },
            SeriesPoint {
                t: "2024-01-02".into(),
                v: Some(3.0),
            },
            SeriesPoint {
                t: "2024-01-08".into(),
                v: Some(5.0),
            },
        ];
        let out = maybe_resample(pts, "active_addresses_daily", "daily", "weekly");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].v, Some(2.0));
        assert_eq!(out[1].v, Some(5.0));
    }

    #[test]
    fn sums_flow_metrics_and_keeps_last_for_cumulative() {
        let pts = vec![
            SeriesPoint {
                t: "2024-01-01".into(),
                v: Some(1.0),
            },
            SeriesPoint {
                t: "2024-01-02".into(),
                v: Some(3.0),
            },
        ];
        let sum = maybe_resample(pts.clone(), "fees_daily", "daily", "weekly");
        assert_eq!(sum[0].v, Some(4.0));
        let last = maybe_resample(pts, "supply_daily", "daily", "weekly");
        assert_eq!(last[0].v, Some(3.0));
    }

    #[test]
    fn monthly_bucket_is_a_real_date() {
        let pts = vec![SeriesPoint {
            t: "2024-01-15".into(),
            v: Some(1.0),
        }];
        let out = maybe_resample(pts, "active_addresses_daily", "daily", "monthly");
        assert_eq!(out[0].t, "2024-01-01");
    }

    #[test]
    fn does_not_resample_finer() {
        let pts = vec![SeriesPoint {
            t: "2024-01-01".into(),
            v: Some(1.0),
        }];
        assert_eq!(
            maybe_resample(pts.clone(), "fees_daily", "daily", "hourly").len(),
            1
        );
    }
}
