# Backend Rust Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Python `backend/` to Rust Axum workspace with identical HTTP contract, backed by Postgres, ClickHouse, Valkey.

**Architecture:** New `backend-rs/` Cargo workspace with `api` + `worker` binaries and shared `auth`, `metrics`, `db`, `ch` libs. SQL ported verbatim from `registry.py`. Compose swaps `api`/`worker` build context to `backend-rs`; Go decoder, ClickHouse, PG, Valkey untouched.

**Tech Stack:** Rust 1.99, axum 0.8, tokio 1, tower-http 0.6, serde/serde_json, sqlx 0.8 (postgres+uuid+chrono), `clickhouse` official crate (fallback `reqwest` 0.12 to HTTP 8123), jsonwebtoken 9, bcrypt, secp256k1 (schnorr), oauth2 5, `redis` crate against Valkey (keep `VALKEY_URL` name), tracing, dotenvy.

**Spec:** Current behavior is spec — `backend/app/main.py`, `backend/app/auth/router.py`, `backend/app/auth/service.py`, `backend/app/auth/deps.py`, `backend/app/auth/models.py`, `backend/app/auth/psa.py`, `backend/app/auth/nostr_crypto.py`, `backend/app/auth/challenge_store.py`, `backend/app/auth/oauth_state_store.py`, `backend/app/metrics/registry.py`, `backend/app/metrics/service.py`, `backend/app/metrics/router.py`, `backend/app/ch.py`, `backend/app/db.py`, `backend/app/config.py`, `backend/app/workers/price.py`, `backend/app/workers/celery_app.py`, `backend/migrations/001_auth_user_social.py`, `frontend/src/lib/api.ts`, `frontend/src/routes/Dashboard.tsx`, `docker-compose.yml`.

## Global Constraints

- Route + status parity: `GET /health`, `GET /ready`, `POST /api/v1/auth/login`, `POST /api/v1/auth/register` (201), `GET/PATCH /api/v1/auth/me`, `POST /api/v1/auth/change-password`, `GET /api/v1/auth/users`, `PATCH /api/v1/auth/users/{id}`, `POST /api/v1/auth/nostr/challenge`, `POST /api/v1/auth/nostr/verify`, `GET /api/v1/auth/oauth/{provider}/start`, `GET /api/v1/auth/oauth/{provider}/callback`, `GET /api/v1/metrics`, `GET /api/v1/metrics/coverage`, `GET /api/v1/metrics/{id}/series?from&to`, `GET /api/v1/metrics/price_ohlc_{grain}/ohlc?from&to`; errors 400/401/403/404/409/422/429/502/503 mapped as today.
- JWT: HS256 only, `iss=cypherglass`, require `sub`+`exp`+`iss`, `ver`=sha256(pw_hash)[:16] revocation, old tokens without `ver`/`uid` keep working, `JWT_SECRET` >=32 bytes.
- TTLs: Nostr challenge 300s, OAuth state 600s; keys `nostr:chal:{pubkey}`, `oauth:state:{state}`; env stays `VALKEY_URL` (Valkey naming, never `REDIS_URL` in new code).
- Rate limits per 60s window: 30 general, 20 challenge, 20 oauth-start, 10 register.
- CORS `allow_methods=["GET","POST","PATCH"]`, headers `Authorization,Content-Type`; security headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS `max-age=63072000; includeSubDomains`; audit log auth/admin/4xx only.
- Metrics SQL copied verbatim from `registry.py` (only `mv_*`/`marts.*`/`price_ohlc_*`, `-Merge`/`argMax` combinators); every series appends `LIMIT 5000`; hourly range max 370d, daily max 1826d, `from<=to` else 422.
- Seed fallback only when `ALLOW_SEED_FALLBACK=1` + `SEED_ADMIN_USER/PASSWORD` set; transient user read-only (writes 401).

## Review Focus

- Replayed Nostr challenge content reuse must 401 (single-use compare-del) — pinned in Task 4.
- Reused/forged OAuth `state` must 400 (single-use delete) — pinned in Task 4.
- Token issued before password change must 401 after change (`ver` mismatch), old no-`ver` tokens still pass — pinned in Task 3.
- `from>to` and over-range windows must 422 with `range too large`/`from must be <= to` — pinned in Task 5.
- Empty ClickHouse coverage must 404 `No coverage yet`; series with null values must set `stale:true` not 500 — pinned in Task 5.

---

### Task 1: Workspace scaffold, config, health/ready, middleware

**Files:**
- Create: `backend-rs/Cargo.toml`, `backend-rs/src/config.rs`, `backend-rs/src/main.rs` (api binary)
- Test: `backend-rs/tests/health_test.rs`

**Interfaces:**
- Consumes: `docker-compose.yml:155-184` env names (`DATABASE_URL`, `VALKEY_URL`, `CLICKHOUSE_HOST/PORT/USER/PASSWORD/DATABASE`, `JWT_SECRET`, `ENV`, `CORS_ORIGINS`).
- Produces: `AppState { pg: PgPool, valkey_url: String, ch: ChClient, jwt_secret: SecretString }`, `fn build_router(state: AppState) -> axum::Router`, `GET /health -> {"status":"ok"}`, `GET /ready -> {"status","checks":{db,clickhouse}}`.

- [ ] **Step 1: Write failing test** `health_returns_ok` + `ready_reports_checks` + `security_headers_present` + `cors_allows_patch` in `backend-rs/tests/health_test.rs` (assert exact header values from Global Constraints).
- [ ] **Step 2: Run it** `cargo test -p backend-rs --test health_test`; Expected: FAIL (no crate yet).
- [ ] **Step 3: Implement** workspace + `config.rs` (`Settings::from_env()` with same defaults as `app/config.py`), `main.rs` with `/health`, `/ready` (pg `SELECT 1`, ch `SELECT 1`), CORS + security-header + audit middleware.
- [ ] **Step 4: Run** `cargo test -p backend-rs --test health_test`; Expected: PASS. Also `cargo clippy -- -D warnings`.
- [ ] **Step 5: Commit** `git add backend-rs/Cargo.toml backend-rs/src backend-rs/tests/health_test.rs; git commit -m "feat(rs): scaffold workspace with health/ready and middleware"`

### Task 2: Postgres models, migrations, session, seed fallback

**Files:**
- Create: `backend-rs/src/db.rs`, `backend-rs/migrations/001_auth_user_social.sql`
- Modify: `backend-rs/src/main.rs` (attach pool)
- Test: `backend-rs/tests/db_test.rs`

**Interfaces:**
- Consumes: Task 1 `AppState`; `migrations/001_auth_user_social.py:19-44` statements.
- Produces: `struct User { id: Uuid, username, email: Option<String>, display_name, npub, avatar_url, password_hash, is_active, is_admin }`, `struct SocialAuth { id, user_id, provider, uid }`, `fn pg_pool(url: &str) -> PgPool`, `fn seed_allowed() -> bool`, `fn seed_user() -> Option<User>` (transient).

- [ ] **Step 1: Write failing test** `migrate_then_crud_user` (migrate fresh DB, insert/select user+link, unique(provider,uid) conflicts) + `seed_fallback_gated` (allowed only with env set).
- [ ] **Step 2: Run** `cargo test -p backend-rs --test db_test`; Expected: FAIL.
- [ ] **Step 3: Implement** sqlx models + `001_auth_user_social.sql` (same statements, plain SQL idempotent), pool with `DATABASE_URL`, seed gating.
- [ ] **Step 4: Run** `DATABASE_URL=postgresql://cypher:cypher@localhost:5433/cypher cargo test -p backend-rs --test db_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/db.rs backend-rs/migrations backend-rs/tests/db_test.rs; git commit -m "feat(rs): postgres users/social_auth with seed fallback"`

### Task 3: Auth core (password, JWT, login/register/me/admin)

**Files:**
- Create: `backend-rs/src/auth/mod.rs`, `backend-rs/src/auth/password.rs`, `backend-rs/src/auth/token.rs`, `backend-rs/src/auth/routes.rs`, `backend-rs/src/auth/validation.rs`
- Test: `backend-rs/tests/auth_core_test.rs`

**Interfaces:**
- Consumes: Task 2 `User`/`SocialAuth`; `app/auth/schemas.py` shapes/limits (username `^[a-zA-Z0-9_-]+$` 3-32, password 8-128, email regex, avatar rules).
- Produces: `fn hash_password(&str) -> String`, `fn verify_password(&str,&str) -> bool`, `fn create_token(sub,uid,ver) -> String`, `fn decode_token(&str) -> Claims`, routes `POST login`, `POST register`, `GET/PATCH me`, `POST change-password`, `GET users`, `PATCH users/{id}` with exact status codes.

- [ ] **Step 1: Write failing tests** `login_ok_uses_ver_claim`, `register_conflict_409_on_dup`, `me_requires_bearer_401`, `change_password_revokes_old_token_401`, `nonadmin_users_403`, `transient_seed_readonly` (PATCH me 401).
- [ ] **Step 2: Run** `cargo test -p backend-rs --test auth_core_test`; Expected: FAIL.
- [ ] **Step 3: Implement** bcrypt + `jsonwebtoken` HS256 (`iss`, `sub/exp/iat/jti`, optional `uid`/`ver`), Bearer extractor (reject non-Bearer), same error strings (`Invalid credentials`, `username taken`, `email taken`, `Invalid token`, `admin only`, `incorrect password`, `new password must differ`).
- [ ] **Step 4: Run** `cargo test -p backend-rs --test auth_core_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/auth backend-rs/tests/auth_core_test.rs; git commit -m "feat(rs): auth core login/register/me/admin with jwt revocation"`

### Task 4: Auth extended (Nostr, OAuth, Valkey stores, rate limits)

**Files:**
- Create: `backend-rs/src/auth/nostr.rs`, `backend-rs/src/auth/oauth.rs`, `backend-rs/src/store.rs`
- Modify: `backend-rs/src/auth/routes.rs`, `backend-rs/src/main.rs` (rate-limit layer)
- Test: `backend-rs/tests/auth_ext_test.rs`

**Interfaces:**
- Consumes: Task 3 routes/token; `app/auth/nostr_crypto.py:99-116`, `app/auth/psa.py:39-146`, `challenge_store.py`, `oauth_state_store.py`.
- Produces: `fn verify_nostr_event(ev: &NostrEvent) -> bool`, `fn get_oauth_url(provider) -> {auth_url,state}`, `async fn complete_oauth(provider,code,state) -> Identity`, `async fn issue_challenge/consume_challenge`, `async fn issue_state/consume_state`, Nostr+OAuth routes with 401/404/400/502/503 mapping.

- [ ] **Step 1: Write failing tests** `nostr_verify_known_vector` (fixed key/sig from Python suite), `challenge_replay_second_use_401`, `expired_challenge_404`, `oauth_state_reuse_400`, `oauth_unknown_provider_400`, `challenge_burst_429`, `valkey_down_maps_503`.
- [ ] **Step 2: Run** `cargo test -p backend-rs --test auth_ext_test`; Expected: FAIL.
- [ ] **Step 3: Implement** `secp256k1` Schnorr verify (recompute NIP-01 id first, fail-closed), `reqwest` token exchange + userinfo (google/github only), Valkey `SETEX`/`GET`/`EVAL` Lua compare-del with in-memory fallback + 30s retry backoff, per-process rate buckets matching limits.
- [ ] **Step 4: Run** `cargo test -p backend-rs --test auth_ext_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/auth backend-rs/src/store.rs backend-rs/tests/auth_ext_test.rs; git commit -m "feat(rs): nostr oauth valkey stores and rate limits"`

### Task 5: ClickHouse client + metrics service (registry port)

**Files:**
- Create: `backend-rs/src/ch.rs`, `backend-rs/src/metrics/registry.rs` (generated), `backend-rs/src/metrics/service.rs`
- Test: `backend-rs/tests/metrics_svc_test.rs`

**Interfaces:**
- Consumes: `app/metrics/registry.py` (all 210 entries), `app/metrics/service.py:42-109`, `app/ch.py:28-35`.
- Produces: `struct Metric { id, title, category, unit, grain, sql }`, `static METRICS: &[Metric]`, `fn norm_date(raw,kind) -> Result<String,ApiError>`, `fn check_range(f,t,kind) -> Result<()>`, `async fn get_series(id,from,to) -> SeriesOut{points[{t,v}],unit,stale}`, `async fn get_coverage() -> {min_day,max_day}`, `async fn get_ohlc(grain,from,to) -> {bars[]}`.

- [ ] **Step 1: Write failing tests** `registry_has_210_ids_and_no_base_reads` (assert no `FROM bitcoin.blocks_v2` etc.), `norm_trims_iso_to_date`, `from_gt_to_422`, `hourly_over_370d_422`, `daily_over_1826d_422`, `empty_coverage_404`, `null_value_sets_stale`.
- [ ] **Step 2: Run** `cargo test -p backend-rs --test metrics_svc_test`; Expected: FAIL.
- [ ] **Step 3: Implement** registry via scripted port of `METRICS` (SQL strings byte-identical + `LIMIT 5000` at query time), ClickHouse via official `clickhouse` crate bound to `CLICKHOUSE_HOST/PORT/USER/PASSWORD/DATABASE` (HTTP 8123 path if native blocked — decide in task, keep one), typed `{from:Date}/{from:DateTime}` params, ms conversion for OHLC.
- [ ] **Step 4: Run** `cargo test -p backend-rs --test metrics_svc_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/ch.rs backend-rs/src/metrics backend-rs/tests/metrics_svc_test.rs; git commit -m "feat(rs): metrics registry and clickhouse service"`

### Task 6: Metrics router + full HTTP parity

**Files:**
- Create: `backend-rs/src/metrics/routes.rs`, `backend-rs/src/metrics/descriptions.rs` (port of `descriptions.py`), `backend-rs/tests/parity_test.rs`
- Modify: `backend-rs/src/main.rs` (mount `/api/v1/metrics`)
- Test: `backend-rs/tests/parity_test.rs`

**Interfaces:**
- Consumes: Tasks 3-5; `frontend/src/lib/api.ts:68-210` expected shapes.
- Produces: `GET /api/v1/metrics -> [{id,title,category,unit,interval,disabled,description}]`, `GET /coverage`, `GET /{id}/series`, `GET /price_ohlc_{grain}/ohlc`; `interval` derived (`_daily`->daily, `_hourly`->hourly else none).

- [ ] **Step 1: Write failing tests** `list_shape_matches_frontend`, `series_shape_points_unit_stale`, `unknown_metric_404`, `disabled_metric_404`, `bad_date_422`, `ohlc_unknown_grain_404`, `metrics_require_auth_401`.
- [ ] **Step 2: Run** `cargo test -p backend-rs --test parity_test`; Expected: FAIL.
- [ ] **Step 3: Implement** routes with `Authorization: Bearer` guard, error->status mapping (404 unknown/disabled, 422 dates/range, 502 ch-down), `descriptions` port.
- [ ] **Step 4: Run** `cargo test -p backend-rs --test parity_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/metrics/routes.rs backend-rs/tests/parity_test.rs; git commit -m "feat(rs): metrics http parity"`

### Task 7: Worker (price poller + scheduler)

**Files:**
- Create: `backend-rs/src/bin/worker.rs`, `backend-rs/src/price.rs`
- Test: `backend-rs/tests/price_test.rs`

**Interfaces:**
- Consumes: Task 5 `ch.rs`; `app/workers/price.py:14-91`.
- Produces: `async fn fetch_binance_hour(symbol) -> Vec<Kline>`, `async fn fetch_kraken_hour() -> Vec<Kline>`, `fn upsert_rows(rows,source,symbol) -> Vec<Row>`, `async fn poll_price_hourly(symbol) -> {inserted,source}`; schedules: stub every 60s, hourly poll every 3600s.

- [ ] **Step 1: Write failing tests** `upsert_rows_param_shapes`, `binance_fallback_to_kraken_on_err` (mocked transports), `symbol_allowlist_defaults_btcusdt`.
- [ ] **Step 2: Run** `cargo test -p backend-rs --test price_test`; Expected: FAIL.
- [ ] **Step 3: Implement** `reqwest` fetchers, parameterized insert (no f-string values), tokio scheduler in `worker` binary.
- [ ] **Step 4: Run** `cargo test -p backend-rs --test price_test`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/src/price.rs backend-rs/src/bin/worker.rs backend-rs/tests/price_test.rs; git commit -m "feat(rs): price worker with exchange fallback"`

### Task 8: Docker/compose wiring + test harness

**Files:**
- Create: `backend-rs/Dockerfile` (multi-stage, non-root `appuser`, healthcheck `/health`), `backend-rs/.dockerignore`
- Modify: `docker-compose.yml` (`api`+`worker` build `./backend-rs`, same env/ports/healthcheck), `docker-compose.prod.yml` (same swap)
- Test: `scripts/check_rust_parity.sh` (new, curls `/health`, `/ready`, authed `/metrics`)

**Interfaces:**
- Consumes: Tasks 1-7 binaries.
- Produces: `api` on host `8002`, `worker` on `worker` profile, images build offline-locked (`Cargo.lock` committed).

- [ ] **Step 1: Write failing check** script asserting rust `/health` ok + `/metrics` needs 401 without token.
- [ ] **Step 2: Run** `bash scripts/check_rust_parity.sh`; Expected: FAIL (compose still Python).
- [ ] **Step 3: Implement** Dockerfile + compose swap; keep `ENV`, `CORS_ORIGINS`, `VALKEY_URL=redis://valkey-app:6379/0` value but document Valkey naming.
- [ ] **Step 4: Run** `docker compose build api worker && bash scripts/check_rust_parity.sh`; Expected: PASS.
- [ ] **Step 5: Commit** `git add backend-rs/Dockerfile docker-compose.yml docker-compose.prod.yml scripts/check_rust_parity.sh; git commit -m "feat(rs): wire rust api/worker into compose"`

### Task 9: Full test gates + E2E charts on Rust endpoint

**Files:**
- Create: `scripts/e2e_rust_charts.sh` (loops all metric ids from `/metrics` + both OHLC grains against Rust 8002, fails on non-200 or bad shape), `backend-rs/tests/e2e_charts_test.rs` (subset smoke, mocked Ch)
- Test: existing `frontend` vitest + `frontend/e2e/auth.spec.ts` rerun with `VITE_API_URL=http://localhost:8002`

**Interfaces:**
- Consumes: Tasks 1-8 running stack.
- Produces: green `cargo test`, green `vitest`, green Playwright e2e, charts matrix report (id -> points count).

- [ ] **Step 1: Write failing test** `e2e_charts_test::all_ids_return_points_shape` (all ids from `METRICS`, mocked Ch rows).
- [ ] **Step 2: Run** `cargo test -p backend-rs`; Expected: FAIL (or matrix script fails on live stack).
- [ ] **Step 3: Implement** fixes until green; run frontend `vitest` unchanged (contract intact); run Playwright e2e against Rust api; run `scripts/e2e_rust_charts.sh` against live ClickHouse seed/dev data.
- [ ] **Step 4: Run all gates** `cargo test`, `cargo clippy -- -D warnings`, `docker compose up -d api clickhouse pg valkey-app`, `bash scripts/e2e_rust_charts.sh`, `cd frontend && npx vitest run`, `npx playwright test e2e/auth.spec.ts`; Expected: ALL PASS + Dashboard renders every chart via Rust.
- [ ] **Step 5: Commit** `git add scripts/e2e_rust_charts.sh backend-rs/tests/e2e_charts_test.rs; git commit -m "test(rs): full parity and e2e charts on rust endpoint"`
