use crate::auth::routes::CurrentUser;
use crate::charts::catalog::chart;
use crate::error::ApiError;
use axum::extract::{Path, Query, State};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AnnotationSnapshot {
    pub chart_id: String,
    pub variant_id: String,
    pub payload: Value,
    pub schema_version: i32,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct VariantQuery {
    #[serde(default)]
    pub variant: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SnapshotPut {
    pub payload: Value,
    #[serde(default = "default_schema")]
    pub schema_version: i32,
}

fn default_schema() -> i32 {
    1
}

const MAX_PAYLOAD_BYTES: usize = 1_000_000;

fn require_user(user: &CurrentUser) -> Result<(), ApiError> {
    if user.0.is_transient() || user.0.id == Uuid::nil() {
        return Err(ApiError::forbidden("Sign in with a persisted account"));
    }
    Ok(())
}

fn variant_of(q: &VariantQuery) -> String {
    q.variant.clone().unwrap_or_default()
}

pub async fn get(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(chart_id): Path<String>,
    Query(q): Query<VariantQuery>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    if chart(&chart_id).is_none() {
        return Err(ApiError::not_found("Unknown chart"));
    }
    let row = sqlx::query_as::<_, AnnotationSnapshot>(
        "SELECT chart_id, variant_id, payload, schema_version, updated_at
         FROM chart_annotations
         WHERE user_id = $1 AND chart_id = $2 AND variant_id = $3",
    )
    .bind(user.0.id)
    .bind(&chart_id)
    .bind(variant_of(&q))
    .fetch_optional(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("annotation store unavailable"))?;

    Ok(Json(json!({ "snapshot": row })))
}

pub async fn put(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(chart_id): Path<String>,
    Query(q): Query<VariantQuery>,
    Json(body): Json<SnapshotPut>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    if chart(&chart_id).is_none() {
        return Err(ApiError::not_found("Unknown chart"));
    }
    if body.schema_version < 1 || body.schema_version > 10 {
        return Err(ApiError::unprocessable("schema_version must be 1-10"));
    }
    let size = serde_json::to_vec(&body.payload)
        .map_err(|_| ApiError::unprocessable("payload must be JSON"))?
        .len();
    if size > MAX_PAYLOAD_BYTES {
        return Err(ApiError::unprocessable("annotation payload too large"));
    }
    let variant = variant_of(&q);
    let row = sqlx::query_as::<_, AnnotationSnapshot>(
        "INSERT INTO chart_annotations (id, user_id, chart_id, variant_id, payload, schema_version)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, chart_id, variant_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            schema_version = EXCLUDED.schema_version,
            updated_at = now()
         RETURNING chart_id, variant_id, payload, schema_version, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(user.0.id)
    .bind(&chart_id)
    .bind(&variant)
    .bind(&body.payload)
    .bind(body.schema_version)
    .fetch_one(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("annotation store unavailable"))?;

    Ok(Json(json!(row)))
}

pub async fn delete(
    State(state): State<AppState>,
    user: CurrentUser,
    Path(chart_id): Path<String>,
    Query(q): Query<VariantQuery>,
) -> Result<Json<Value>, ApiError> {
    require_user(&user)?;
    sqlx::query(
        "DELETE FROM chart_annotations WHERE user_id = $1 AND chart_id = $2 AND variant_id = $3",
    )
    .bind(user.0.id)
    .bind(&chart_id)
    .bind(variant_of(&q))
    .execute(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("annotation store unavailable"))?;
    Ok(Json(json!({"deleted": true})))
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/v1/charts/{chart_id}/annotations",
        axum::routing::get(get).put(put).delete(delete),
    )
}
