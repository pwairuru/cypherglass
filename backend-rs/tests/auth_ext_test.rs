use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use backend_rs::store::store;
use backend_rs::{build_router_with, db::run_migrations, AppState, ChClient, Settings};
use http_body_util::BodyExt;
use secrecy::SecretString;
use secp256k1::{Keypair, Secp256k1, XOnlyPublicKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::env;
use tower::ServiceExt;
use uuid::Uuid;

static DB_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));
static TEST_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));

fn db_url() -> String {
    env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://cypher:cypher@localhost:5433/cypher".into())
}

fn test_settings() -> Settings {
    Settings {
        database_url: db_url(),
        clickhouse_host: "localhost".into(),
        clickhouse_port: 8123,
        clickhouse_user: "bitcoin".into(),
        clickhouse_password: "bitcoin_clickhouse".into(),
        clickhouse_database: "bitcoin".into(),
        valkey_url: "valkey://localhost:6382/0".into(),
        jwt_secret: SecretString::new("test-secret-0123456789abcdef0123456789ab".into()),
        jwt_expire_min: 60,
        cors_origins: "http://localhost:5173,http://localhost:8002".into(),
        env: "dev".into(),
        google_client_id: "g_id".into(),
        google_client_secret: "g_secret".into(),
        github_client_id: "gh_id".into(),
        github_client_secret: "gh_secret".into(),
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
        jwt_secret: settings.jwt_secret.clone(),
        jwt_expire_min: settings.jwt_expire_min,
        google_client_id: settings.google_client_id.clone(),
        google_client_secret: settings.google_client_secret.clone(),
        github_client_id: settings.github_client_id.clone(),
        github_client_secret: settings.github_client_secret.clone(),
        oauth_redirect_base: settings.oauth_redirect_base.clone(),
    }
}

async fn setup() -> (
    tokio::sync::MutexGuard<'static, ()>,
    tokio::sync::MutexGuard<'static, ()>,
    Settings,
    AppState,
) {
    let guard = DB_LOCK.lock().await;
    let test_guard = TEST_LOCK.lock().await;
    let settings = test_settings();
    let state = test_state(&settings);
    backend_rs::store::init(settings.valkey_url.clone());
    backend_rs::store::rate_limiter().reset().await;
    backend_rs::store::store().force_unavailable(false).await;
    prepare_db(&state.pg).await;
    (guard, test_guard, settings, state)
}

async fn prepare_db(pool: &PgPool) {
    run_migrations(pool).await.expect("migrations should apply");
    sqlx::query("TRUNCATE users, social_auth CASCADE")
        .execute(pool)
        .await
        .expect("truncate test tables");
}

fn req(method: Method, uri: &str, body: Value, auth: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder().method(method).uri(uri);
    builder = builder.header("content-type", "application/json");
    if let Some(token) = auth {
        builder = builder.header("authorization", format!("Bearer {}", token));
    }
    builder.body(Body::from(body.to_string())).unwrap()
}

async fn body_json(response: axum::response::Response) -> (StatusCode, Value) {
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, json)
}

fn signed_nostr_event(content: &str, kind: i64) -> (String, Value) {
    let secp = Secp256k1::new();
    let keypair = Keypair::from_seckey_slice(&secp, &[0x11u8; 32]).expect("test key");
    let (xonly, _parity) = XOnlyPublicKey::from_keypair(&keypair);
    let pubkey = hex::encode(xonly.serialize());

    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let tags: Vec<Vec<String>> = if kind == 27235 {
        vec![
            vec!["u".into(), "http://test/".into()],
            vec!["method".into(), "GET".into()],
        ]
    } else {
        vec![]
    };

    let event_arr = json!([0, pubkey, created_at, kind, tags, content]);
    let id_bytes = Sha256::digest(event_arr.to_string().as_bytes());
    let id = hex::encode(id_bytes);

    let sig = secp.sign_schnorr_no_aux_rand(&id_bytes, &keypair);
    let sig_hex = hex::encode(sig.as_ref());

    let event = json!({
        "id": id,
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": kind,
        "tags": tags,
        "content": content,
        "sig": sig_hex,
    });
    (pubkey, event)
}

#[tokio::test]
async fn nostr_verify_known_vector() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let (pubkey, _event) = signed_nostr_event("hello", 27235);
    let challenge_resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": pubkey}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(challenge_resp).await;
    assert_eq!(status, StatusCode::OK, "challenge failed: {}", body);
    let challenge = body["challenge"].as_str().unwrap();

    let (_pubkey2, event) = signed_nostr_event(challenge, 27235);
    let verify_resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/verify",
            json!({"event": event}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(verify_resp).await;
    assert_eq!(status, StatusCode::OK, "verify failed: {}", body);
    assert!(body["access_token"].as_str().is_some());
}

#[tokio::test]
async fn challenge_replay_second_use_401() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let (pubkey, _event) = signed_nostr_event("hello", 27235);
    let challenge_resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": pubkey}),
            None,
        ))
        .await
        .unwrap();
    let (_status, body) = body_json(challenge_resp).await;
    let challenge = body["challenge"].as_str().unwrap();

    let (_pubkey2, event) = signed_nostr_event(challenge, 27235);
    let first = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/verify",
            json!({"event": event}),
            None,
        ))
        .await
        .unwrap();
    let (status, _body) = body_json(first).await;
    assert_eq!(status, StatusCode::OK);

    let second = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/verify",
            json!({"event": event}),
            None,
        ))
        .await
        .unwrap();
    let (status, _body) = body_json(second).await;
    assert!(
        status == StatusCode::UNAUTHORIZED || status == StatusCode::NOT_FOUND,
        "replay should be rejected"
    );
}

#[tokio::test]
async fn expired_challenge_404() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);

    let (pubkey, _event) = signed_nostr_event("hello", 27235);
    let challenge_resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": pubkey}),
            None,
        ))
        .await
        .unwrap();
    let (_status, body) = body_json(challenge_resp).await;
    let challenge = body["challenge"].as_str().unwrap();

    // Force the in-memory challenge to expire.
    {
        let st = store();
        st.force_expired(&pubkey).await;
    }

    let (_pubkey2, event) = signed_nostr_event(challenge, 27235);
    let verify_resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/verify",
            json!({"event": event}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(verify_resp).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "expected 404: {}", body);
    assert_eq!(body["detail"].as_str(), Some("unknown_challenge"));
}

#[tokio::test]
async fn oauth_state_reuse_400() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let start_resp = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/oauth/google/start")
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, body) = body_json(start_resp).await;
    assert_eq!(status, StatusCode::OK, "start failed: {}", body);
    let state_token = body["state"].as_str().unwrap();

    let callback_uri = format!(
        "/api/v1/auth/oauth/google/callback?code=fake&state={}",
        state_token
    );
    let first = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri(&callback_uri)
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, _body) = body_json(first).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);

    let second = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri(&callback_uri)
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, body) = body_json(second).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "reuse failed: {}", body);
    assert_eq!(body["detail"].as_str(), Some("invalid_state"));
}

#[tokio::test]
async fn oauth_unknown_provider_400() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let start = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/oauth/unknown/start")
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, _body) = body_json(start).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let callback = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri("/api/v1/auth/oauth/unknown/callback?code=x&state=y")
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, _body) = body_json(callback).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn challenge_burst_429() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let pubkey = "ab".repeat(32);
    let mut last_status = StatusCode::OK;
    for i in 0..=21 {
        let resp = router
            .clone()
            .oneshot(req(
                Method::POST,
                "/api/v1/auth/nostr/challenge",
                json!({"pubkey": pubkey}),
                None,
            ))
            .await
            .unwrap();
        let (status, body) = body_json(resp).await;
        last_status = status;
        if i < 20 {
            assert_eq!(status, StatusCode::OK, "request {} failed: {}", i, body);
        }
    }
    assert_eq!(last_status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(last_status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn valkey_down_maps_503() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    store().force_unavailable(true).await;
    let resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": "ab".repeat(32)}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(resp).await;
    store().force_unavailable(false).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "expected 503: {}", body);
    assert_eq!(body["detail"].as_str(), Some("challenge store unavailable"));
}

#[tokio::test]
async fn login_rate_limit_429() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let username = format!("rl_login_{}", &Uuid::new_v4().to_string()[..8]);
    let mut last_status = StatusCode::OK;
    for i in 0..=31 {
        let resp = router
            .clone()
            .oneshot(req(
                Method::POST,
                "/api/v1/auth/login",
                json!({"username": username, "password": "wrong"}),
                None,
            ))
            .await
            .unwrap();
        let (status, _body) = body_json(resp).await;
        last_status = status;
        if i < 30 {
            assert_eq!(status, StatusCode::UNAUTHORIZED);
        }
    }
    assert_eq!(last_status, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn register_rate_limit_429() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let mut last_status = StatusCode::OK;
    for i in 0..=11 {
        let username = format!("rl_reg_{}_{}", i, &Uuid::new_v4().to_string()[..8]);
        let resp = router
            .clone()
            .oneshot(req(
                Method::POST,
                "/api/v1/auth/register",
                json!({"username": username, "password": "hunter2!X"}),
                None,
            ))
            .await
            .unwrap();
        let (status, _body) = body_json(resp).await;
        last_status = status;
        if i < 10 {
            assert_eq!(status, StatusCode::CREATED);
        }
    }
    assert_eq!(last_status, StatusCode::TOO_MANY_REQUESTS);
}
