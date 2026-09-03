# CypherGlass Analytics Platform — Design (2026-09-03)

## Context
Bitcoin onchain analytics (bitcoinmagazine / intothecryptoverse style).
Pipeline exists: Knots → JuiceFS → Go decoder → ClickHouse (`bitcoin.blocks`,
`transactions`, `outputs`, `inputs`, `addresses` + 3 MVs in `02_views.sql`).
Need: Python REST backend with auth, React/shadcn frontend, charting,
100s of periodic ingest jobs (social, GA, Binance price).

Auth: login-required. MVP metrics: onchain + price. Jobs: simple periodic.

## Decision 1 — Chart lib
Primary: Apache ECharts (Apache-2.0, ~67k stars, Canvas+SVG, dataZoom/brush,
multi-axis, 100k+ pts). Price pane: TradingView Lightweight-Charts (Apache-2.0).
No copyleft chart lib with traction exists — all leaders MIT/Apache/ISC/BSD.

## Decision 2 — Jobs: Celery Beat (not Airflow)
Simple independent periodic pulls → Celery + Valkey broker wins.
Reuse fusionpbx pattern: `app/workers/celery_app.py`, `beat_schedule`,
`task_acks_late`, per-row dispatch tasks. Airflow overkill
(scheduler+webserver+metadata DB, split repo) unless DAGs/backfill needed later.
Keep job fn signature DAG-ready: `run(params, date_from, date_to)`.

## Architecture
```
frontend/ (Vite React19 + shadcn + TanStack Query + echarts-for-react)
  Login → App shell [left searchable metric list | middle ECharts pane + range]
     │
     │ JWT Bearer, /api/v1/*
     ▼
backend/ (FastAPI + SQLModel + Postgres PG + ClickHouse read + Valkey)
  PG: users/auth/jobs meta (reuse fusionpbx app/auth, config, db patterns)
  CH: read-only via clickhouse-connect, allowlist queries per metric_id
  Valkey: broker + result backend + series cache (5-15 min TTL)
  Celery worker+beat stub (price/social jobs later)
```

## Components
- backend/app/main.py: FastAPI, /health, versioned routers, CORS, static SPA fallback.
- backend/app/config.py: pydantic-settings (DATABASE_URL PG, CLICKHOUSE_*, VALKEY/REDIS_URL, JWT_*).
- backend/app/db.py: PG async engine + Session; ch.py: ClickHouse sync client + query helper.
- backend/app/auth/: JWT login (reuse fusionpbx deps/service shape, simplified single-tenant).
- backend/app/metrics/: registry.py (metric_id → title, category, unit, CH SQL template),
  router.py (`GET /metrics`, `GET /metrics/{id}/series?from&to&interval`), service.py.
- backend/app/workers/celery_app.py: broker Valkey, beat_schedule stub (price_1m later).
- frontend/src/: routes/Login, App shell, components/MetricList (search),
  components/ChartPane (ECharts setOption), lib/api.ts (fetch + JWT), context/AuthContext.
- MVP metrics from existing MVs: `block_stats_daily`, `tx_volume_hourly`,
  `address_activity_daily`. Price series stub (empty, wired for Binance job later).

## Data flow
1. Login → JWT stored, AuthContext guard.
2. `GET /metrics` → left list (search filter client-side).
3. Select metric + range → `GET /metrics/{id}/series` → `{t, v}` points.
4. ECharts `dataset/source` + dataZoom; range change refetches (Query key includes range).
5. Errors: 401 → logout→login; 422/500 → toast + empty pane with retry.

## Repo organisation (avoid clutter)
```
backend/{pyproject.toml,Dockerfile,app/{main,config,db,ch,auth,metrics,workers},tests/,alembic/}
frontend/{package.json,vite.config,src/{routes,components/{MetricList,ChartPane},lib,context},tests/}
clickhouse/ (existing, add 03_price.sql later)
docs/superpowers/{specs/,plans/}
docker-compose.yml (add pg, api, worker, frontend services)
```

## Testing
Backend pytest (auth login, /metrics list shape, series shape with mocked CH).
Frontend vitest (MetricList filter, api header) + tsc + vite build.
Manual: login → list → chart renders for 3 MV metrics.
