# Final fix report — merge-blocking wave (2 findings)

## Files changed
- `backend/Dockerfile` (new): `FROM python:3.12-slim`, `WORKDIR /code`, `pip install .` (pyproject deps) + `uvicorn`, `COPY app`, `EXPOSE 8000`, `CMD uvicorn app.main:app --host 0.0.0.0 --port 8000`. Worker override stays in compose (`celery ... worker --beat`).
- `docker-compose.yml` (append-only): added `CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-bitcoin_clickhouse}` to `api` and `worker` env. Node/CH services untouched.
- `backend/app/config.py`: `clickhouse_password` default `changeme` → `bitcoin_clickhouse`.

## Why default changed (not comment-only)
`clickhouse/users.xml` sets user `bitcoin` password `from_env="CLICKHOUSE_PASSWORD"` with fallback `bitcoin_clickhouse`. Old backend default `changeme` mismatched local dev (no env → auth fail). New default matches CH dev fallback, so zero-env local works. Compose env still overrides for prod via `${CLICKHOUSE_PASSWORD:-bitcoin_clickhouse}`.

## Build output
Ran full `docker compose build api worker` (daemon OK, no fallback needed):
- `api Built` (image `cypherglass-api:latest`, export/unpack done)
- `worker Built` (image `cypherglass-worker:latest`, export/unpack done)
`docker compose config` also passes; resolved `CLICKHOUSE_PASSWORD: bitcoin_clickhouse` for api, `build.context: ./backend, dockerfile: Dockerfile` confirmed.

## Test output
`cd backend && .venv/bin/python -m pytest tests -v`: **11 passed** (auth 1, ch_schema 4, health 1, metrics 3, worker 2). Warnings only (httpx/starlette deprecation, short JWT dev key).
