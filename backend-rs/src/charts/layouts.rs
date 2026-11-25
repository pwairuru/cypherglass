use crate::db::User;
use crate::error::ApiError;
use axum::extract::{Path, State};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Layout {
    pub id: Uuid,
    pub name: String,
    pub chart_id: Option<String>,
    pub spec: Value,
    pub is_default: bool,
    pub is_public: bool,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct LayoutCreate {
    pub name: String,
    #[serde(default)]
    pub chart_id: Option<String>,
    pub spec: Value,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub is_public: bool,
}

#[derive(Debug, Deserialize)]
pub struct LayoutUpdate {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub spec: Option<Value>,
    #[serde(default)]
    pub is_default: Option<bool>,
    #[serde(default)]
    pub is_public: Option<bool>,
}

fn require_persisted(user: &User) -> Result<(), ApiError> {
    if user.is_transient() || user.id == Uuid::nil() {
        return Err(ApiError::forbidden("Sign in with a persisted account"));
    }
    Ok(())
}

fn validate_name(name: &str) -> Result<(), ApiError> {
    if name.trim().is_empty() || name.len() > 120 {
        return Err(ApiError::unprocessable("name must be 1-120 characters"));
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    user: crate::auth::routes::CurrentUser,
) -> Result<Json<Value>, ApiError> {
    require_persisted(&user.0)?;
    let rows = sqlx::query_as::<_, Layout>(
        "SELECT id, name, chart_id, spec, is_default, is_public, updated_at
         FROM chart_layouts WHERE user_id = $1 ORDER BY updated_at DESC",
    )
    .bind(user.0.id)
    .fetch_all(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("layout store unavailable"))?;
    Ok(Json(json!(rows)))
}

pub async fn create(
    State(state): State<AppState>,
    user: crate::auth::routes::CurrentUser,
    Json(body): Json<LayoutCreate>,
) -> Result<Json<Value>, ApiError> {
    require_persisted(&user.0)?;
    validate_name(&body.name)?;
    if body.is_default {
        clear_default(&state, user.0.id).await?;
    }
    let row = sqlx::query_as::<_, Layout>(
        "INSERT INTO chart_layouts (id, user_id, name, chart_id, spec, is_default, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, chart_id, spec, is_default, is_public, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(user.0.id)
    .bind(body.name.trim())
    .bind(body.chart_id)
    .bind(body.spec)
    .bind(body.is_default)
    .bind(body.is_public)
    .fetch_one(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("layout store unavailable"))?;
    Ok(Json(json!(row)))
}

pub async fn update(
    State(state): State<AppState>,
    user: crate::auth::routes::CurrentUser,
    Path(id): Path<Uuid>,
    Json(body): Json<LayoutUpdate>,
) -> Result<Json<Value>, ApiError> {
    require_persisted(&user.0)?;
    if let Some(name) = &body.name {
        validate_name(name)?;
    }
    if body.is_default == Some(true) {
        clear_default(&state, user.0.id).await?;
    }
    let row = sqlx::query_as::<_, Layout>(
        "UPDATE chart_layouts SET
            name = COALESCE($3, name),
            spec = COALESCE($4, spec),
            is_default = COALESCE($5, is_default),
            is_public = COALESCE($6, is_public),
            updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, chart_id, spec, is_default, is_public, updated_at",
    )
    .bind(id)
    .bind(user.0.id)
    .bind(body.name)
    .bind(body.spec)
    .bind(body.is_default)
    .bind(body.is_public)
    .fetch_optional(&state.pg)
    .await
    .map_err(|_| ApiError::service_unavailable("layout store unavailable"))?
    .ok_or_else(|| ApiError::not_found("Layout not found"))?;
    Ok(Json(json!(row)))
}

pub async fn delete(
    State(state): State<AppState>,
    user: crate::auth::routes::CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    require_persisted(&user.0)?;
    let result = sqlx::query("DELETE FROM chart_layouts WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.0.id)
        .execute(&state.pg)
        .await
        .map_err(|_| ApiError::service_unavailable("layout store unavailable"))?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Layout not found"));
    }
    Ok(Json(json!({"deleted": true})))
}

async fn clear_default(state: &AppState, user_id: Uuid) -> Result<(), ApiError> {
    sqlx::query("UPDATE chart_layouts SET is_default = FALSE WHERE user_id = $1 AND is_default")
        .bind(user_id)
        .execute(&state.pg)
        .await
        .map_err(|_| ApiError::service_unavailable("layout store unavailable"))?;
    Ok(())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/v1/charts/layouts",
            axum::routing::get(list).post(create),
        )
        .route(
            "/api/v1/charts/layouts/{id}",
            axum::routing::patch(update).delete(delete),
        )
}
