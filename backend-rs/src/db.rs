use sqlx::{migrate::MigrateError, postgres::PgPoolOptions, PgPool};
use std::env;
use uuid::Uuid;

/// A persisted `users` row.
///
/// The all-zero (`Uuid::nil()`) sentinel marks a transient, non-persisted
/// seed-fallback user. Use [`User::is_transient`] to detect it; write paths
/// must reject transient sessions.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub npub: Option<String>,
    pub avatar_url: Option<String>,
    pub password_hash: String,
    pub is_active: bool,
    pub is_admin: bool,
}

impl User {
    /// True when this user has no DB row (nil-Uuid seed fallback).
    pub fn is_transient(&self) -> bool {
        self.id == Uuid::nil()
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SocialAuth {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub uid: String,
}

/// Build a lazy Postgres connection pool from `url`.
pub fn pg_pool(url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(5)
        .connect_lazy(url)
        .expect("failed to create postgres pool")
}

/// Run the embedded idempotent migrations.
pub async fn run_migrations(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

/// Seed fallback is allowed only when explicitly opted in via `ALLOW_SEED_FALLBACK=1`.
pub fn seed_allowed() -> bool {
    env::var("ALLOW_SEED_FALLBACK").unwrap_or_default() == "1"
}

/// Return the identity-only seed user descriptor when seed fallback is
/// configured. This function performs **no credential check**; never use it
/// directly as an authentication decision. Compare credentials with
/// [`seed_user_for`] instead.
pub fn seed_user() -> Option<User> {
    if !seed_allowed() {
        return None;
    }
    let username = env::var("SEED_ADMIN_USER").unwrap_or_default();
    let password = env::var("SEED_ADMIN_PASSWORD").unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return None;
    }
    Some(User {
        id: Uuid::nil(),
        username,
        email: None,
        display_name: None,
        npub: None,
        avatar_url: None,
        password_hash: String::new(),
        is_active: true,
        is_admin: false,
    })
}

/// Verify credentials against the configured seed admin credentials.
/// This mirrors the gating in `backend/app/auth/service.py`.
pub fn seed_user_for(identifier: &str, password: &str) -> Option<User> {
    let user = seed_user()?;
    let expected_user = env::var("SEED_ADMIN_USER").unwrap_or_default();
    let expected_password = env::var("SEED_ADMIN_PASSWORD").unwrap_or_default();
    if identifier == expected_user && password == expected_password {
        Some(user)
    } else {
        None
    }
}
