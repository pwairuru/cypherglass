use axum::extract::rejection::{JsonRejection, QueryRejection};
use axum::extract::{ConnectInfo, FromRequest, FromRequestParts, Path, Query, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Error as SqlxError, PgPool};
use std::net::SocketAddr;
use std::ops::Deref;
use uuid::Uuid;

use crate::auth::nostr::{is_nip98, NostrEvent};
use crate::auth::oauth::{complete_oauth, get_oauth_url, sanitize_username, OAuthError};
use crate::auth::password::{hash_password, password_ver, verify_password};
use crate::auth::token::{create_token, decode_token};
use crate::auth::validation::{AdminUserUpdate, ChangePasswordIn, LoginIn, MeUpdate, RegisterIn};
use crate::db::{seed_allowed, seed_user_for, User};
use crate::store::{random_hex32, rate_limiter, store, CHALLENGE_TTL_SECS};
use crate::AppState;
use secrecy::ExposeSecret;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/auth/login", axum::routing::post(login))
        .route("/api/v1/auth/register", axum::routing::post(register))
        .route("/api/v1/auth/me", axum::routing::get(me).patch(update_me))
        .route(
            "/api/v1/auth/change-password",
            axum::routing::post(change_password),
        )
        .route("/api/v1/auth/users", axum::routing::get(list_users))
        .route(
            "/api/v1/auth/users/{user_id}",
            axum::routing::patch(admin_update_user),
        )
        .route(
            "/api/v1/auth/nostr/challenge",
            axum::routing::post(nostr_challenge),
        )
        .route(
            "/api/v1/auth/nostr/verify",
            axum::routing::post(nostr_verify),
        )
        .route(
            "/api/v1/auth/oauth/{provider}/start",
            axum::routing::get(oauth_start),
        )
        .route(
            "/api/v1/auth/oauth/{provider}/callback",
            axum::routing::get(oauth_callback),
        )
}

#[derive(Debug, PartialEq)]
pub enum AuthError {
    InvalidCredentials,
    NotAuthenticated,
    InvalidToken,
    TransientSession,
    UsernameTaken,
    EmailTaken,
    UpdateConflict,
    AdminOnly,
    UserNotFound,
    IncorrectPassword,
    NewPasswordMustDiffer,
    PasswordChangeUnavailable,
    BadRequest(&'static str),
    UnprocessableEntity(&'static str),
    RateLimited,
    NostrInvalid,
    UnknownChallenge,
    ProviderError,
    InvalidState,
    StoreUnavailable,
    OAuthInvalidLogin,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, detail) = match self {
            AuthError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "Invalid credentials"),
            AuthError::NotAuthenticated => (StatusCode::UNAUTHORIZED, "Not authenticated"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token"),
            AuthError::TransientSession => (StatusCode::UNAUTHORIZED, "transient session"),
            AuthError::UsernameTaken => (StatusCode::CONFLICT, "username taken"),
            AuthError::EmailTaken => (StatusCode::CONFLICT, "email taken"),
            AuthError::UpdateConflict => (StatusCode::CONFLICT, "update conflict"),
            AuthError::AdminOnly => (StatusCode::FORBIDDEN, "admin only"),
            AuthError::UserNotFound => (StatusCode::NOT_FOUND, "user not found"),
            AuthError::IncorrectPassword => (StatusCode::BAD_REQUEST, "incorrect password"),
            AuthError::NewPasswordMustDiffer => {
                (StatusCode::BAD_REQUEST, "new password must differ")
            }
            AuthError::PasswordChangeUnavailable => {
                (StatusCode::BAD_REQUEST, "password change unavailable")
            }
            AuthError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AuthError::UnprocessableEntity(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg),
            AuthError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate limited"),
            AuthError::NostrInvalid => (StatusCode::UNAUTHORIZED, "invalid_nostr_event"),
            AuthError::UnknownChallenge => (StatusCode::NOT_FOUND, "unknown_challenge"),
            AuthError::ProviderError => (StatusCode::BAD_GATEWAY, "provider_error"),
            AuthError::InvalidState => (StatusCode::BAD_REQUEST, "invalid_state"),
            AuthError::StoreUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "challenge store unavailable",
            ),
            AuthError::OAuthInvalidLogin => (StatusCode::UNAUTHORIZED, "invalid_oauth_login"),
        };
        (status, Json(json!({ "detail": detail }))).into_response()
    }
}

pub struct AppJson<T>(pub T);

impl<T, S> FromRequest<S> for AppJson<T>
where
    T: serde::de::DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request(
        req: axum::http::Request<axum::body::Body>,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(req, state).await {
            Ok(value) => Ok(AppJson(value.0)),
            Err(rejection) => {
                let detail = match rejection {
                    JsonRejection::JsonSyntaxError(_) => "invalid json",
                    JsonRejection::JsonDataError(_) => "invalid request data",
                    JsonRejection::MissingJsonContentType(_) => "missing content-type",
                    _ => "invalid request body",
                };
                Err(AuthError::UnprocessableEntity(detail))
            }
        }
    }
}

impl<T> Deref for AppJson<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub struct AppQuery<T>(pub T);

impl<T, S> FromRequestParts<S> for AppQuery<T>
where
    T: serde::de::DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match Query::<T>::from_request_parts(parts, state).await {
            Ok(value) => Ok(AppQuery(value.0)),
            Err(rejection) => {
                let detail = match rejection {
                    QueryRejection::FailedToDeserializeQueryString(_) => "invalid query parameters",
                    _ => "invalid query",
                };
                Err(AuthError::UnprocessableEntity(detail))
            }
        }
    }
}

impl<T> Deref for AppQuery<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

pub struct ClientIp(pub String);

impl<S> FromRequestParts<S> for ClientIp
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Production traffic arrives via Caddy on the same host (127.0.0.1/::1).
        // Trust X-Forwarded-For only from loopback peers; otherwise use the socket peer
        // and ignore a spoofed XFF header.
        let socket_ip = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|addr| addr.ip());

        if socket_ip.map(|ip| ip.is_loopback()).unwrap_or(false) {
            if let Some(ip) = parts
                .headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
            {
                return Ok(ClientIp(
                    ip.split(',').next().unwrap_or("unknown").trim().to_string(),
                ));
            }
        }

        if let Some(ip) = socket_ip {
            return Ok(ClientIp(ip.to_string()));
        }

        Ok(ClientIp("unknown".to_string()))
    }
}

fn is_setup_error(err: &SqlxError) -> bool {
    matches!(
        err,
        SqlxError::Database(_)
            | SqlxError::Io(_)
            | SqlxError::PoolTimedOut
            | SqlxError::PoolClosed
            | SqlxError::Tls(_)
    )
}

pub fn classify_unique_violation(db_err: &dyn sqlx::error::DatabaseError) -> AuthError {
    if db_err.constraint() == Some("ix_users_email") {
        return AuthError::EmailTaken;
    }
    // Fallback for drivers/locales that do not surface the constraint name.
    if db_err.message().to_lowercase().contains("email") {
        return AuthError::EmailTaken;
    }
    AuthError::UsernameTaken
}

async fn fetch_user_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, SqlxError> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
         FROM users WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

async fn fetch_user_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, SqlxError> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
         FROM users WHERE email = $1",
    )
    .bind(email.to_lowercase())
    .fetch_optional(pool)
    .await
}

async fn fetch_user_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, SqlxError> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn any_user_exists(pool: &PgPool) -> Result<bool, SqlxError> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    Ok(row.0 > 0)
}

async fn authenticate(pool: &PgPool, identifier: &str, password: &str) -> Option<User> {
    let mut user_result = fetch_user_by_username(pool, identifier).await;
    if user_result
        .as_ref()
        .ok()
        .map(|u| u.is_none())
        .unwrap_or(false)
        && identifier.contains('@')
    {
        user_result = fetch_user_by_email(pool, identifier).await;
    }

    match user_result {
        Ok(Some(user)) => {
            if !user.is_active {
                return None;
            }
            if verify_password(password, &user.password_hash) {
                Some(user)
            } else {
                None
            }
        }
        Ok(None) => {
            // Identifier not found: allow seed fallback only when the table is empty
            // or unreachable; fail-closed once real users exist.
            match any_user_exists(pool).await {
                Ok(true) => None,
                Ok(false) => seed_user_for(identifier, password),
                Err(ref e) if is_setup_error(e) => seed_user_for(identifier, password),
                Err(_) => None,
            }
        }
        Err(ref e) if is_setup_error(e) => seed_user_for(identifier, password),
        Err(_) => None,
    }
}

async fn get_current_userinfo(pool: &PgPool, secret: &str, token: &str) -> Result<User, AuthError> {
    let claims = decode_token(secret, token).map_err(|_| AuthError::InvalidToken)?;
    if claims.sub.is_empty() {
        return Err(AuthError::InvalidToken);
    }

    let mut user: Option<User> = None;
    if let Some(uid_str) = &claims.uid {
        if let Ok(uid) = Uuid::parse_str(uid_str) {
            match fetch_user_by_id(pool, uid).await {
                Ok(u) => user = u,
                Err(ref e) if is_setup_error(e) => user = None,
                Err(_) => return Err(AuthError::InvalidToken),
            }
        }
    }

    if user.is_none() {
        match fetch_user_by_username(pool, &claims.sub).await {
            Ok(u) => user = u,
            Err(ref e) if is_setup_error(e) => user = None,
            Err(_) => return Err(AuthError::InvalidToken),
        }
    }

    if let Some(user) = user {
        if !user.is_active {
            return Err(AuthError::InvalidToken);
        }
        if let Some(tok_ver) = claims.ver {
            if tok_ver != password_ver(&user.password_hash) {
                return Err(AuthError::InvalidToken);
            }
        }
        return Ok(user);
    }

    // Dev seed fallback: token proves a prior successful seed login.
    // We use seed_user() identity-only; credential checks happened at login.
    if seed_allowed() {
        if let Some(user) = crate::db::seed_user() {
            if user.username == claims.sub {
                return Ok(user);
            }
        }
    }

    Err(AuthError::InvalidToken)
}

pub struct CurrentUser(pub User);

impl axum::extract::FromRequestParts<AppState> for CurrentUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .ok_or(AuthError::NotAuthenticated)?;
        let value = header.to_str().map_err(|_| AuthError::InvalidToken)?;
        let (scheme, token) = value.split_once(' ').ok_or(AuthError::InvalidToken)?;
        if !scheme.eq_ignore_ascii_case("bearer") {
            return Err(AuthError::InvalidToken);
        }
        let secret = state.jwt_secret.expose_secret();
        let user = get_current_userinfo(&state.pg, secret, token).await?;
        Ok(CurrentUser(user))
    }
}

pub struct AdminUser(pub User);

impl axum::extract::FromRequestParts<AppState> for AdminUser {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let CurrentUser(user) = CurrentUser::from_request_parts(parts, state).await?;
        if user.is_transient() || !user.is_admin {
            return Err(AuthError::AdminOnly);
        }
        Ok(AdminUser(user))
    }
}

async fn providers_for(pool: &PgPool, user: &User) -> Vec<String> {
    if user.is_transient() {
        return Vec::new();
    }
    sqlx::query_as::<_, (String,)>("SELECT provider FROM social_auth WHERE user_id = $1")
        .bind(user.id)
        .fetch_all(pool)
        .await
        .map(|rows| rows.into_iter().map(|r| r.0).collect())
        .unwrap_or_default()
}

fn me_out(user: &User, providers: Vec<String>) -> Value {
    json!({
        "id": user.id.to_string(),
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "npub": user.npub,
        "avatar_url": user.avatar_url,
        "is_admin": user.is_admin,
        "providers": providers,
    })
}

fn user_out(user: &User) -> Value {
    json!({
        "id": user.id.to_string(),
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "npub": user.npub,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
    })
}

async fn login(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    AppJson(data): AppJson<LoginIn>,
) -> Result<(StatusCode, Json<Value>), AuthError> {
    data.validate().map_err(AuthError::UnprocessableEntity)?;

    let limiter = rate_limiter();
    if !limiter.check(&format!("login:{}", data.username), 30).await
        || !limiter.check(&format!("login-ip:{}", ip), 30).await
    {
        return Err(AuthError::RateLimited);
    }

    let user = authenticate(&state.pg, &data.username, &data.password)
        .await
        .ok_or(AuthError::InvalidCredentials)?;
    if !user.is_active {
        return Err(AuthError::InvalidCredentials);
    }

    let secret = state.jwt_secret.expose_secret();
    let token = create_token(
        secret,
        &user.username,
        Some(&user.id.to_string()),
        Some(&password_ver(&user.password_hash)),
        state.jwt_expire_min,
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
        })),
    ))
}

async fn register(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    AppJson(data): AppJson<RegisterIn>,
) -> Result<(StatusCode, Json<Value>), AuthError> {
    data.validate().map_err(AuthError::UnprocessableEntity)?;

    let limiter = rate_limiter();
    if !limiter
        .check(&format!("register:{}", data.username), 30)
        .await
        || !limiter.check(&format!("register-ip:{}", ip), 10).await
    {
        return Err(AuthError::RateLimited);
    }

    let existing = fetch_user_by_username(&state.pg, &data.username)
        .await
        .map_err(|_| AuthError::UpdateConflict)?;
    if existing.is_some() {
        return Err(AuthError::UsernameTaken);
    }

    let email = data.email.as_ref().map(|e| e.to_lowercase());
    if let Some(email) = &email {
        let dup = fetch_user_by_email(&state.pg, email)
            .await
            .map_err(|_| AuthError::UpdateConflict)?;
        if dup.is_some() {
            return Err(AuthError::EmailTaken);
        }
    }

    let user_id = Uuid::new_v4();
    let password_hash = hash_password(&data.password);

    let insert_result = sqlx::query(
        "INSERT INTO users (
            id, username, email, password_hash, is_active, is_admin, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    )
    .bind(user_id)
    .bind(&data.username)
    .bind(&email)
    .bind(&password_hash)
    .bind(true)
    .bind(false)
    .execute(&state.pg)
    .await;

    match insert_result {
        Ok(_) => {}
        Err(SqlxError::Database(db_err)) if db_err.is_unique_violation() => {
            return Err(classify_unique_violation(&*db_err));
        }
        Err(_) => return Err(AuthError::UpdateConflict),
    }

    let secret = state.jwt_secret.expose_secret();
    let token = create_token(
        secret,
        &data.username,
        Some(&user_id.to_string()),
        Some(&password_ver(&password_hash)),
        state.jwt_expire_min,
    );

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
        })),
    ))
}

async fn me(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> Result<Json<Value>, AuthError> {
    let providers = providers_for(&state.pg, &user).await;
    Ok(Json(me_out(&user, providers)))
}

async fn update_me(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(data): AppJson<MeUpdate>,
) -> Result<Json<Value>, AuthError> {
    data.validate().map_err(AuthError::UnprocessableEntity)?;

    if user.is_transient() {
        return Err(AuthError::TransientSession);
    }

    let email: Option<String> = data.email.as_ref().map(|e| e.to_lowercase());
    if let Some(ref e) = email {
        let dup = fetch_user_by_email(&state.pg, e)
            .await
            .map_err(|_| AuthError::UpdateConflict)?;
        if let Some(dup) = dup {
            if dup.id != user.id {
                return Err(AuthError::EmailTaken);
            }
        }
    }

    let display_name = data.display_name.as_ref().map(|d| d.trim().to_string());
    let display_name = display_name.as_deref().and_then(|d| {
        if d.is_empty() {
            None
        } else {
            Some(d.to_string())
        }
    });
    let avatar_url = data.avatar_url.as_ref().map(|u| u.trim().to_string());
    let avatar_url = avatar_url.as_deref().and_then(|u| {
        if u.is_empty() {
            None
        } else {
            Some(u.to_string())
        }
    });

    let update_result = sqlx::query(
        "UPDATE users
         SET email = COALESCE($1, email),
             display_name = COALESCE($2, display_name),
             avatar_url = COALESCE($3, avatar_url),
             updated_at = NOW()
         WHERE id = $4",
    )
    .bind(&email)
    .bind(&display_name)
    .bind(&avatar_url)
    .bind(user.id)
    .execute(&state.pg)
    .await;

    match update_result {
        Ok(_) => {}
        Err(SqlxError::Database(db_err)) if db_err.is_unique_violation() => {
            return Err(AuthError::EmailTaken);
        }
        Err(_) => return Err(AuthError::UpdateConflict),
    }

    let updated = fetch_user_by_id(&state.pg, user.id)
        .await
        .map_err(|_| AuthError::UpdateConflict)?
        .ok_or(AuthError::InvalidToken)?;
    let providers = providers_for(&state.pg, &updated).await;
    Ok(Json(me_out(&updated, providers)))
}

async fn change_password(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    AppJson(data): AppJson<ChangePasswordIn>,
) -> Result<Json<Value>, AuthError> {
    data.validate().map_err(AuthError::UnprocessableEntity)?;

    if user.is_transient() {
        return Err(AuthError::TransientSession);
    }
    if user.password_hash.is_empty() {
        return Err(AuthError::PasswordChangeUnavailable);
    }
    if !verify_password(&data.old_password, &user.password_hash) {
        return Err(AuthError::IncorrectPassword);
    }
    if data.old_password == data.new_password {
        return Err(AuthError::NewPasswordMustDiffer);
    }

    let new_hash = hash_password(&data.new_password);
    sqlx::query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2")
        .bind(&new_hash)
        .bind(user.id)
        .execute(&state.pg)
        .await
        .map_err(|_| AuthError::UpdateConflict)?;

    // Rotate the session token: the old token's password version died with
    // the old hash, so mint a fresh one and keep this session alive. All
    // other sessions stay revoked.
    let secret = state.jwt_secret.expose_secret();
    let token = create_token(
        secret,
        &user.username,
        Some(&user.id.to_string()),
        Some(&password_ver(&new_hash)),
        state.jwt_expire_min,
    );

    Ok(Json(
        json!({ "ok": true, "access_token": token, "token_type": "bearer" }),
    ))
}

#[derive(Debug, Deserialize)]
struct ListUsersQuery {
    q: Option<String>,
    active: Option<bool>,
    #[serde(default = "default_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_limit() -> i64 {
    50
}

fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

async fn list_users(
    State(state): State<AppState>,
    AdminUser(_admin): AdminUser,
    AppQuery(query): AppQuery<ListUsersQuery>,
) -> Result<Json<Value>, AuthError> {
    if let Some(q) = &query.q {
        if q.len() > 64 {
            return Err(AuthError::UnprocessableEntity(
                "q must be at most 64 characters",
            ));
        }
    }
    if query.limit < 1 || query.limit > 200 {
        return Err(AuthError::UnprocessableEntity(
            "limit must be between 1 and 200",
        ));
    }
    if query.offset < 0 {
        return Err(AuthError::UnprocessableEntity(
            "offset must be non-negative",
        ));
    }

    let rows: Vec<User> = if let Some(q) = query.q.as_ref().filter(|s| !s.is_empty()) {
        let like = format!("%{}%", escape_like(q));
        sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users
             WHERE (username ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\')
               AND ($2::bool IS NULL OR is_active = $2)
             ORDER BY created_at
             OFFSET $3 LIMIT $4",
        )
        .bind(&like)
        .bind(query.active)
        .bind(query.offset)
        .bind(query.limit)
        .fetch_all(&state.pg)
        .await
        .map_err(|_| AuthError::UpdateConflict)?
    } else {
        sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users
             WHERE ($1::bool IS NULL OR is_active = $1)
             ORDER BY created_at
             OFFSET $2 LIMIT $3",
        )
        .bind(query.active)
        .bind(query.offset)
        .bind(query.limit)
        .fetch_all(&state.pg)
        .await
        .map_err(|_| AuthError::UpdateConflict)?
    };

    let out: Vec<Value> = rows.iter().map(user_out).collect();
    Ok(Json(Value::Array(out)))
}

async fn admin_update_user(
    State(state): State<AppState>,
    AdminUser(_admin): AdminUser,
    Path(user_id): Path<String>,
    AppJson(data): AppJson<AdminUserUpdate>,
) -> Result<Json<Value>, AuthError> {
    data.validate().map_err(AuthError::UnprocessableEntity)?;

    let id = Uuid::parse_str(&user_id).map_err(|_| AuthError::UserNotFound)?;
    let user = fetch_user_by_id(&state.pg, id)
        .await
        .map_err(|_| AuthError::UpdateConflict)?
        .ok_or(AuthError::UserNotFound)?;

    let is_active = data.is_active.unwrap_or(user.is_active);
    let is_admin = data.is_admin.unwrap_or(user.is_admin);
    let display_name = data.display_name.as_ref().map(|d| d.trim().to_string());
    let display_name = display_name.as_deref().and_then(|d| {
        if d.is_empty() {
            None
        } else {
            Some(d.to_string())
        }
    });

    let update_result = sqlx::query(
        "UPDATE users
         SET is_active = $1,
             is_admin = $2,
             display_name = COALESCE($3, display_name),
             updated_at = NOW()
         WHERE id = $4",
    )
    .bind(is_active)
    .bind(is_admin)
    .bind(&display_name)
    .bind(user.id)
    .execute(&state.pg)
    .await;

    match update_result {
        Ok(_) => {}
        Err(SqlxError::Database(db_err)) if db_err.is_unique_violation() => {
            return Err(AuthError::UpdateConflict);
        }
        Err(_) => return Err(AuthError::UpdateConflict),
    }

    let updated = fetch_user_by_id(&state.pg, user.id)
        .await
        .map_err(|_| AuthError::UpdateConflict)?
        .ok_or(AuthError::UserNotFound)?;
    Ok(Json(user_out(&updated)))
}

#[derive(Debug, Deserialize)]
struct NostrChallengeIn {
    pubkey: String,
}

#[derive(Debug, serde::Serialize)]
struct NostrChallengeOut {
    challenge: String,
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct NostrVerifyIn {
    event: NostrEvent,
}

fn is_hex64(v: &str) -> bool {
    v.len() == 64 && v.chars().all(|c| c.is_ascii_hexdigit())
}

async fn nostr_challenge(
    State(_state): State<AppState>,
    ClientIp(ip): ClientIp,
    AppJson(data): AppJson<NostrChallengeIn>,
) -> Result<Json<NostrChallengeOut>, AuthError> {
    if !is_hex64(&data.pubkey) {
        return Err(AuthError::UnprocessableEntity(
            "pubkey must be 64 hex chars",
        ));
    }
    let pubkey = data.pubkey.to_lowercase();
    let limiter = rate_limiter();
    if !limiter.check(&format!("nostr-chal-ip:{}", ip), 20).await
        || !limiter.check(&format!("nostr-chal:{}", pubkey), 20).await
    {
        return Err(AuthError::RateLimited);
    }
    let challenge = random_hex32();
    store()
        .issue_challenge(&pubkey, &challenge)
        .await
        .map_err(|_| AuthError::StoreUnavailable)?;
    Ok(Json(NostrChallengeOut {
        challenge,
        expires_in: CHALLENGE_TTL_SECS,
    }))
}

async fn nostr_verify(
    State(state): State<AppState>,
    AppJson(data): AppJson<NostrVerifyIn>,
) -> Result<(StatusCode, Json<Value>), AuthError> {
    let ev = data.event;
    if !is_hex64(&ev.pubkey) || !crate::auth::nostr::verify_nostr_event(&ev) {
        return Err(AuthError::NostrInvalid);
    }
    let now = chrono::Utc::now().timestamp();
    let window = if is_nip98(&ev) { 60 } else { 300 };
    if now.abs_diff(ev.created_at) > window as u64 {
        return Err(AuthError::NostrInvalid);
    }
    let pubkey = ev.pubkey.to_lowercase();
    let pending = store()
        .get_challenge(&pubkey)
        .await
        .map_err(|_| AuthError::StoreUnavailable)?;
    if pending.is_none() {
        return Err(AuthError::UnknownChallenge);
    }
    let ok = store()
        .consume_challenge(&pubkey, &ev.content)
        .await
        .map_err(|_| AuthError::StoreUnavailable)?;
    if !ok {
        return Err(AuthError::NostrInvalid);
    }

    let user = link_or_create_nostr_user(&state.pg, &pubkey, &ev.content).await?;
    let secret = state.jwt_secret.expose_secret();
    let token = create_token(
        secret,
        &user.username,
        Some(&user.id.to_string()),
        Some(&password_ver(&user.password_hash)),
        state.jwt_expire_min,
    );
    Ok((
        StatusCode::OK,
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
        })),
    ))
}

async fn link_or_create_nostr_user(
    pool: &PgPool,
    pubkey: &str,
    _content: &str,
) -> Result<User, AuthError> {
    let mut tx = pool.begin().await.map_err(|_| AuthError::NostrInvalid)?;
    let link: Option<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM social_auth WHERE provider = 'nostr' AND uid = $1")
            .bind(pubkey)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| AuthError::NostrInvalid)?;

    let mut user: Option<User> = None;
    if let Some((user_id,)) = link {
        user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| AuthError::NostrInvalid)?;
    }

    if user.is_none() {
        user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users WHERE npub = $1",
        )
        .bind(pubkey)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| AuthError::NostrInvalid)?;
    }

    if user.is_none() {
        let base = format!("nostr_{}", &pubkey[..8]);
        let mut username = base.clone();
        let mut suffix = 1;
        while sqlx::query_as::<_, (i32,)>("SELECT 1 FROM users WHERE username = $1")
            .bind(&username)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| AuthError::NostrInvalid)?
            .is_some()
        {
            suffix += 1;
            username = format!("{}_{}", base, suffix);
        }
        let user_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (
                id, username, npub, password_hash, is_active, is_admin, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
        )
        .bind(user_id)
        .bind(&username)
        .bind(pubkey)
        .bind("")
        .bind(true)
        .bind(false)
        .execute(&mut *tx)
        .await
        .map_err(|_| AuthError::NostrInvalid)?;
        user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| AuthError::NostrInvalid)
        .ok();
    }

    if let Some(ref u) = user {
        let exists: Option<(i32,)> =
            sqlx::query_as("SELECT 1 FROM social_auth WHERE provider = 'nostr' AND uid = $1")
                .bind(pubkey)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| AuthError::NostrInvalid)?;
        if exists.is_none() {
            sqlx::query(
                "INSERT INTO social_auth (id, user_id, provider, uid, extra_data, created_at)
                 VALUES ($1, $2, 'nostr', $3, $4, NOW())",
            )
            .bind(Uuid::new_v4())
            .bind(u.id)
            .bind(pubkey)
            .bind(json!({}))
            .execute(&mut *tx)
            .await
            .map_err(|_| AuthError::NostrInvalid)?;
        }
    }

    tx.commit().await.map_err(|_| AuthError::NostrInvalid)?;
    let user = user.ok_or(AuthError::NostrInvalid)?;
    if !user.is_active {
        return Err(AuthError::NostrInvalid);
    }
    Ok(user)
}

#[derive(Debug, Deserialize)]
struct OAuthCallbackQuery {
    code: String,
    state: String,
}

async fn oauth_start(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Path(provider): Path<String>,
) -> Result<Json<Value>, AuthError> {
    if !rate_limiter()
        .check(&format!("oauth-start-ip:{}", ip), 20)
        .await
    {
        return Err(AuthError::RateLimited);
    }
    let out = get_oauth_url(&provider, &state).map_err(|e| match e {
        OAuthError::UnknownProvider => AuthError::BadRequest("unknown provider"),
        _ => AuthError::ProviderError,
    })?;
    // State store errors are swallowed and fall back to memory, matching Python.
    let _ = store().issue_state(&out.state).await;
    Ok(Json(json!({
        "auth_url": out.auth_url,
        "state": out.state,
    })))
}

async fn oauth_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    AppQuery(query): AppQuery<OAuthCallbackQuery>,
) -> Result<(StatusCode, Json<Value>), AuthError> {
    if !["google", "github"].contains(&provider.as_str()) {
        return Err(AuthError::BadRequest("unknown provider"));
    }
    if query.code.is_empty() || query.state.is_empty() {
        return Err(AuthError::BadRequest("missing code or state"));
    }
    if !store()
        .consume_state(&query.state)
        .await
        .map_err(|_| AuthError::InvalidState)?
    {
        return Err(AuthError::InvalidState);
    }
    let identity = complete_oauth(&provider, &query.code, &state)
        .await
        .map_err(|e| match e {
            OAuthError::UnknownProvider => AuthError::BadRequest("unknown provider"),
            _ => AuthError::ProviderError,
        })?;
    if identity.uid.is_empty() {
        return Err(AuthError::ProviderError);
    }

    let user = link_or_create_oauth_user(&state.pg, &identity).await?;
    let secret = state.jwt_secret.expose_secret();
    let token = create_token(
        secret,
        &user.username,
        Some(&user.id.to_string()),
        Some(&password_ver(&user.password_hash)),
        state.jwt_expire_min,
    );
    Ok((
        StatusCode::OK,
        Json(json!({
            "access_token": token,
            "token_type": "bearer",
        })),
    ))
}

async fn link_or_create_oauth_user(
    pool: &PgPool,
    identity: &crate::auth::oauth::Identity,
) -> Result<User, AuthError> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| AuthError::OAuthInvalidLogin)?;
    let link: Option<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM social_auth WHERE provider = $1 AND uid = $2")
            .bind(&identity.provider)
            .bind(&identity.uid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| AuthError::OAuthInvalidLogin)?;

    let mut user: Option<User> = None;
    if let Some((user_id,)) = link {
        user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| AuthError::OAuthInvalidLogin)?;
    }

    if user.is_none() {
        let email = identity.email.as_ref().map(|e| e.to_lowercase());
        let local = email
            .as_ref()
            .map(|e| e.split('@').next().unwrap_or("").to_string())
            .unwrap_or_default();
        let fallback = format!(
            "{}_{}",
            identity.provider,
            &identity.uid[..identity.uid.len().min(8)]
        );
        let base = sanitize_username(&local, &fallback);
        let mut username = base.clone();
        let mut suffix = 1;
        while sqlx::query_as::<_, (i32,)>("SELECT 1 FROM users WHERE username = $1")
            .bind(&username)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| AuthError::OAuthInvalidLogin)?
            .is_some()
        {
            suffix += 1;
            username = format!("{}_{}", base, suffix);
        }
        let user_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (
                id, username, email, display_name, avatar_url, password_hash, is_active, is_admin, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())",
        )
        .bind(user_id)
        .bind(&username)
        .bind(&email)
        .bind(&identity.name)
        .bind(&identity.avatar_url)
        .bind("")
        .bind(true)
        .bind(false)
        .execute(&mut *tx)
        .await
        .map_err(|_| AuthError::OAuthInvalidLogin)?;
        user = sqlx::query_as::<_, User>(
            "SELECT id, username, email, display_name, npub, avatar_url, password_hash, is_active, is_admin
             FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| AuthError::OAuthInvalidLogin)
        .ok();
    }

    if let Some(ref u) = user {
        let exists: Option<(i32,)> =
            sqlx::query_as("SELECT 1 FROM social_auth WHERE provider = $1 AND uid = $2")
                .bind(&identity.provider)
                .bind(&identity.uid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| AuthError::OAuthInvalidLogin)?;
        if exists.is_none() {
            sqlx::query(
                "INSERT INTO social_auth (id, user_id, provider, uid, extra_data, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())",
            )
            .bind(Uuid::new_v4())
            .bind(u.id)
            .bind(&identity.provider)
            .bind(&identity.uid)
            .bind(json!({}))
            .execute(&mut *tx)
            .await
            .map_err(|_| AuthError::OAuthInvalidLogin)?;
        }
    }

    tx.commit()
        .await
        .map_err(|_| AuthError::OAuthInvalidLogin)?;
    let user = user.ok_or(AuthError::OAuthInvalidLogin)?;
    if !user.is_active {
        return Err(AuthError::OAuthInvalidLogin);
    }
    Ok(user)
}
