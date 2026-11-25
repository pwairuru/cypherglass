use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::auth::routes::CurrentUser;
use crate::charts::catalog::{catalog, chart};
use crate::charts::series::{get_chart_series, SeriesQuery};
use crate::error::ApiError;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/charts", axum::routing::get(index))
        .route("/api/v1/charts/{chart_id}", axum::routing::get(spec))
        .route(
            "/api/v1/charts/{chart_id}/series",
            axum::routing::get(series),
        )
        .route(
            "/api/v1/charts/{chart_id}/series.csv",
            axum::routing::get(series_csv),
        )
        .route("/api/v1/ohlc/{grain}", axum::routing::get(ohlc))
        .merge(crate::charts::layouts::router())
        .merge(crate::charts::annotations::router())
        .merge(crate::charts::alerts::router())
}

async fn index(_user: CurrentUser) -> Json<Value> {
    let catalog = catalog();
    let summaries: Vec<_> = catalog.charts.iter().map(|c| c.summary()).collect();
    Json(json!({
        "version": catalog.version,
        "counts": catalog.counts,
        "charts": summaries,
    }))
}

async fn spec(_user: CurrentUser, Path(chart_id): Path<String>) -> Result<Json<Value>, ApiError> {
    let chart = chart(&chart_id).ok_or_else(|| ApiError::not_found("Unknown chart"))?;
    Ok(Json(json!(chart)))
}

async fn series(
    State(state): State<AppState>,
    _user: CurrentUser,
    Path(chart_id): Path<String>,
    Query(query): Query<SeriesQuery>,
) -> Result<Json<Value>, ApiError> {
    let out = get_chart_series(&state.ch, &chart_id, &query).await?;
    Ok(Json(json!(out)))
}

async fn series_csv(
    State(state): State<AppState>,
    _user: CurrentUser,
    Path(chart_id): Path<String>,
    Query(query): Query<SeriesQuery>,
) -> Result<Response, ApiError> {
    let out = get_chart_series(&state.ch, &chart_id, &query).await?;
    let mut stamps = std::collections::BTreeSet::new();
    let mut maps: Vec<std::collections::HashMap<String, f64>> =
        Vec::with_capacity(out.series.len());
    for series in &out.series {
        let mut map = std::collections::HashMap::with_capacity(series.points.len());
        for point in &series.points {
            let key = csv_stamp(&point.t);
            stamps.insert(key.clone());
            if let Some(v) = point.v {
                map.insert(key, v);
            }
        }
        maps.push(map);
    }

    let mut header_cells = vec!["date".to_string()];
    for series in &out.series {
        header_cells.push(csv_escape(&series.label));
    }
    let mut lines = vec![header_cells.join(",")];
    for stamp in stamps {
        let mut cells = vec![csv_escape(&stamp)];
        for map in &maps {
            cells.push(map.get(&stamp).map(|v| v.to_string()).unwrap_or_default());
        }
        lines.push(cells.join(","));
    }
    let body = lines.join("\n") + "\n";

    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"chart.csv\"",
            ),
        ],
        body,
    )
        .into_response())
}

/// Canonical timestamp for a wide CSV. ClickHouse date metrics emit
/// `YYYY-MM-DD`, while OHLC points emit RFC3339; normalise both so one day
/// is one row.
fn csv_stamp(value: &str) -> String {
    if value.len() == 10 {
        return format!("{value} 00:00:00");
    }
    value
        .trim_end_matches('Z')
        .replace('T', " ")
        .trim()
        .to_string()
}

async fn ohlc(
    State(state): State<AppState>,
    _user: CurrentUser,
    Path(grain): Path<String>,
    Query(query): Query<SeriesQuery>,
) -> Result<Json<Value>, ApiError> {
    if !matches!(grain.as_str(), "hourly" | "daily" | "weekly" | "monthly") {
        return Err(ApiError::not_found("Unknown grain"));
    }
    if let Some(points) = query.max_points {
        if !(100..=10_000).contains(&points) {
            return Err(ApiError::unprocessable(
                "max_points must be between 100 and 10000",
            ));
        }
    }
    let bars = crate::charts::series::fetch_ohlc(
        &state.ch,
        &grain,
        query.from.as_deref(),
        query.to.as_deref(),
        query.max_points.unwrap_or(2000),
    )
    .await?;
    Ok(Json(json!({"bars": bars, "grain": grain})))
}

fn csv_escape(value: &str) -> String {
    // CSV formula injection: a leading = + - @ is executed by spreadsheets.
    let value = if value.starts_with(['=', '+', '-', '@']) {
        format!("'{value}")
    } else {
        value.to_string()
    };
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_escapes_commas_and_quotes() {
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
        assert_eq!(csv_escape("a\"b"), "\"a\"\"b\"");
        assert_eq!(csv_escape("plain"), "plain");
        assert_eq!(csv_escape("=cmd"), "'=cmd");
        assert_eq!(csv_stamp("2024-01-02"), "2024-01-02 00:00:00");
        assert_eq!(csv_stamp("2024-01-02T03:00:00Z"), "2024-01-02 03:00:00");
    }
}
