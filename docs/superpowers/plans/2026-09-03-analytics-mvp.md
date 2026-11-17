# Analytics MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login-gated dashboard with searchable metric list left + ECharts pane middle, 3 onchain series from ClickHouse.

**Architecture:** FastAPI backend `backend/` (PG auth + CH read-only + Valkey cache, JWT Bearer) serving `/api/v1/metrics` + `/series`; Vite React frontend `frontend/` (shadcn, TanStack Query, echarts-for-react) with Login → shell.

**Tech Stack:** Python 3.12 FastAPI SQLModel SQLAlchemy asyncpg clickhouse-connect celery valkey PyJWT bcrypt; React 19 Vite Tailwind shadcn @tanstack/react-query echarts-for-react.

**Spec:** docs/superpowers/specs/2026-09-03-analytics-platform-design.md

## Global Constraints
- Login-required for all /api/v1/metrics* (401 without JWT).
- MVP metrics only: block_stats_daily, tx_volume_hourly, address_activity_daily (price stub empty list item disabled).
- Backend port 8000, frontend dev 5173, CH HTTP 8124/native 9000, PG 5432, Valkey 6379.
- No placeholders; every series response shape `{ points: [{t, v}], unit }`.
---

### Task 1: Backend scaffold + health + config

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/ch.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: none
- Produces: `settings` (DATABASE_URL, CLICKHOUSE_HOST/PORT/USER/PASSWORD/DATABASE, VALKEY_URL, REDIS_URL, JWT_SECRET, JWT_EXPIRE_MIN); `get_session()` PG; `get_ch_client()`; `app` FastAPI with GET /health.

- [ ] **Step 1: Write failing test**
```python
from fastapi.testclient import TestClient
from app.main import app
def test_health():
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```
- [ ] **Step 2: Run to fail**
Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL module app.main not found.
- [ ] **Step 3: Minimal implementation**
`pyproject.toml`: fastapi sqlmodel sqlalchemy[asyncio] asyncpg clickhouse-connect pydantic-settings PyJWT bcrypt python-multipart celery valkey redis pytest httpx.
`config.py`: BaseSettings with fields above + defaults (PG `postgresql+asyncpg://cypher:cypher@localhost:5432/cypher`, CH host localhost port 8123 user bitcoin password changeme database bitcoin).
`db.py`: create_async_engine + async_sessionmaker + get_session yield.
`ch.py`:
```python
from clickhouse_connect import get_client
from app.config import settings
def get_ch_client():
    return get_client(host=settings.clickhouse_host, port=settings.clickhouse_port, username=settings.clickhouse_user, password=settings.clickhouse_password, database=settings.clickhouse_database)
def query_series(sql, params):
    client = get_ch_client()
    res = client.query(sql, parameters=params)
    return [{"t": r[0].isoformat(), "v": float(r[1])} for r in res.result_rows]
```
`main.py`: FastAPI + CORS + /health + include auth+metrics routers (import guarded try/except so Task1 passes before Task2/3).
- [ ] **Step 4: Run pass**
Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/pyproject.toml backend/app backend/tests/test_health.py docs/superpowers/specs/2026-09-03-analytics-platform-design.md
git commit -m "feat: backend scaffold health config pg ch"
```

### Task 2: Auth JWT login-required

**Files:**
- Create: `backend/app/auth/__init__.py`
- Create: `backend/app/auth/models.py`
- Create: `backend/app/auth/schemas.py`
- Create: `backend/app/auth/service.py`
- Create: `backend/app/auth/deps.py`
- Create: `backend/app/auth/router.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `get_session`, `settings`
- Produces: `POST /api/v1/auth/login {username,password} -> {access_token}`; `get_current_user()` dep raising 401; `create_token(sub)`; `verify_password/ph`.

- [ ] **Step 1: Failing test**
```python
def test_login_and_guard(client):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    tok = r.json()["access_token"]
    assert tok
    r2 = client.get("/api/v1/metrics", headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code in (200, 404)  # 404 ok before Task3, but not 401
    r3 = client.get("/api/v1/metrics")
    assert r3.status_code == 401
```
- [ ] **Step 2: Run fail** Run: `cd backend && python -m pytest tests/test_auth.py -v` Expected: FAIL 404 login.
- [ ] **Step 3: Implement**
`models.py`: SQLModel User(id uuid PK, username unique, password_hash, is_active).
`schemas.py`: LoginIn, TokenOut.
`service.py`: bcrypt hash/verify, `create_token(sub)` PyJWT HS256 expire, `authenticate()` — dev seed: if no users table/row, accept admin/admin (documented dev fallback, override via SEED_ADMIN_*); else verify DB.
`deps.py`: HTTPBearer, decode, 401 on fail.
`router.py`: APIRouter prefix /api/v1/auth, POST /login.
Wire in main.py include_router (replace guarded import).
- [ ] **Step 4: Pass** Run: `cd backend && python -m pytest tests/test_auth.py tests/test_health.py -v` Expected: PASS.
- [ ] **Step 5: Commit** `git add backend/app/auth backend/tests/test_auth.py` `git commit -m "feat: jwt login-required auth"`

### Task 3: Metrics registry + series API

**Files:**
- Create: `backend/app/metrics/__init__.py`
- Create: `backend/app/metrics/registry.py`
- Create: `backend/app/metrics/service.py`
- Create: `backend/app/metrics/router.py`
- Test: `backend/tests/test_metrics.py`

**Interfaces:**
- Consumes: `get_current_user`, `query_series`
- Produces: `GET /api/v1/metrics -> [{id,title,category,unit,interval}]`; `GET /api/v1/metrics/{id}/series?from&to -> {points:[{t,v}], unit}`.

- [ ] **Step 1: Failing test**
```python
def test_metrics_list_and_series(client, token):
    r = client.get("/api/v1/metrics", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()]
    assert "block_stats_daily" in ids
    r2 = client.get("/api/v1/metrics/block_stats_daily/series?from=2024-01-01&to=2024-01-08", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "points" in r2.json()
```
conftest provides `client` (TestClient with mocked `query_series` returning 2 points) and `token` (login).
- [ ] **Step 2: Run fail** `cd backend && python -m pytest tests/test_metrics.py -v` Expected: FAIL 404.
- [ ] **Step 3: Implement**
`registry.py`:
```python
METRICS = [
 {"id":"block_stats_daily","title":"Blocks / day","category":"onchain","unit":"blocks","sql":"SELECT day, block_count FROM bitcoin.block_stats_daily WHERE day BETWEEN {from:Date} AND {to:Date} ORDER BY day"},
 {"id":"tx_volume_hourly","title":"TX volume / hour","category":"onchain","unit":"tx","sql":"SELECT hour, tx_count FROM bitcoin.tx_volume_hourly WHERE hour BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY hour"},
 {"id":"address_activity_daily","title":"Active addresses / day","category":"onchain","unit":"addresses","sql":"SELECT day, active_addresses FROM bitcoin.address_activity_daily WHERE day BETWEEN {from:Date} AND {to:Date} ORDER BY day"},
 {"id":"price_btc_usd","title":"BTC price (stub)","category":"price","unit":"USD","disabled":True},
]
```
`service.py`: `list_metrics()` filters disabled? include with disabled flag; `get_series(id, frm, to)` allowlist lookup, raise 404 unknown/disabled, call query_series.
`router.py`: both GETs with `Depends(get_current_user)`, parse from/to as date strings passed to CH params.
- [ ] **Step 4: Pass** `cd backend && python -m pytest backend/tests -v` — use `cd backend && python -m pytest tests -v`.
- [ ] **Step 5: Commit** `git add backend/app/metrics backend/tests/test_metrics.py` `git commit -m "feat: metrics list series from CH views"`

### Task 4: Celery worker stub + compose wiring

**Files:**
- Create: `backend/app/workers/__init__.py`
- Create: `backend/app/workers/celery_app.py`
- Modify: `docker-compose.yml` (append pg, valkey-app, api, worker, frontend services; keep existing node/CH)
- Test: `backend/tests/test_worker.py` (beat_schedule contains price stub, ping task importable)

**Interfaces:**
- Consumes: `settings`
- Produces: `celery_app` with beat_schedule `price-poll-stub` 60s → `app.workers.celery_app.poll_price_stub`.

- [ ] **Step 1: Failing test**
```python
def test_beat_schedule():
    from app.workers.celery_app import celery_app
    assert "price-poll-stub" in celery_app.conf.beat_schedule
```
- [ ] **Step 2: Run fail** `cd backend && python -m pytest tests/test_worker.py -v` Expected: FAIL.
- [ ] **Step 3: Implement** mirror fusionpbx valkey→redis alias; Celery broker/backend settings.redis_url; tasks: `ping`, `poll_price_stub` (log + return {"ok": True, "note": "binance job later"}).
Compose: add `pg` (postgres:16), `api` (build backend, port 8000), `worker` (celery worker --loglevel=info --beat with profile worker), keep existing services untouched.
- [ ] **Step 4: Pass** `cd backend && python -m pytest tests -v`.
- [ ] **Step 5: Commit** `git add backend/app/workers docker-compose.yml` `git commit -m "feat: celery beat stub compose wiring"`

### Task 5: Frontend scaffold + login

**Files:**
- Create: `frontend/package.json` (vite react19 react-router-dom @tanstack/react-query echarts-for-react echarts tailwind)
- Create: `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/lib/api.ts` (`apiFetch(path, token)`, login fn)
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/routes/Login.tsx`
- Test: `frontend/src/lib/api.test.ts` (login body + auth header)

**Interfaces:**
- Consumes: backend /api/v1/auth/login
- Produces: Login page stores JWT in localStorage + context, redirects /.

- [ ] **Step 1: Failing test** vitest expects `authHeader("tok") === "Bearer tok"`.
- [ ] **Step 2: Run fail** `cd frontend && npm test -- --run` Expected: FAIL.
- [ ] **Step 3: Implement** minimal shadcn-style (no full shadcn init to avoid clutter; single button/input classes), router /, /login guard.
- [ ] **Step 4: Pass** `cd frontend && npm test -- --run && npx tsc --noEmit`.
- [ ] **Step 5: Commit** `git add frontend/package.json frontend/vite.config.ts frontend/index.html frontend/src` `git commit -m "feat: frontend scaffold login auth"`

### Task 6: Shell layout + metric list + chart pane

**Files:**
- Create: `frontend/src/components/MetricList.tsx` (props metrics, selected, onSelect, search input filter)
- Create: `frontend/src/components/ChartPane.tsx` (props series, title, unit; ReactECharts option with dataset, dataZoom inside+slider, tooltip trigger axis)
- Create: `frontend/src/routes/Dashboard.tsx` (useQuery metrics list + series by selected+range, left 280px list + middle chart + top range buttons 7d/30d/90d)
- Test: `frontend/src/components/MetricList.test.tsx` (filter narrows list)

**Interfaces:**
- Consumes: `GET /metrics`, `GET /metrics/{id}/series`
- Produces: searchable left panel + middle chart rendering points.

- [ ] **Step 1: Failing test** render list of 3, type "block", expect 1 visible.
- [ ] **Step 2: Run fail** `cd frontend && npm test -- --run src/components/MetricList.test.tsx` Expected: FAIL.
- [ ] **Step 3: Implement** ChartPane option:
```ts
{tooltip:{trigger:"axis"},xAxis:{type:"time"},yAxis:{type:"value",name:unit},dataZoom:[{type:"inside"},{type:"slider"}],series:[{type:"line",showSymbol:false,data:points.map(p=>[p.t,p.v])}]}
```
Dashboard range state → from/to ISO computed, queryKey ["series", id, from, to].
- [ ] **Step 4: Pass** `cd frontend && npm test -- --run && npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit** `git add frontend/src/components frontend/src/routes/Dashboard.tsx` `git commit -m "feat: searchable metric list chart pane"`
