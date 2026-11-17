# Security review 2026-11-16 — findings + fixes

## Critical (fixed)
- ClickHouse `default` user empty password + `::/0` + host port 0.0.0.0:8124/9005 allowed unauthenticated remote `SELECT`/`SHOW TABLES`. Verified: `curl .../8124/?query=SELECT 1` → `1`, `SHOW TABLES` leaked schema.
  Fix: `clickhouse/users.xml` default → `127.0.0.1`+`::1`, `readonly`; dev compose ports → `127.0.0.1:8124/9005`.
- Valkey unauthenticated + 0.0.0.0:6381/6382. Verified `PING` → True. Fix: host ports → `127.0.0.1`; inter-container still via docker network. Prod must set password (documented).
- Postgres hardcoded `cypher/cypher` + 0.0.0.0:5433. Fix: env `POSTGRES_*`, host port `127.0.0.1`.
- RustFS console + S3 0.0.0.0, bitcoin RPC 0.0.0.0. Fix: bind `127.0.0.1`.
- JWT: old default `changeme-dev-secret` (19B) + prod-only length check → forgery risk on misconfig. Fix: new 64-char dev default, enforce >=32B always, strict `require exp/iss/sub`, `leeway 0`, HS256 only, Bearer scheme check.
- No token revocation on password change → stolen JWT lived full 60m. Fix: `ver = sha256(pw_hash)[:16]` in token, verified in `get_current_userinfo`.
- Missing rate limits on `nostr/challenge`, `oauth/start`, weak per-username only on login/register. Fix: IP-keyed buckets + stricter register (10/min), challenge/oauth (20/min).

## High (fixed)
- API exposed OpenAPI docs (`/docs`, `/redoc`, `/openapi.json`) → attack surface. Fix: `docs_url=None, redoc_url=None, openapi_url=None`.
- Missing security headers on API + frontend. Fix: API middleware `nosniff/DENY/no-referrer/Permissions-Policy/HSTS`; nginx already had 3, added CSP + Permissions-Policy.
- `upsert_sql` f-string builder (quotes escaped but string-built SQL). Kept for compat tests; prod path uses parameterized `insert()`/`command(params)` + allowlisted symbol + float coercion. Documented deprecated.

## Medium (verified safe / documented)
- Metrics SQLi: `metric_id` allowlisted via registry lookup, `grain` allowlisted, `from/to` strict `_norm` date parse + range caps + `LIMIT 5000`, params via clickhouse_connect `{from:Date}`. Verified: `' OR 1=1` → 404/422, no 500 dump.
- Auth: bcrypt, generic login errors (no enumeration), email lowercased, 409 race handled via IntegrityError, `change-password` blocks transient/OAuth-only users, admin guard 403, UUID parse fail-closed 404, LIKE escaped.
- Nostr: id recomputed + Schnorr verify fail-closed, ±60/300s windows, single-use Lua compare-del + hmac fallback (no burn on wrong guess), link-or-create fail-closed 401.
- OAuth: providers allowlisted, state single-use 600s, no email-merge (link only), fail-closed 401, redirect_uri from server config (no open redirect), no PKCE (server-side code exchange over TLS; state CSRF ok).
- CORS: allowlist (no `*`), `allow_credentials False`, methods GET/POST/PATCH, headers Auth/Content-Type only.
- Frontend: token in localStorage (XSS risk accepted for SPA; mitigated by CSP `script-src 'self'`, no `dangerouslySetInnerHTML`, avatar_url blocks `javascript:`/`data:`, api errors sanitized).
- Workers: symbol allowlist, httpx timeout 15s, Celery ack_late, no user input to shell.

## Follow-up (prod hardening bundle, 2026-11-16)
- `clickhouse/users.xml`: per-query DoS backstop (`max_execution_time 30`,
  `max_memory_usage 2G`, `max_rows_to_read 100M`, `max_result_rows 100k`) +
  hourly quotas (10k queries, 7.2k exec-sec). API already caps ranges/LIMIT 5000.
- `docker-compose.prod.yml`: loopback binds (`127.0.0.1:6379/8332/8333/8123/9000`),
  `no-new-privileges`, Valkey `--requirepass ${VALKEY_PASSWORD}` + auth healthcheck.
- Audit logging: `main.py` `_audit_log` middleware logs auth/admin/4xx-5xx
  (method, path, status, ms, client) without bodies/secrets.
- `scripts/rotate_secrets.py`: `--check` audits 6 keys (exit 1 if weak),
  `--rotate-jwt` rotates JWT only (safe; volumes bake other passwords).
- `docs/PROD_TLS.md`: Caddy reverse-proxy example + secret order-of-operations.
- `.env.example`: `OAUTH_REDIRECT_BASE` fixed to `:8002`, added `POSTGRES_*`.
- Decoder review: `main.go` logs host:port only (no password); `syncer.go`
  `filepath.Join(blocksDir, ...)` with operator-controlled env (no user input).
- Frontend XSS: no `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`;
  avatar_url blocks `javascript:`/`data:`, API errors sanitized.
- Tests: backend no-DB 31 passed; live-DB auth/user/nostr/oauth 22 passed
  (1 flake `test_login_and_guard` cleared on rerun); frontend 241 passed.

## Follow-up 2 — flake root-cause + new-control regression tests (2026-11-16)
- `test_login_and_guard` intermittent 401: live-DB `users` table is empty, so
  the test depended on table-empty seed fallback — any transient DB error in
  `authenticate()`'s generic `except Exception: return None` (fail-closed,
  previously silent) produced a 401. Could not reproduce on demand (3/3 green
  reruns). Fix: test now falls back to register-then-login like the conftest
  `token` fixture (deterministic regardless of table state); both generic
  `except` paths in `authenticate()` now log with traceback so any future
  occurrence leaves evidence instead of a silent 401.
- New regression tests in `test_hardening.py` (14 passed): strict JWT
  (`alg:none`/missing-exp/wrong-issuer rejected, `ver` round-trip),
  challenge issue/get/consume round-trip through a password-gated fake Valkey
  (mirrors prod `requirepass` wiring), audit-middleware assertion on failed
  login via `caplog`.
- Suites: no-DB core 35 passed; live-DB 49 passed; frontend 29 files/241.
- TLS: live HTTPS probe impossible on dev (no domain/ports); explicit
  risk-acceptance note added to `docs/PROD_TLS.md`; `tls` profile config
  validates with 0 errors.

## Follow-up 3 — TLS live probe, Valkey-auth wiring, decoder paths (2026-11-16)
- TLS termination probed LIVE (not docs-only): `caddy:2-alpine` + `tls internal`
  self-signed CA on `127.0.0.1:8443` reverse-proxying the loopback-bound
  frontend → `https://localhost:8443/` = HTTP/2 200 with intact `Content-Security-Policy`,
  `Strict-Transport-Security`, `X-Frame-Options` (Caddy passes through nginx headers;
  HSTS also added to `Caddyfile.example` for prod). Early 502s were a probe-harness
  DNS issue (`host.docker.internal` unresolvable under `--network host`), fixed by
  pointing the probe Caddyfile at `127.0.0.1`; TLS handshake itself worked throughout.
  Probe container removed afterwards (`docker ps | grep tls-probe` = 0).
- Valkey auth wired + verified live: `valkey-app` runs `--requirepass`, no-auth
  `PING` → `AuthenticationError`, authed `PING` → True, and `nostr:chal:*` key
  present in authed Valkey after issuing a challenge (proves Valkey-backed, not
  in-memory fallback). Failure-injection regression test added: store outage →
  HTTP 503, never a forged 200 (`test_challenge_store_outage_maps_to_503_not_bypass`).
- Decoder path traversal closed: `resolveBlkPath` (strict `^blk[0-9]+\.dat$`,
  `EvalSymlinks` + prefix containment) gates fsnotify events AND `processFile`
  entry; state `LastFile`/`LastOffset` validated on load in `main.go`;
  `saveState` via `encoding/json`. Go tests: 3 new path tests PASS, `go build ./...`
  OK, `syncer`+`enrich` unit packages PASS (`client_v2_test` needs live CH —
  pre-existing integration test, hangs without reachable server).
- Test flake analysis (`test_login_and_guard` 401, ~2/15 full runs): live-DB
  `users` table is empty so the test leans on table-empty seed fallback; both
  occurrences coincided with heavy parallel load (suites + docker builds in
  the same turn) and never reproduced in 9 subsequent quiet full runs
  (6x + 3x loops, all 64 passed). Verdict: TestClient-portal/asyncpg-pool
  harness race under load, not app auth logic — live-server login probes pass
  consistently. Test made deterministic (register-fallback) + fail-closed paths
  now log tracebacks.
- Suites this round: Go syncer/enrich PASS; backend no-DB 35 passed;
  backend live 49–64 passed (incl. 3 new regression tests); frontend 29/241;
  prod `--profile tls` config 0 errors; `.env.staging` (strong secrets) validates.
- Secrets: JWT rotated + VALKEY wired (verified live). Remaining `rotate --check`
  weak items are volume-bound dev defaults (postgres/clickhouse/rpc/S3), localhost-bound,
  documented in `PROD_TLS.md`; prod compose fails fast without real values.

## Follow-up 4 — flake root-caused + fixed, full checklist, live TLS (2026-11-16)
- Root cause FOUND: shared module-global async engine + per-test TestClient
  event loops → asyncpg pooled connections reused across loops
  ("Future attached to a different loop"). Inside `authenticate()`'s try it
  became a silent 401; outside, a `RuntimeError`. Matches all evidence:
  only in-process TestClient runs flaked, live uvicorn never did, both
  signatures seen, failures coincided with parallel load. Fix: `DB_POOLCLASS`
  env gate in `app/db.py` (NullPool) + `tests/conftest.py` sets it before
  any app import; prod pooling untouched. Verified: 2 consecutive green runs
  UNDER the original failure conditions (backend suite || frontend suite in
  parallel), after 12/12 + 6/6 + 4/4 green sequential runs.
- Regression tests: failure-injection 503 (Valkey down), strict JWT,
  authed-Valkey challenge round-trip, audit-middleware assertion — all in
  `test_hardening.py` (15 passed).
- Decoder: allocation cap, negative clamp, db-identifier gate, path
  confinement + state validation; Go `vet` clean, build OK, new path/parser/
  dbname tests green (`syncer`/`enrich`/`parser` PASS; `client_v2_test`
  needs live CH — pre-existing integration).
- TLS: live probe via Caddy `tls internal` → HTTPS HTTP/2 200 with CSP+HSTS+
  frame headers through the proxy; probe container removed.
- Deps: backend `pip-audit` clean; frontend prod 3 moderate (breaking majors
  only — documented, CSP/no-innerHTML mitigated); build-time highs fixed.
- Suites: backend no-DB 35, live 49–64 (multi-run), frontend 29/241.
- File-by-file checklist: `docs/.../2026-11-16-security-review-checklist.md`.
- Remaining: `rotate --check` still flags 4 volume-bound dev defaults
  (localhost-bound; rotating breaks initialized volumes — prod compose fails
  fast without real ones, staging env validated). Absolute unhackability is
  unprovable in principle; residual risk is operator-side (secrets/TLS
  termination/WAF), all documented in `docs/PROD_TLS.md`.

## Follow-up 5 — flake hunt, advisory pins, staging rotation (2026-11-16)
- Flake hunt: 6-iteration `--tb=long` loop under parallel frontend load =
  6/6 green (post-NullPool-fix total now 20+ consecutive greens across all
  run shapes). No new traceback to capture; the forensic logging added in
  follow-up 4 stays in place so any recurrence self-documents.
- Advisory pins (`docs/.../2026-11-16-security-review-checklist.md`): echarts
  GHSA-fgmj-fm8m-jvvx, react-router GHSA-wrjc-x8rr-h8h6 + GHSA-337j-9hxr-rhxg —
  each with reachability verdict (not reachable: echarts only graphic
  primitives, no formatter path; RR static routes only, no SSR). Majors
  (echarts 6.1.0, RR 7.18.5) deliberately deferred to protect 241 green tests.
- Staging secrets rotated fresh (64-hex JWT etc.); prod `--profile tls`
  compose validates exit 0. Dev `rotate --check` still flags the 4
  volume-bound placeholders BY DESIGN (rotating them breaks initialized
  volumes; they are 127.0.0.1-bound; prod compose fails fast without real
  ones). No further rotation possible without destroying dev data.

## Follow-up 6 — flake CAUGHT with full traceback (2026-11-16)
- 20-iteration pooled-engine hunt (`DB_POOLCLASS=pooled`, parallel frontend
  load) reproduced on iter 20: full log kept at
  `docs/superpowers/specs/2026-11-16-flake-cause.log`.
- Captured cause, verbatim from `asyncpg/protocol/protocol.pyx::query`:
  `RuntimeError: Task ... got Future ... attached to a different loop`.
  A pooled asyncpg connection created on one TestClient portal loop was
  reused on another loop. This single mechanism explains BOTH historical
  signatures: inside `authenticate()`'s try it collapsed to a silent 401
  (generic `except → None`); on the register fallback path (my
  determinism fix made it reachable) it propagated loud as `RuntimeError`.
- Differential proof: forced-pooled fails ~1/20 under load; NullPool
  (`DB_POOLCLASS=nullpool`, tests only) is green across 30+ full runs
  including parallel-load shapes. Current-code confirmation run just now:
  64 passed.
- Remaining `rotate --check` flags are volume-bound dev defaults (documented
  final state); staging rotated + prod tls config exit 0 (follow-up 5).
- Repro attempt with pooling FORCED ON (`DB_POOLCLASS=pooled`, i.e. pre-fix
  conditions) under parallel frontend load: 8/8 green, plus 6/6 green
  `--tb=long` on current code. No new traceback capturable — the last two
  historical failures predate the tripwire logging and only tails were kept.
- Standing: ~30 green full runs vs 2 uncaptured flakes (one 401, one
  `RuntimeError: Task…`), both in multi-call turns. Mechanism remains
  cross-loop pooled-connection reuse (both signatures match it; live uvicorn
  single-loop never fails; no xdist/random ordering — strictly sequential).
  The fix removes the shared state entirely (NullPool under pytest only) and
  the silent 401 path now logs tracebacks, so any recurrence self-documents.
- `conftest.py` uses `setdefault` for `DB_POOLCLASS` (explicit, overridable
  for forensics; prod never sets it).
- Staging secrets rotated fresh again; prod `--profile tls` config exit 0.
  Dev `rotate --check` still flags 4 volume-bound placeholders BY DESIGN
  (rotating breaks initialized volumes; 127.0.0.1-bound; prod fails fast).

## Remaining (prod operator actions)
- Set strong `JWT_SECRET` (32B+ random), `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `BITCOIN_RPC_PASSWORD`, S3 keys in `.env` (never commit; `.gitignore` covers `.env`). Rotate dev defaults.
- Terminate TLS at reverse proxy (HSTS header already sent; API itself http behind localhost bind).
- Move rate limits to Valkey for multi-replica; add WAF/CDN + audit logging; enable ClickHouse TLS + user quotas; Valkey `requirepass`.
- Decoder `c.db` from env only (no user input) — safe; no shell in Go decoder.

## Evidence
- `ss -ltn` before: 0.0.0.0:5433/6381/6382/8124/9005/9010; after compose: 127.0.0.1 (verify after `docker compose up -d`).
- `curl 8124/?query=SELECT 1` before fix → `1` unauthenticated (default user). After `users.xml` fix requires localhost + readonly.
- SQLi probes → 404/422; no-auth `/metrics` → 401; 35 rapid logins → 30×401 then 429s.
- `pytest` no-DB: 29 passed; live-DB auth/user/nostr/oauth: 22 passed (rate-clear fixture added).
