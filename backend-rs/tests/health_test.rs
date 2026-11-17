use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use backend_rs::{build_router, AppState, ChClient, Settings};
use http_body_util::BodyExt;
use secrecy::SecretString;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

fn test_state() -> AppState {
    let settings = Settings::from_env();
    let pg = PgPoolOptions::new()
        .connect_lazy(&settings.database_url)
        .expect("lazy pool creation");
    AppState {
        pg,
        valkey_url: settings.valkey_url,
        ch: ChClient::from_env(),
        jwt_secret: SecretString::new("test-secret-0123456789abcdef0123456789ab".into()),
    }
}

#[tokio::test]
async fn health_returns_ok() {
    let router = build_router(test_state());
    let response = router
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
}

#[tokio::test]
async fn ready_reports_checks() {
    let router = build_router(test_state());
    let response = router
        .oneshot(Request::builder().uri("/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

    assert!(json.get("status").is_some());
    let checks = json
        .get("checks")
        .and_then(|v| v.as_object())
        .expect("checks object");
    assert!(checks.contains_key("db"));
    assert!(checks.contains_key("clickhouse"));
}

#[tokio::test]
async fn security_headers_present() {
    let router = build_router(test_state());
    let response = router
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    let headers = response.headers();
    assert_eq!(headers["x-content-type-options"], "nosniff");
    assert_eq!(headers["x-frame-options"], "DENY");
    assert_eq!(headers["referrer-policy"], "no-referrer");
    assert_eq!(
        headers["permissions-policy"],
        "camera=(), microphone=(), geolocation=()"
    );
    assert_eq!(
        headers["strict-transport-security"],
        "max-age=63072000; includeSubDomains"
    );
}

#[tokio::test]
async fn cors_allows_patch() {
    let router = build_router(test_state());
    let response = router
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/health")
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "PATCH")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_success());
    let allow = response
        .headers()
        .get("access-control-allow-methods")
        .expect("Access-Control-Allow-Methods header")
        .to_str()
        .unwrap();
    assert!(allow.contains("PATCH"));
}
