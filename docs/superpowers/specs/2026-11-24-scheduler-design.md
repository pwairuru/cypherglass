# Scheduler design (Rust, separate binary)

Date: 2026-11-24. Replaces the deleted Python Celery worker
(`backend/app/workers/`, beat schedule in `celery_app.py`) with a Rust
crate that will also host future ingest (social data, news, rankings).

Canonical spec: `214ae8b^:backend/app/workers/{celery_app,price,external}.py`
(source of truth for endpoints, `FRED_MAP`, SQL strings, test vectors)
plus `clickhouse/init/*.sql` DDL. Reviewed by an independent builder
check; all findings resolved below (my calls marked).

## Intent / why

Scheduled ingest died with the Celery worker: price OHLC, fear/greed,
funding, cross-asset, address sweeper/cohorts/USD, and the keyed
FRED/ETF/lightning jobs. Tables keep serving rows until they go stale.
A separate binary (not in-process in the API) because the ingest list
is open-ended and must scale/deploy independently of request serving.

## Goals

- Parity with the deleted beat schedule: same jobs, same intervals,
  same tables, same honest no-op behavior (empty tables / unset keys ->
  skip with note, never fake data).
- Pure functions for all fetch/parse logic, unit-tested with the old
  Python vectors (`parse_fng`, `parse_funding`, `parse_kraken_ohlc`,
  `parse_etf_csv`, `parse_1ml`, `cpi_yoy`, `merge_macro`).
- Each job independently runnable once from CLI
  (`scheduler run-once <job> [--day YYYY-MM-DD]` for day-granularity
  jobs) for backfills and debugging. Fetch limits stay at the old
  defaults (Binance 1000 rows, FNG 90d, funding 100 rows).
- Observable: structured tracing logs per run (job, inserted/skipped,
  duration); non-zero exit on hard failure so compose/docker restarts it.

## Non-goals / anti-goals

- No marts-refresh job: none ever existed (only a comment claimed one).
  Deriving marts (hodl/sopr/...) stays out of scope.
- No distributed locking (single scheduler replica, same as the old
  single Celery worker; compose runs one).
- Failure policy (my call): a failing job logs and is skipped until the
  next tick — the serve loop never exits on a job error, so one flaky
  source can't crash-loop the other eleven. Only `run-once` exits
  non-zero on failure (for scripting/backfills).
- Failure to ingest must never serve fake data (anti-goal carried over).

## Approaches considered

1. In-process in `backend-rs` — rejected: user chose separate binary
   for independent growth.
2. Cron + one-shot CLI only — rejected: no long-running process is
   nice, but per-environment cron setup and weaker observability.
3. **Separate `scheduler` binary in the workspace (chosen).**
   Own crate `scheduler/`, reuses `backend_rs` lib (`ChClient`,
   `Settings`). Own Dockerfile stage / compose service with
   `profiles: ["worker"]` like the old Python worker. Tokio interval
   loops, one task per job, jittered first run.

## Parts (as decided)

- New crate `scheduler` (`scheduler/Cargo.toml`, `src/main.rs`,
  `src/jobs/{price,external,sweeper}.rs`, `src/parse.rs`,
  `src/schedule.rs`). Added to workspace `Cargo.toml` members.
- `ChClient` gains two methods (in `backend-rs`, reused by API later):
  `execute(sql)` for DDL / `INSERT ... SELECT` (sweeper, cohorts,
  backfills), and `insert(table, columns, rows)` via
  `INSERT ... FORMAT JSONEachRow` over HTTP with serde_json escaping.
  ClickHouse HTTP returns non-200 on error; also guard on `Code:` text.
- HTTP fetches use the existing `reqwest` (rustls) client; per-job
  timeouts 20-30s matching the Python timeouts. Base URLs as constants,
  overridable by env for tests (`BINANCE_FAPI_URL` etc. — my call).
- Schedule (same as old beat, `ping` and the no-op `price-poll-stub`
  dropped; redundant notes-only `poll_keyed_sources` dropped since each
  keyed job already no-ops with its own note — my calls): price hourly;
  funding hourly; everything else daily (fear/greed, cross-asset,
  cohorts, sweeper, usd, macro, etf, lightning). Timing is
  interval-from-boot with jittered first run and `MissedTickBehavior::Skip`
  (no overlap pile-up, no wall-clock alignment — my call). A schedule
  table test pins every job's interval against these values.
- CLI: `scheduler run-once <job> [--day ...] | run-all-once | serve`
  (serve = loop forever; default). `--list-jobs` for discoverability.
  Job names mirror the old task suffixes (`price-hourly`, `fear-greed`,
  `funding`, `cross-asset`, `cohorts`, `sweeper`, `address-usd`,
  `macro`, `etf-flows`, `lightning`).
- `ETF_FLOW_CSV` keeps path-or-URL semantics; a local path must be
  volume-mounted into the scheduler container (my call, no compose
  change needed).
- Env keys unchanged: `FRED_API_KEY`, `ETF_FLOW_CSV`, `ONE_ML_TOKEN`
  (documented in `.env.example`).
- Compose: `scheduler` service, `profiles: ["worker"]`, builds from
  workspace root like `backend-rs/Dockerfile` pattern.
- Idempotence verified (not assumed): all target tables are
  `ReplacingMergeTree` (`price_ohlc_hourly` versioned by `ts`, the
  rest by `updated_at`), so re-runs and next-tick retries dedup.
- Tests:
  - Unit (no IO): all parse/merge functions with the old Python
    vectors; SQL shape tests (table names, bucket bounds, merge-safe
    argMax markers).
  - Stub-HTTP (no new deps): hand-rolled `tokio::TcpListener` stub
    serving canned Binance/Kraken/FNG payloads; asserts rows built.
  - Live ClickHouse (repo convention, dev host has it): `execute` +
    `insert` round-trip against scratch tables; sweeper SQL runs against
    empty `outputs_v2` copy and returns skip ( honest no-op path).
  - Schedule table test: every job has an interval; intervals match the
    old beat values (regression against silent schedule drift).
- Docs: README worker section rewritten; `docs/metrics-coverage.md`
  scheduler-TODO note resolved.

## Left to the builder

- Exact module split inside `scheduler/src/jobs/` (one file per source
  is fine if files stay small).
- Log field names (keep `job`, `inserted`/`skipped`, `elapsed_ms`).
- Whether `run-all-once` runs sequentially (simplest, chosen default)
  or concurrently.
