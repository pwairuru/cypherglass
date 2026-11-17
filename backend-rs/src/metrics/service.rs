use crate::ch::{value_to_f64_opt, ChClient, SeriesPoint};
use crate::error::ApiError;
use crate::metrics::registry::by_id;
use chrono::{NaiveDate, NaiveDateTime};
use serde::Serialize;

/// Normalise a frontend ISO date string to the ClickHouse parameter type.
///
/// The frontend sends `Date.toISOString()` (full datetime) for every grain;
/// `{from:Date}` parameters reject that with code 457, so trim to date.
/// DateTime parameters get `YYYY-MM-DD HH:MM:SS`.
pub fn norm_date(raw: &str, kind: &str) -> Result<String, ApiError> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(ApiError::unprocessable(format!("Bad date: {raw:?}")));
    }

    if s.contains('T') {
        let dt = parse_iso(s)?;
        if kind == "Date" {
            return Ok(dt.date_naive().to_string());
        }
        return Ok(dt.format("%Y-%m-%d %H:%M:%S").to_string());
    }

    if kind == "Date" {
        let d = NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .map_err(|_| ApiError::unprocessable(format!("Bad date: {raw:?}")))?;
        return Ok(d.to_string());
    }

    // DateTime
    if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Ok(dt.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable(format!("Bad date: {raw:?}")))?;
    Ok(format!("{} 00:00:00", d))
}

fn parse_iso(s: &str) -> Result<chrono::DateTime<chrono::Utc>, ApiError> {
    let normalized = if let Some(stripped) = s.strip_suffix('Z') {
        format!("{}+00:00", stripped)
    } else {
        s.to_string()
    };
    normalized
        .parse::<chrono::DateTime<chrono::Utc>>()
        .map_err(|_| ApiError::unprocessable(format!("Bad date: {s:?}")))
}

/// Bound query ranges: hourly max 370 days, daily max 5 years.
pub fn check_range(f: &str, t: &str, kind: &str) -> Result<(), ApiError> {
    let (df, dt) = if kind == "DateTime" {
        let df = match NaiveDateTime::parse_from_str(f, "%Y-%m-%d %H:%M:%S") {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
        let dt = match NaiveDateTime::parse_from_str(t, "%Y-%m-%d %H:%M:%S") {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
        (df, dt)
    } else {
        let df = match NaiveDate::parse_from_str(f, "%Y-%m-%d") {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
        let dt = match NaiveDate::parse_from_str(t, "%Y-%m-%d") {
            Ok(v) => v,
            Err(_) => return Ok(()),
        };
        (df.and_hms_opt(0, 0, 0).unwrap(), dt.and_hms_opt(0, 0, 0).unwrap())
    };

    let days = (dt - df).num_days();
    let max_days: i64 = if kind == "DateTime" { 370 } else { 1826 };
    if days < 0 || days > max_days {
        return Err(ApiError::unprocessable(format!(
            "range too large: max {max_days} days"
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct SeriesOut {
    pub points: Vec<SeriesPoint>,
    pub unit: &'static str,
    pub stale: bool,
}

/// Compute the stale flag from a series result.
///
/// A series is stale when it has no points or any point value is NULL.
pub fn series_stale(points: &[SeriesPoint]) -> bool {
    points.is_empty() || points.iter().any(|p| p.v.is_none())
}

pub async fn get_series(
    ch: &ChClient,
    metric_id: &str,
    from: &str,
    to: &str,
) -> Result<SeriesOut, ApiError> {
    let m = by_id(metric_id).ok_or_else(|| ApiError::not_found("Unknown metric"))?;
    if m.disabled {
        return Err(ApiError::not_found("Unknown metric"));
    }

    let kind = if m.sql.contains("{from:DateTime}") {
        "DateTime"
    } else {
        "Date"
    };

    let f = norm_date(from, kind)?;
    let t = norm_date(to, kind)?;

    if f > t {
        return Err(ApiError::unprocessable("from must be <= to"));
    }
    check_range(&f, &t, kind)?;

    let sql = format!("{} LIMIT 5000", m.sql);
    let params = [("from", f.as_str()), ("to", t.as_str())];

    let points = ch
        .query_series(&sql, &params)
        .await
        .map_err(|e| ApiError::bad_gateway(format!("clickhouse unavailable: {}", e.class())))?;

    let stale = series_stale(&points);

    Ok(SeriesOut {
        points,
        unit: m.unit,
        stale,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct CoverageOut {
    pub min_day: String,
    pub max_day: String,
}

pub async fn get_coverage(ch: &ChClient) -> Result<CoverageOut, ApiError> {
    let sql = "SELECT min(day), max(day) FROM bitcoin.mv_blocks_daily";
    let rows = ch
        .query(sql, &[])
        .await
        .map_err(|e| ApiError::bad_gateway(format!("clickhouse unavailable: {}", e.class())))?;
    parse_coverage_rows(rows)
}

pub fn parse_coverage_rows(rows: Vec<Vec<serde_json::Value>>) -> Result<CoverageOut, ApiError> {
    if rows.is_empty() {
        return Err(ApiError::not_found("No coverage yet"));
    }
    let row = &rows[0];
    if row.len() < 2 || row[0].is_null() {
        return Err(ApiError::not_found("No coverage yet"));
    }

    Ok(CoverageOut {
        min_day: value_to_iso(&row[0]),
        max_day: value_to_iso(&row[1]),
    })
}

fn value_to_iso(v: &serde_json::Value) -> String {
    if let Some(s) = v.as_str() {
        return s.to_string();
    }
    v.to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct OhlcBar {
    pub time: i64,
    pub open: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub close: Option<f64>,
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OhlcOut {
    pub bars: Vec<OhlcBar>,
}

pub async fn get_ohlc(
    ch: &ChClient,
    grain: &str,
    from: &str,
    to: &str,
) -> Result<OhlcOut, ApiError> {
    let (kind, sql) = if grain == "hourly" {
        (
            "DateTime",
            "SELECT ts, open, high, low, close, volume FROM bitcoin.price_ohlc_hourly WHERE symbol = 'BTCUSDT' AND ts BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY ts LIMIT 5000",
        )
    } else if grain == "daily" {
        (
            "Date",
            "SELECT day, open, high, low, close, volume FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} ORDER BY day LIMIT 5000",
        )
    } else {
        return Err(ApiError::not_found("Unknown grain"));
    };

    let f = norm_date(from, kind)?;
    let t = norm_date(to, kind)?;

    if f > t {
        return Err(ApiError::unprocessable("from must be <= to"));
    }
    check_range(&f, &t, kind)?;

    let params = [("from", f.as_str()), ("to", t.as_str())];
    let rows = ch
        .query(sql, &params)
        .await
        .map_err(|e| ApiError::bad_gateway(format!("clickhouse unavailable: {}", e.class())))?;

    let mut bars = Vec::with_capacity(rows.len());
    for row in rows {
        if row.len() < 6 {
            continue;
        }
        bars.push(OhlcBar {
            time: ts_to_ms(&row[0])?,
            open: value_to_f64_opt(&row[1]),
            high: value_to_f64_opt(&row[2]),
            low: value_to_f64_opt(&row[3]),
            close: value_to_f64_opt(&row[4]),
            volume: value_to_f64_opt(&row[5]),
        });
    }

    Ok(OhlcOut { bars })
}

/// Convert a CH Date/DateTime/string/int timestamp to epoch milliseconds.
pub fn ts_to_ms(ts: &serde_json::Value) -> Result<i64, ApiError> {
    if let Some(s) = ts.as_str() {
        let s = s.trim();
        if s.contains('T') {
            let dt = parse_iso(s)?;
            return Ok(dt.timestamp_millis());
        }
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
            return Ok(dt.and_utc().timestamp_millis());
        }
        if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
            let dt = d.and_hms_opt(0, 0, 0).unwrap();
            return Ok(dt.and_utc().timestamp_millis());
        }
        if let Ok(n) = s.parse::<i64>() {
            return Ok(n);
        }
        return Err(ApiError::unprocessable(format!("Bad date: {ts:?}")));
    }

    if let Some(n) = ts.as_i64() {
        return Ok(n);
    }
    if let Some(n) = ts.as_u64() {
        return Ok(n as i64);
    }
    if let Some(n) = ts.as_f64() {
        return Ok(n as i64);
    }

    Err(ApiError::unprocessable(format!("Bad date: {ts:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn norm_trims_iso_to_date() {
        assert_eq!(
            norm_date("2023-01-15T08:30:00.000Z", "Date").unwrap(),
            "2023-01-15"
        );
    }

    #[test]
    fn norm_datetime_keeps_time() {
        assert_eq!(
            norm_date("2023-01-15T08:30:45Z", "DateTime").unwrap(),
            "2023-01-15 08:30:45"
        );
    }

    #[test]
    fn from_gt_to_422() {
        let err = check_range("2023-01-15", "2023-01-10", "Date").unwrap_err();
        assert_eq!(err.status, 422);
        assert!(err.message.contains("range too large"));
    }

    #[test]
    fn hourly_over_370d_422() {
        let err = check_range("2023-01-01 00:00:00", "2024-01-15 00:00:00", "DateTime").unwrap_err();
        assert_eq!(err.status, 422);
        assert!(err.message.contains("370"));
    }

    #[test]
    fn daily_over_1826d_422() {
        let err = check_range("2018-01-01", "2023-01-15", "Date").unwrap_err();
        assert_eq!(err.status, 422);
        assert!(err.message.contains("1826"));
    }

    #[test]
    fn null_value_sets_stale() {
        let points = vec![
            SeriesPoint {
                t: "2023-01-01".into(),
                v: Some(1.0),
            },
            SeriesPoint {
                t: "2023-01-02".into(),
                v: None,
            },
        ];
        assert!(series_stale(&points));
    }

    #[test]
    fn empty_series_is_stale() {
        assert!(series_stale(&[]));
    }
}
