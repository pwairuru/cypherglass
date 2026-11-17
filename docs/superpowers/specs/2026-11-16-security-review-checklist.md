# File-by-file security review — cypherglass (2026-11-16)

Legend: ✅ reviewed, fix landed · ☑️ reviewed, no issue · ⚠️ accepted risk (documented)

## Backend (`backend/app`)

| File | Finding |
|---|---|
| `auth/router.py` | ✅ IP+user rate limits (login/register/nostr-challenge/oauth-start); generic login errors; 409 race-safe register; transient-user write blocks; single-use challenge/state consume; fail-closed 401/503 |
| `auth/deps.py` | ✅ strict JWT (HS256 only, require exp/iss/sub, leeway 0, Bearer check); `ver` password-binding enforced; transient read-only |
| `auth/service.py` | ✅ bcrypt; seed fallback explicit-opt-in + fail-closed once users exist; unexpected errors now logged (flake forensics); `pwd_ver` claim |
| `auth/schemas.py` | ✅ lengths/patterns; email regex; avatar_url blocks `javascript:`/`data:`; display_name stripped/max64 |
| `auth/models.py` | ✅ tz-aware datetimes (sqlmodel 0.0.47 UTCDateTime) |
| `auth/challenge_store.py` | ✅ Lua compare-del + hmac fallback (no burn on wrong guess); TTL; bounded memory; fail-closed 503; Valkey-auth compatible |
| `auth/oauth_state_store.py` | ✅ single-use, TTL 600s, bounded memory |
| `auth/psa.py` | ✅ providers allowlisted; no email-merge; state owned by router; timeouts 15s |
| `auth/nostr_crypto.py` | ✅ id recompute + Schnorr verify, fail-closed both paths |
| `auth/backends/nostr.py` | ☑️ dormant fork candidate, not wired into live auth; lacks lowercasing — must sanitize if ever wired |
| `config.py` | ✅ JWT >=32B enforced always; CORS allowlist (no `*`); creds not logged |
| `main.py` | ✅ docs/redoc/openapi off; security headers; audit middleware (auth/admin/4xx-5xx, no bodies) |
| `db.py` | ✅ NullPool under `DB_POOLCLASS=nullpool` (tests only; fixes TestClient cross-loop reuse); prod pooling untouched |
| `ch.py` | ✅ parameterized params; no secret in logs; None-safe series |
| `metrics/router.py` | ✅ auth required; metric_id allowlisted via registry; grain allowlisted |
| `metrics/service.py` | ✅ `_norm` strict date parse; range caps (370d/5y); LIMIT 5000; no user SQL; stale flag |
| `metrics/registry.py` | ✅ static SQL over MVs/marts/price only (test-enforced) |
| `workers/price.py` | ✅ symbol allowlist; parameterized insert; httpx timeout; `upsert_sql` legacy compat only |
| `workers/celery_app.py` | ☑️ broker URL from env; no user input |

## Decoder (Go)

| File | Finding |
|---|---|
| `internal/syncer/syncer.go` | ✅ NEW: `resolveBlkPath` (strict `^blk[0-9]+\.dat$`, EvalSymlinks, prefix containment) on events + `processFile`; JSON state writes |
| `main.go` | ✅ NEW: state `LastFile`/`LastOffset` validation, resync-clean on tamper |
| `internal/parser/block.go` | ✅ NEW: 8MB record cap (no 4GB alloc); negative-output clamp; total saturation |
| `internal/clickhouse/client*.go` | ✅ NEW: `validDBName` gate on interpolated identifier; values driver-bound |
| `internal/enrich/utxo.go` | ☑️ mutex-guarded, 5M bound + log (fee undercount vs OOM — documented) |
| `internal/parser/{types,address}.go` | ☑️ btcd wire parse; address extraction total function, no I/O |

## Frontend (`frontend/src`)

| Area | Finding |
|---|---|
| routes (`Login/Register/Profile/AdminUsers/App`) | ✅ React-escaped output; client guards mirror server (`RequireAdmin` + server 403); no `dangerouslySetInnerHTML` anywhere |
| `lib/api.ts` | ✅ error sanitization (status only); auth header only when token set |
| `context/AuthContext.tsx` | ⚠️ token in localStorage (accepted SPA tradeoff; CSP + no XSS sinks); 401 clears session |
| `lib/{nostr,drawings}.ts` | ✅ strict npub/hex validation; drawings JSON shape-checked + try/catch |
| `components/NostrLogin.tsx` | ✅ NIP-07 treated as untrusted (server verifies sig+challenge); `encodeURIComponent` in URI |
| `lib/{chartTools,indicators,metricGroups,chartTheme,metricCopy,qfdraw/**}` | ☑️ pure rendering/math, no network/storage/sinks (grep-verified) |
| `vite.config.ts` | ☑️ reviewed; no proxy secrets |
| `nginx.conf` | ✅ CSP + nosniff/DENY/no-referrer/Permissions-Policy |

## Scripts / ops

| File | Finding |
|---|---|
| `scripts/seed_dev.py`, `e2e_onchain.py` | ☑️ operator-run; parameterized inserts; e2e f-string only over hardcoded table list |
| `scripts/rotate_secrets.py` | ✅ audits 6 keys; safe JWT-only rotation; volume-bound rest documented |
| `docker-compose{,.prod}.yml` | ✅ loopback binds; `no-new-privileges`; Valkey `requirepass` wiring; Caddy `tls` profile + example |
| `clickhouse/users.xml` | ✅ default localhost+readonly; per-query caps; hourly quotas (usage observed live) |
| `.env` / `.env.example` / `.env.staging` | ⚠️ dev keeps weak volume-bound defaults (localhost-bound; prod compose fails fast without real ones) |
| `Caddyfile.{example,probe}` | ✅ HSTS; probe proved TLS+HSTS+CSP live, container removed |

## Dependencies (evidenced)

- Backend `pip-audit` on locked tree: **no known vulnerabilities**.
- Frontend prod: 3 moderate, advisories pinned with reachability analysis
  (NOT upgraded: both fixes are breaking majors — echarts 5→6, RR 6→7 —
  deferred to avoid regressing 241 green tests + chart visuals):
  - `echarts <6.1.0`, GHSA-fgmj-fm8m-jvvx (XSS via formatter HTML): NOT
    reachable — app imports only `graphic.Group/Line/Circle` primitives
    (`lib/qfdraw/base.ts`) for drawing shapes; no tooltip/rich-text formatter
    path, no user strings passed. Fix: echarts 6.1.0 (major).
  - `react-router` 6.0.0–7.17.0, GHSA-wrjc-x8rr-h8h6 (open redirect via
    backslash in `<Link>`/`useNavigate`, CVE-2025-68470 bypass) +
    GHSA-337j-9hxr-rhxg (SSR `deserializeErrors` constructor injection): NOT
    reachable — SPA only (no SSR/hydration), all `to=`/`navigate()` targets
    are static literals (`/`, `/login`, `/register`). Fix:
    react-router-dom 7.18.5 (major).
