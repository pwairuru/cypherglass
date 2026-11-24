use axum::extract::{Path, Query, State};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::routes::CurrentUser;
use crate::error::ApiError;
use crate::metrics::service;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/metrics", axum::routing::get(list_metrics))
        .route(
            "/api/v1/metrics/coverage",
            axum::routing::get(coverage),
        )
        .route(
            "/api/v1/metrics/{metric_id}/series",
            axum::routing::get(series),
        )
        .route(
            "/api/v1/metrics/price_ohlc_{grain}/ohlc",
            axum::routing::get(ohlc),
        )
}

async fn list_metrics(
    State(_state): State<AppState>,
    _user: CurrentUser,
) -> Json<Value> {
    Json(json!(service::list_metrics()))
}

async fn coverage(
    State(state): State<AppState>,
    _user: CurrentUser,
) -> Result<Json<Value>, ApiError> {
    let out = service::get_coverage(&state.ch).await?;
    Ok(Json(json!({
        "min_day": out.min_day,
        "max_day": out.max_day,
    })))
}

#[derive(Debug, Deserialize)]
struct SeriesQuery {
    from: String,
    to: String,
}

async fn series(
    State(state): State<AppState>,
    _user: CurrentUser,
    Path(metric_id): Path<String>,
    Query(q): Query<SeriesQuery>,
) -> Result<Json<Value>, ApiError> {
    let out = service::get_series(&state.ch, &metric_id, &q.from, &q.to).await?;
    Ok(Json(json!({
        "points": out.points,
        "unit": out.unit,
        "stale": out.stale,
    })))
}

async fn ohlc(
    State(state): State<AppState>,
    _user: CurrentUser,
    Path(grain): Path<String>,
    Query(q): Query<SeriesQuery>,
) -> Result<Json<Value>, ApiError> {
    let out = service::get_ohlc(&state.ch, &grain, &q.from, &q.to).await?;
    Ok(Json(json!({ "bars": out.bars })))
}
