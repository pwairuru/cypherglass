pub mod ch;
pub mod config;

use axum::extract::{Request, State};
use axum::http::header::{self, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;
use axum::routing::get;
use axum::{Json, Router};
pub use ch::ChClient;
pub use config::Settings;
use secrecy::SecretString;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::time::Instant;
use tower_http::cors::{AllowOrigin, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub pg: PgPool,
    pub valkey_url: String,
    pub ch: ChClient,
    pub jwt_secret: SecretString,
}

pub fn build_router(state: AppState) -> Router {
    let settings = Settings::from_env();
    let origins: Vec<HeaderValue> = settings
        .cors_origin_list()
        .into_iter()
        .filter_map(|o| o.parse().ok())
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PATCH,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    Router::new()
        .route("/health", get(health_handler))
        .route("/ready", get(ready_handler))
        .with_state(state)
        .layer(axum::middleware::from_fn(security_headers_middleware))
        .layer(axum::middleware::from_fn(audit_middleware))
        .layer(cors)
}

async fn health_handler() -> Json<Value> {
    Json(json!({"status": "ok"}))
}

async fn ready_handler(State(state): State<AppState>) -> Json<Value> {
    let mut checks = serde_json::Map::new();

    let db_status = match sqlx::query("SELECT 1").fetch_one(&state.pg).await {
        Ok(_) => "ok".to_string(),
        Err(e) => format!("error: {}", std::any::type_name_of_val(&e)),
    };
    checks.insert("db".to_string(), json!(db_status));

    let ch_status = match state.ch.check().await {
        Ok(_) => "ok".to_string(),
        Err(e) => format!("error: {}", e),
    };
    checks.insert("clickhouse".to_string(), json!(ch_status));

    let healthy = checks
        .values()
        .all(|v| v.as_str() == Some("ok"));

    Json(json!({
        "status": if healthy { "ready" } else { "degraded" },
        "checks": checks,
    }))
}

async fn security_headers_middleware(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert("Referrer-Policy", HeaderValue::from_static("no-referrer"));
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
    );
    headers.insert(
        "Strict-Transport-Security",
        HeaderValue::from_static("max-age=63072000; includeSubDomains"),
    );
    response
}

async fn audit_middleware(request: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let client = "-".to_string();

    let response = next.run(request).await;
    let status = response.status().as_u16();
    let duration_ms = start.elapsed().as_millis() as u64;

    if path.starts_with("/api/v1/auth") || path.contains("/admin") || status >= 400 {
        tracing::info!(
            target: "cypherglass.audit",
            "{} {} -> {} ({}ms) client={}",
            method,
            path,
            status,
            duration_ms,
            client
        );
    }

    response
}
