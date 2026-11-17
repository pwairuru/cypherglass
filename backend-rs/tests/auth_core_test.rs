use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use backend_rs::auth::routes::{classify_unique_violation, AuthError};
use backend_rs::auth::{decode_token, password_ver};
use backend_rs::db::{run_migrations, seed_user_for, User};
use backend_rs::{build_router_with, AppState, ChClient, Settings};
use http_body_util::BodyExt;
use secrecy::SecretString;
use secrecy::ExposeSecret;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::env;
use tower::ServiceExt;
use uuid::Uuid;

static DB_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));
static ENV_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
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
        jwt_secret: settings.jwt_secret.clone(),
        jwt_expire_min: settings.jwt_expire_min,
        google_client_id: settings.google_client_id.clone(),
        google_client_secret: settings.google_client_secret.clone(),
        github_client_id: settings.github_client_id.clone(),
        github_client_secret: settings.github_client_secret.clone(),
        oauth_redirect_base: settings.oauth_redirect_base.clone(),
    }
}

async fn setup() -> (tokio::sync::MutexGuard<'static, ()>, Settings, AppState) {
    let guard = DB_LOCK.lock().await;
    let settings = test_settings();
    let state = test_state(&settings);
    backend_rs::store::init(settings.valkey_url.clone());
    prepare_db(&state.pg).await;
    (guard, settings, state)
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

async fn insert_user(pool: &PgPool, username: &str, password: &str, is_admin: bool) -> User {
    use backend_rs::auth::hash_password;
    let id = Uuid::new_v4();
    sqlx::query_as(
        "INSERT INTO users (
            id, username, email, display_name, npub, avatar_url,
            password_hash, is_active, is_admin, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin",
    )
    .bind(id)
    .bind(username)
    .bind::<Option<&str>>(None)
    .bind::<Option<&str>>(None)
    .bind::<Option<&str>>(None)
    .bind::<Option<&str>>(None)
    .bind(hash_password(password))
    .bind(true)
    .bind(is_admin)
    .fetch_one(pool)
    .await
    .expect("insert user")
}

async fn admin_login(router: &axum::Router, username: &str, password: &str, pool: &sqlx::PgPool) -> String {
    insert_user(pool, username, password, true).await;
    login(router, username, password).await
}

async fn login(router: &axum::Router, username: &str, password: &str) -> String {
    let response = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/login",
            json!({"username": username, "password": password}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::OK, "login failed: {}", body);
    body["access_token"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn login_ok_uses_ver_claim() {
    let (_guard, settings, state) = setup().await;

    let username = format!("login_{}", &Uuid::new_v4().to_string()[..8]);
    let password = "hunter2!X";
    let user = insert_user(&state.pg, &username, password, false).await;

    let router = build_router_with(state, &settings);
    let token = login(&router, &username, password).await;

    let claims = decode_token(settings.jwt_secret.expose_secret(), &token)
        .expect("token should decode");
    assert_eq!(claims.sub, username);
    assert_eq!(claims.iss, "cypherglass");
    assert!(!claims.jti.is_empty());
    assert_eq!(claims.uid.as_deref(), Some(user.id.to_string().as_str()));
    assert_eq!(claims.ver.as_deref(), Some(password_ver(&user.password_hash).as_str()));
}

#[tokio::test]
async fn register_conflict_409_on_dup() {
    let (_guard, settings, state) = setup().await;

    let username = format!("u_{}", &Uuid::new_v4().to_string()[..8]);
    let email = format!("{}@example.com", &Uuid::new_v4().to_string()[..8]);
    let password = "hunter2!X";

    let router = build_router_with(state.clone(), &settings);

    // First registration succeeds.
    let response = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/register",
            json!({"username": username, "email": email, "password": password}),
            None,
        ))
        .await
        .unwrap();
    let (status, _) = body_json(response).await;
    assert_eq!(status, StatusCode::CREATED);

    // Duplicate username.
    let response = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/register",
            json!({"username": username, "email": format!("{}@example.com", Uuid::new_v4()), "password": password}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["detail"].as_str(), Some("username taken"));

    // Duplicate email.
    let response = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/register",
            json!({"username": format!("o_{}", &Uuid::new_v4().to_string()[..8]), "email": email, "password": password}),
            None,
        ))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["detail"].as_str(), Some("email taken"));
}

#[tokio::test]
async fn me_requires_bearer_401() {
    let (_guard, settings, state) = setup().await;

    let router = build_router_with(state, &settings);
    let response = router
        .oneshot(req(Method::GET, "/api/v1/auth/me", json!({}), None))
        .await
        .unwrap();
    let (status, _) = body_json(response).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn change_password_revokes_old_token_401() {
    let (_guard, settings, state) = setup().await;

    let username = format!("cp_{}", &Uuid::new_v4().to_string()[..8]);
    let old_password = "hunter2!X";
    insert_user(&state.pg, &username, old_password, false).await;

    let router = build_router_with(state.clone(), &settings);
    let token = login(&router, &username, old_password).await;

    // Change password.
    let response = router
        .clone()
        .oneshot(req(
            Method::POST,
            "/api/v1/auth/change-password",
            json!({"old_password": old_password, "new_password": "newhunter2!X"}),
            Some(&token),
        ))
        .await
        .unwrap();
    let (status, _) = body_json(response).await;
    assert_eq!(status, StatusCode::OK);

    // Old token should now be rejected.
    let response = router
        .oneshot(req(Method::GET, "/api/v1/auth/me", json!({}), Some(&token)))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["detail"].as_str(), Some("Invalid token"));
}

#[tokio::test]
async fn nonadmin_users_403() {
    let (_guard, settings, state) = setup().await;

    let username = format!("na_{}", &Uuid::new_v4().to_string()[..8]);
    insert_user(&state.pg, &username, "hunter2!X", false).await;

    let router = build_router_with(state, &settings);
    let token = login(&router, &username, "hunter2!X").await;

    let response = router
        .oneshot(req(
            Method::GET,
            "/api/v1/auth/users",
            json!({}),
            Some(&token),
        ))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["detail"].as_str(), Some("admin only"));
}

#[tokio::test]
async fn transient_seed_readonly() {
    {
        let _env_guard = ENV_LOCK.lock().await;
        env::set_var("ALLOW_SEED_FALLBACK", "1");
        env::set_var("SEED_ADMIN_USER", "seedadmin");
        env::set_var("SEED_ADMIN_PASSWORD", "seedpassword");
    }

    let (_db_guard, settings, state) = setup().await;

    let router = build_router_with(state, &settings);
    let token = login(&router, "seedadmin", "seedpassword").await;

    let response = router
        .oneshot(req(
            Method::PATCH,
            "/api/v1/auth/me",
            json!({"display_name": "nope"}),
            Some(&token),
        ))
        .await
        .unwrap();
    let (status, body) = body_json(response).await;

    {
        let _env_guard = ENV_LOCK.lock().await;
        env::remove_var("ALLOW_SEED_FALLBACK");
        env::remove_var("SEED_ADMIN_USER");
        env::remove_var("SEED_ADMIN_PASSWORD");
    }

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["detail"].as_str(), Some("transient session"));
}

#[tokio::test]
async fn seed_user_for_wrong_password_none() {
    let _guard = ENV_LOCK.lock().await;
    env::set_var("ALLOW_SEED_FALLBACK", "1");
    env::set_var("SEED_ADMIN_USER", "admin");
    env::set_var("SEED_ADMIN_PASSWORD", "s3cret");

    assert!(seed_user_for("admin", "wrong").is_none());

    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");
}

#[tokio::test]
async fn seed_user_for_wrong_identifier_none() {
    let _guard = ENV_LOCK.lock().await;
    env::set_var("ALLOW_SEED_FALLBACK", "1");
    env::set_var("SEED_ADMIN_USER", "admin");
    env::set_var("SEED_ADMIN_PASSWORD", "s3cret");

    assert!(seed_user_for("notadmin", "s3cret").is_none());

    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");
}

#[tokio::test]
async fn seed_user_for_correct_some() {
    let _guard = ENV_LOCK.lock().await;
    env::set_var("ALLOW_SEED_FALLBACK", "1");
    env::set_var("SEED_ADMIN_USER", "admin");
    env::set_var("SEED_ADMIN_PASSWORD", "s3cret");

    let user = seed_user_for("admin", "s3cret").expect("correct pair should match");
    assert_eq!(user.username, "admin");
    assert!(user.is_active);
    assert!(user.is_transient());

    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");
}

#[tokio::test]
async fn seed_user_for_unset_none() {
    let _guard = ENV_LOCK.lock().await;
    env::remove_var("ALLOW_SEED_FALLBACK");
    env::remove_var("SEED_ADMIN_USER");
    env::remove_var("SEED_ADMIN_PASSWORD");

    assert!(seed_user_for("admin", "admin").is_none());
}

#[tokio::test]
async fn db_unique_violation_classifies_email_and_username() {
    let (_guard, _settings, state) = setup().await;

    // Email conflict.
    let email = "dup@example.com";
    sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, is_active, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind("user_a")
    .bind(email)
    .bind("hash")
    .bind(true)
    .bind(false)
    .execute(&state.pg)
    .await
    .unwrap();

    let err = sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, is_active, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind("user_b")
    .bind(email)
    .bind("hash")
    .bind(true)
    .bind(false)
    .execute(&state.pg)
    .await
    .unwrap_err();

    let db_err = match err {
        sqlx::Error::Database(db_err) => db_err,
        other => panic!("expected database error, got {:?}", other),
    };
    assert_eq!(classify_unique_violation(&*db_err), AuthError::EmailTaken);

    // Username conflict.
    sqlx::query("TRUNCATE users CASCADE")
        .execute(&state.pg)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, is_active, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind("dupuser")
    .bind("a@example.com")
    .bind("hash")
    .bind(true)
    .bind(false)
    .execute(&state.pg)
    .await
    .unwrap();

    let err = sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, is_active, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(Uuid::new_v4())
    .bind("dupuser")
    .bind("b@example.com")
    .bind("hash")
    .bind(true)
    .bind(false)
    .execute(&state.pg)
    .await
    .unwrap_err();

    let db_err = match err {
        sqlx::Error::Database(db_err) => db_err,
        other => panic!("expected database error, got {:?}", other),
    };
    assert_eq!(classify_unique_violation(&*db_err), AuthError::UsernameTaken);
}

#[tokio::test]
async fn malformed_json_returns_422_json() {
    let (_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let response = router
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from("{bad json"))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(body["detail"].is_string());
}

#[tokio::test]
async fn missing_field_returns_422_json() {
    let (_guard, settings, state) = setup().await;
    let router = build_router_with(state, &settings);

    let response = router
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    let (status, body) = body_json(response).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(body["detail"].is_string());
}

#[tokio::test]
async fn users_query_validation_422() {
    let (_guard, settings, state) = setup().await;
    let router = build_router_with(state.clone(), &settings);
    let token = admin_login(&router, "adminval", "hunter2!X", &state.pg).await;

    let long_q = format!("/api/v1/auth/users?q={}", "x".repeat(65));
    let cases: Vec<(&str, StatusCode)> = vec![
        ("/api/v1/auth/users?limit=abc", StatusCode::UNPROCESSABLE_ENTITY),
        ("/api/v1/auth/users?limit=999", StatusCode::UNPROCESSABLE_ENTITY),
        ("/api/v1/auth/users?offset=-5", StatusCode::UNPROCESSABLE_ENTITY),
        (&long_q, StatusCode::UNPROCESSABLE_ENTITY),
        ("/api/v1/auth/users?limit=10&offset=0", StatusCode::OK),
    ];

    for (uri, expected) in cases {
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(uri)
                    .header("authorization", format!("Bearer {}", token))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let (status, body) = body_json(response).await;
        assert_eq!(
            status, expected,
            "{} returned unexpected status: {:?}",
            uri, body
        );
        if expected != StatusCode::OK {
            assert!(body["detail"].is_string(), "{} should have detail", uri);
        }
    }
}
