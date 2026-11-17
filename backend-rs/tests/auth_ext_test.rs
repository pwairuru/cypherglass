use axum::body::Body;
use axum::extract::ConnectInfo;
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
use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
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
        valkey_url: "valkey://localhost:1/0".into(),
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

fn req_with_ip(method: Method, uri: &str, body: Value, ip: SocketAddr) -> Request<Body> {
    let mut req = req(method, uri, body, None);
    req.extensions_mut().insert(ConnectInfo(ip));
    req
}

async fn nostr_token_for(router: &axum::Router, pubkey: &str) -> String {
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
    assert_eq!(status, StatusCode::OK, "nostr verify failed: {}", body);
    body["access_token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn nostr_double_login_succeeds_twice() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let (pubkey, _event) = signed_nostr_event("hello", 27235);

    // First login creates the user.
    let token1 = nostr_token_for(&router, &pubkey).await;
    assert!(!token1.is_empty());

    // Second login with the same pubkey must also succeed (existing link lookup).
    let token2 = nostr_token_for(&router, &pubkey).await;
    assert!(!token2.is_empty());
}

#[tokio::test]
async fn nostr_inactive_user_returns_401() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);

    let (pubkey, _event) = signed_nostr_event("hello", 27235);
    nostr_token_for(&router, &pubkey).await;

    // Deactivate the user created by nostr login.
    sqlx::query("UPDATE users SET is_active = false WHERE npub = $1")
        .bind(&pubkey)
        .execute(&state.pg)
        .await
        .expect("deactivate user");

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
    assert_eq!(status, StatusCode::UNAUTHORIZED, "inactive user should 401: {}", body);
    assert_eq!(body["detail"].as_str(), Some("invalid_nostr_event"));
}

#[tokio::test]
async fn nostr_extreme_created_at_no_panic_401() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let secp = Secp256k1::new();
    let keypair = Keypair::from_seckey_slice(&secp, &[0x11u8; 32]).expect("test key");
    let (xonly, _parity) = XOnlyPublicKey::from_keypair(&keypair);
    let pubkey = hex::encode(xonly.serialize());

    let created_at = i64::MIN;
    let tags: Vec<Vec<String>> = vec![];
    let content = "chal";
    let event_arr = json!([0, pubkey, created_at, 27235, tags, content]);
    let id_bytes = Sha256::digest(event_arr.to_string().as_bytes());
    let id = hex::encode(id_bytes);
    let sig = secp.sign_schnorr_no_aux_rand(&id_bytes, &keypair);
    let sig_hex = hex::encode(sig.as_ref());

    let event = json!({
        "id": id,
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": 27235,
        "tags": tags,
        "content": content,
        "sig": sig_hex,
    });

    let resp = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/nostr/verify",
            json!({"event": event}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(resp).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "extreme timestamp should 401: {}", body);
}

#[tokio::test]
async fn distinct_ips_get_distinct_rate_buckets() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let ip1: SocketAddr = ([192, 0, 2, 1], 12345).into();
    let ip2: SocketAddr = ([192, 0, 2, 2], 12345).into();

    // Use a fresh pubkey per request so only the per-IP bucket matters.
    for i in 0..20 {
        let pubkey = format!("{:064x}", i);
        let resp = router
            .clone()
            .oneshot(req_with_ip(
                Method::POST,
                "/api/v1/auth/nostr/challenge",
                json!({"pubkey": pubkey}),
                ip1,
            ))
            .await
            .unwrap();
        let (status, _body) = body_json(resp).await;
        assert_eq!(status, StatusCode::OK);
    }

    // 21st request from ip1 is rate limited.
    let resp = router
        .clone()
        .oneshot(req_with_ip(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": format!("{:064x}", 20)}),
            ip1,
        ))
        .await
        .unwrap();
    let (status, _body) = body_json(resp).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    // Same request from ip2 is allowed because it has its own bucket.
    let resp = router
        .clone()
        .oneshot(req_with_ip(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": format!("{:064x}", 21)}),
            ip2,
        ))
        .await
        .unwrap();
    let (status, _body) = body_json(resp).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn xff_from_loopback_trusted_uses_xff_ip() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let loopback: SocketAddr = ([127, 0, 0, 1], 12345).into();
    let client_ip = "1.2.3.4";

    // Exhaust the per-IP bucket for the XFF client.
    for i in 0..20 {
        let mut req = req_with_ip(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": format!("{:064x}", i)}),
            loopback,
        );
        req.headers_mut().insert("x-forwarded-for", client_ip.parse().unwrap());
        let resp = router.clone().oneshot(req).await.unwrap();
        let (status, _body) = body_json(resp).await;
        assert_eq!(status, StatusCode::OK);
    }

    // 21st request from the same XFF client is rate limited.
    let mut req = req_with_ip(
        Method::POST,
        "/api/v1/auth/nostr/challenge",
        json!({"pubkey": format!("{:064x}", 20)}),
        loopback,
    );
    req.headers_mut().insert("x-forwarded-for", client_ip.parse().unwrap());
    let resp = router.clone().oneshot(req).await.unwrap();
    let (status, _body) = body_json(resp).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    // A different XFF client via the same loopback proxy gets its own bucket.
    let mut req = req_with_ip(
        Method::POST,
        "/api/v1/auth/nostr/challenge",
        json!({"pubkey": format!("{:064x}", 21)}),
        loopback,
    );
    req.headers_mut().insert("x-forwarded-for", "5.6.7.8".parse().unwrap());
    let resp = router.clone().oneshot(req).await.unwrap();
    let (status, _body) = body_json(resp).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn xff_from_untrusted_peer_ignored() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let untrusted_peer: SocketAddr = ([9, 9, 9, 9], 12345).into();

    // The XFF header is present but the socket peer is not loopback, so it is ignored.
    for i in 0..20 {
        let mut req = req_with_ip(
            Method::POST,
            "/api/v1/auth/nostr/challenge",
            json!({"pubkey": format!("{:064x}", i)}),
            untrusted_peer,
        );
        req.headers_mut().insert("x-forwarded-for", "1.2.3.4".parse().unwrap());
        let resp = router.clone().oneshot(req).await.unwrap();
        let (status, _body) = body_json(resp).await;
        assert_eq!(status, StatusCode::OK);
    }

    // 21st request from the same untrusted socket peer is limited, regardless of XFF.
    let mut req = req_with_ip(
        Method::POST,
        "/api/v1/auth/nostr/challenge",
        json!({"pubkey": format!("{:064x}", 20)}),
        untrusted_peer,
    );
    req.headers_mut().insert("x-forwarded-for", "99.99.99.99".parse().unwrap());
    let resp = router.clone().oneshot(req).await.unwrap();
    let (status, _body) = body_json(resp).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

/// Fake Valkey server: accepts the connection, responds OK/PONG to setup
/// commands (HELLO/AUTH/PING), and returns `-ERR fake failure` to data
/// commands. This exercises the "Valkey client connected but command failed"
/// path -> 503.
async fn run_fake_valkey_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = Vec::new();
        let mut tmp = [0u8; 1024];
        loop {
            let n = match socket.read(&mut tmp).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            buf.extend_from_slice(&tmp[..n]);
            // Parse as many RESP arrays as we have.
            let mut consumed = 0usize;
            while let Some((cmd, len)) = parse_resp_command(&buf[consumed..]) {
                consumed += len;
                let response = match cmd.as_deref() {
                    Some("PING") => "+PONG\r\n",
                    Some("AUTH") | Some("HELLO") => "+OK\r\n",
                    _ => "-ERR fake failure\r\n",
                };
                if socket.write_all(response.as_bytes()).await.is_err() {
                    return;
                }
            }
            if consumed > 0 {
                buf.drain(..consumed);
            }
        }
    });
    format!("redis://127.0.0.1:{}/0", port)
}

/// Parse a RESP array of bulk strings; returns the command name (first element,
/// uppercased) and the total bytes consumed, or None if incomplete.
fn parse_resp_command(buf: &[u8]) -> Option<(Option<String>, usize)> {
    let s = std::str::from_utf8(buf).ok()?;
    if !s.starts_with('*') {
        return None;
    }
    let mut lines = s.split("\r\n");
    let first = lines.next()?;
    let count: usize = first[1..].parse().ok()?;
    let mut consumed = first.len() + 2; // include \r\n
    let mut cmd: Option<String> = None;
    for i in 0..count {
        let len_line = lines.next()?;
        consumed += len_line.len() + 2;
        if !len_line.starts_with('$') {
            return None;
        }
        let len: usize = len_line[1..].parse().ok()?;
        let data = lines.next()?;
        if data.len() != len {
            return None;
        }
        consumed += data.len() + 2;
        if i == 0 {
            cmd = Some(data.to_ascii_uppercase());
        }
    }
    Some((cmd, consumed))
}

#[tokio::test]
async fn valkey_command_failure_maps_503() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let fake_url = run_fake_valkey_server().await;
    store().set_url(fake_url).await;
    let router = build_router_with(state, &settings);

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
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "expected 503: {}", body);
    assert_eq!(body["detail"].as_str(), Some("challenge store unavailable"));
}

async fn run_fake_oauth_server(provider_uid: &str) -> (String, String) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let uid = provider_uid.to_string();
    tokio::spawn(async move {
        let app = axum::Router::new()
            .route(
                "/token",
                axum::routing::post(|| async {
                    axum::Json(json!({"access_token": "fake-token", "token_type": "bearer"}))
                }),
            )
            .route(
                "/userinfo",
                axum::routing::get(move || {
                    let uid = uid.clone();
                    async move {
                        axum::Json(json!({
                            "sub": uid,
                            "email": "oauth@example.com",
                            "name": "OAuth User",
                            "picture": "https://example.com/pic.png",
                        }))
                    }
                }),
            );
        axum::serve(listener, app).await.unwrap();
    });

    let base = format!("http://127.0.0.1:{}", port);
    (format!("{}/token", base), format!("{}/userinfo", base))
}

#[tokio::test]
async fn oauth_success_path_creates_user_and_token() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);

    let (token_url, userinfo_url) = run_fake_oauth_server("google-123").await;
    env::set_var("CYPHER_TEST_GOOGLE_TOKEN_URL", &token_url);
    env::set_var("CYPHER_TEST_GOOGLE_USERINFO_URL", &userinfo_url);

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
    let callback_resp = router
        .clone()
        .oneshot(Request::builder()
            .method(Method::GET)
            .uri(&callback_uri)
            .body(Body::empty())
            .unwrap())
        .await
        .unwrap();
    let (status, body) = body_json(callback_resp).await;
    env::remove_var("CYPHER_TEST_GOOGLE_TOKEN_URL");
    env::remove_var("CYPHER_TEST_GOOGLE_USERINFO_URL");

    assert_eq!(status, StatusCode::OK, "callback failed: {}", body);
    assert!(body["access_token"].as_str().is_some());

    let row: (String, String) = sqlx::query_as(
        "SELECT u.username, sa.provider FROM users u JOIN social_auth sa ON sa.user_id = u.id WHERE sa.uid = $1",
    )
    .bind("google-123")
    .fetch_one(&state.pg)
    .await
    .expect("user + social_auth row");
    assert_eq!(row.1, "google");
    assert!(row.0.starts_with("oauth") || row.0.starts_with("oauth_"));
}

#[tokio::test]
async fn oauth_inactive_user_returns_401() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);

    let (token_url, userinfo_url) = run_fake_oauth_server("google-456").await;
    env::set_var("CYPHER_TEST_GOOGLE_TOKEN_URL", &token_url);
    env::set_var("CYPHER_TEST_GOOGLE_USERINFO_URL", &userinfo_url);

    // First callback creates the user.
    let start_resp = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/oauth/google/start")
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (_status, body) = body_json(start_resp).await;
    let state_token = body["state"].as_str().unwrap();
    let callback_uri = format!("/api/v1/auth/oauth/google/callback?code=fake&state={}", state_token);
    let first = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri(&callback_uri)
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (status, _body) = body_json(first).await;
    assert_eq!(status, StatusCode::OK);

    // Deactivate user.
    sqlx::query("UPDATE users SET is_active = false WHERE email = $1")
        .bind("oauth@example.com")
        .execute(&state.pg)
        .await
        .expect("deactivate user");

    // Second callback with same uid should be rejected.
    let start_resp = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/oauth/google/start")
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (_status, body) = body_json(start_resp).await;
    let state_token = body["state"].as_str().unwrap();
    let callback_uri = format!("/api/v1/auth/oauth/google/callback?code=fake&state={}", state_token);
    let second = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri(&callback_uri)
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (status, body) = body_json(second).await;

    env::remove_var("CYPHER_TEST_GOOGLE_TOKEN_URL");
    env::remove_var("CYPHER_TEST_GOOGLE_USERINFO_URL");

    assert_eq!(status, StatusCode::UNAUTHORIZED, "inactive oauth user should 401: {}", body);
    assert_eq!(body["detail"].as_str(), Some("invalid_oauth_login"));
}

#[tokio::test]
async fn oauth_repeat_callback_for_existing_link_succeeds() {
    let (_guard, _test_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);

    let (token_url, userinfo_url) = run_fake_oauth_server("google-789").await;
    env::set_var("CYPHER_TEST_GOOGLE_TOKEN_URL", &token_url);
    env::set_var("CYPHER_TEST_GOOGLE_USERINFO_URL", &userinfo_url);

    let start_resp = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/oauth/google/start")
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (_status, body) = body_json(start_resp).await;
    let state_token = body["state"].as_str().unwrap();
    let callback_uri = format!("/api/v1/auth/oauth/google/callback?code=fake&state={}", state_token);
    let first = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri(&callback_uri)
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (status, _body) = body_json(first).await;
    assert_eq!(status, StatusCode::OK);

    let start_resp = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri("/api/v1/auth/oauth/google/start")
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (_status, body) = body_json(start_resp).await;
    let state_token = body["state"].as_str().unwrap();
    let callback_uri = format!("/api/v1/auth/oauth/google/callback?code=fake&state={}", state_token);
    let second = router.clone().oneshot(Request::builder()
        .method(Method::GET)
        .uri(&callback_uri)
        .body(Body::empty())
        .unwrap()).await.unwrap();
    let (status, body) = body_json(second).await;

    env::remove_var("CYPHER_TEST_GOOGLE_TOKEN_URL");
    env::remove_var("CYPHER_TEST_GOOGLE_USERINFO_URL");

    assert_eq!(status, StatusCode::OK, "repeat oauth callback should succeed: {}", body);
    assert!(body["access_token"].as_str().is_some());
}
