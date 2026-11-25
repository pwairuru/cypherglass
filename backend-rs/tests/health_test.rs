use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use backend_rs::{build_router_with, AppState, ChClient, Settings};
use http_body_util::BodyExt;
use secrecy::SecretString;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

fn test_settings() -> Settings {
    Settings {
        database_url: "postgresql://cypher:cypher@localhost:5432/cypher".into(),
        clickhouse_host: "localhost".into(),
        clickhouse_port: 8123,
        clickhouse_user: "bitcoin".into(),
        clickhouse_password: "bitcoin_clickhouse".into(),
        clickhouse_database: "bitcoin".into(),
        valkey_url: "valkey://localhost:6379/0".into(),
        jwt_secret: SecretString::new(
            "test-secret-0123456789abcdef0123456789ab".into(),
        ),
        jwt_expire_min: 60,
        cors_origins: "http://localhost:5173,http://localhost:8002".into(),
        env: "dev".into(),
        google_client_id: "".into(),
        google_client_secret: "".into(),
        github_client_id: "".into(),
        github_client_secret: "".into(),
        oauth_redirect_base: "http://localhost:8002".into(),
    }
}

fn test_state(settings: &Settings) -> AppState {
    let pg = PgPoolOptions::new()
        .connect_lazy(&settings.database_url)
        .expect("lazy pool creation");
    AppState {
        pg,
        valkey_url: settings.valkey_url.clone(),
        ch: ChClient::from_settings(settings),
        jwt_secret: SecretString::new("test-secret-0123456789abcdef0123456789ab".into()),
        jwt_expire_min: settings.jwt_expire_min,
        google_client_id: settings.google_client_id.clone(),
        google_client_secret: settings.google_client_secret.clone(),
        github_client_id: settings.github_client_id.clone(),
        github_client_secret: settings.github_client_secret.clone(),
        oauth_redirect_base: settings.oauth_redirect_base.clone(),
    }
}

#[tokio::test]
async fn health_returns_ok() {
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
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
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
    let response = router
        .oneshot(Request::builder().uri("/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

    let status = json["status"].as_str().expect("status string");
    assert!(
        status == "ready" || status == "degraded",
        "status must be ready or degraded"
    );

    let checks = json["checks"]
        .as_object()
        .expect("checks object");
    assert!(checks.contains_key("db"));
    assert!(checks.contains_key("clickhouse"));
    for (key, value) in checks {
        let s = value.as_str().unwrap_or_else(|| panic!("{} check must be a string", key));
        assert!(!s.is_empty(), "{} check must not be empty", key);
    }
}

#[tokio::test]
async fn security_headers_present() {
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
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
async fn security_headers_present_on_preflight() {
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
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
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
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
    let headers = response.headers();
    let allow_methods = headers
        .get("access-control-allow-methods")
        .expect("Access-Control-Allow-Methods header")
        .to_str()
        .unwrap();
    let allow_headers = headers
        .get("access-control-allow-headers")
        .expect("Access-Control-Allow-Headers header")
        .to_str()
        .unwrap();

    assert_eq!(allow_methods, "GET,POST,PATCH,PUT,DELETE");
    assert_eq!(allow_headers, "authorization,content-type");
}

#[tokio::test]
async fn cors_rejects_unknown_origin() {
    let settings = test_settings();
    let router = build_router_with(test_state(&settings), &settings);
    let response = router
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/health")
                .header("Origin", "http://evil.example.com")
                .header("Access-Control-Request-Method", "PATCH")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let headers = response.headers();
    let allow_origin = headers
        .get("access-control-allow-origin")
        .and_then(|v| v.to_str().ok());
    assert_ne!(
        allow_origin,
        Some("http://evil.example.com"),
        "unknown origin must not be reflected"
    );
}
