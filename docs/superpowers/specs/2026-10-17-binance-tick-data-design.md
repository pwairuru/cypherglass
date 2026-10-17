# Binance Tick Data (BTC) — Design

Date: 2026-10-17. Approach A approved. BTC only. Spot first, futures-ready.
Source blog: ClickHouse historical ticker data (Binance public archive,
`data.binance.vision`), trades + bookTicker quotes, MergeTree
`ORDER BY (symbol, ts)`, ~19x compression, VWAP / OHLC / ASOF-join queries.

## 1. Goal

Index Binance public-archive tick data for BTC into CypherGlass
ClickHouse tables, power a few more charts (VWAP, volume, microstructure),
keep fetching new data daily. Raw archive files also persisted in S3.

## 2. Tables (`market` DB, new)

Isolate tick data from onchain `bitcoin` DB. Blog schema verbatim plus
`market` discriminator so futures slots in later with zero schema change.

```sql
CREATE DATABASE IF NOT EXISTS market;

CREATE TABLE IF NOT EXISTS market.trades (
    market LowCardinality(String),          -- 'spot' now, 'futures' later
    symbol LowCardinality(String),          -- 'BTCUSDT'
    ts DateTime64(3) CODEC(DoubleDelta, ZSTD(1)),
    price Decimal(18, 8) CODEC(ZSTD(1)),
    qty Decimal(18, 8) CODEC(ZSTD(1)),
    quote_qty Decimal(20, 8) CODEC(ZSTD(1)),
    trade_id UInt64 CODEC(DoubleDelta, ZSTD(1)),
    is_buyer_maker UInt8 CODEC(ZSTD(1))
) ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (market, symbol, ts)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS market.quotes (
    market LowCardinality(String),
    symbol LowCardinality(String),
    ts DateTime64(3) CODEC(DoubleDelta, ZSTD(1)),
    bid_price Decimal(18, 8) CODEC(ZSTD(1)),
    bid_qty Decimal(18, 8) CODEC(ZSTD(1)),
    ask_price Decimal(18, 8) CODEC(ZSTD(1)),
    ask_qty Decimal(18, 8) CODEC(ZSTD(1)),
    update_id UInt64 CODEC(DoubleDelta, ZSTD(1))
) ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (market, symbol, ts)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS market.ingest_state (
    dataset LowCardinality(String),         -- 'trades' | 'bookTicker'
    market LowCardinality(String),
    day Date,
    status LowCardinality(String),          -- 'ok' | 'failed' | 'skipped'
    rows UInt64,
    checksum String,
    updated_at DateTime CODEC(DoubleDelta, ZSTD(1))
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (dataset, market, day)
SETTINGS storage_policy = 's3_main';
```

Notes:
- `ReplacingMergeTree` (not blog's plain `MergeTree`) → safe re-download
  replays dedup on `(market, symbol, ts, trade_id)` / update_id ordering.
- Spot column layout matches futures layout except futures `bookTicker`
  uses `transaction_time`; parser normalizes both to `ts`.
- Decimal widths widened vs blog (blog used 12,2/12,4 tuned for USDT-M
  futures display); 18,8 preserves BTC precision for both venues.

## 3. Raw files in S3

Downloader persists every original ZIP (+ `.CHECKSUM`) to S3 before
ClickHouse insert, for replay/audit without re-hitting Binance:

- Location: `s3://$CLICKHOUSE_BUCKET/market-raw/{spot|futures-um}/{trades|bookTicker}/BTCUSDT/BTCUSDT-{trades|bookTicker}-{YYYY-MM-DD | YYYY-MM}.zip`
  (same bucket ClickHouse S3 disk already uses; no new bucket/infra).
- Local dev: rustfs `clickhouse-storage` bucket; prod: real S3 via
  existing `S3_ENDPOINT` / `AWS_*` env.
- `market.ingest_state.checksum` records archive checksum; replay =
  re-stream from S3 prefix, never re-download unless missing.
- Lifecycle (prod): keep monthly ZIPs indefinitely (cheap, ~20 GB/mo for
  BTC); daily ZIPs expire after 90 d once merged into monthly coverage
  check. Configurable via env `MARKET_RAW_DAILY_TTL_DAYS=90`.

## 4. Ingestion

New module `backend/app/workers/market.py` + CLI `scripts/market_backfill.py`
(sharing one download→S3→parse→insert core).

- URLs:
  `https://data.binance.vision/data/{spot|futures/um}/{monthly|daily}/{trades|bookTicker}/BTCUSDT/`
  Monthly ZIPs for old dates, daily for recent. Verify `.CHECKSUM` first.
- Flow per day file: download → upload raw ZIP to S3 prefix → stream CSV
  (chunked, ~100k rows/batch via `clickhouse-connect`) → upsert
  `ingest_state`. Sequential oldest→newest for backfill; idempotent reruns.
- Full history = monthly files back to venue start + daily to present.
  BTC spot full history is tens of billions of rows (quotes ~5x trades);
  `PARTITION BY toYYYYMM` + `(market, symbol, ts)` index keeps
  symbol/time queries to ~0.001% granules (per blog query plan).
- Freshness: Celery beat `poll_market_daily`, 1×/day, fetches T-1
  (archive publishes with ~1-day delay), 3 retries, checksum mismatch →
  quarantine + `status='failed'`, alert in logs.
- Env: `MARKET_SYMBOLS=BTCUSDT` (locked to BTC), `MARKET_VENUES=spot`
  (add `futures-um` later), `MARKET_BACKFILL_SINCE` (local dev default:
  last 90 d; prod: full), `MARKET_RAW_PREFIX=market-raw`.
- Gap detection: `SELECT day FROM ... WHERE status != 'ok'` over
  `ingest_state` + coverage query for UI banner.

## 5. Aggregates + API (never query raw from charts)

New MVs in `clickhouse/init/08_market_mvs.sql`, following the `05_mvs.sql`
rule: daily MVs read base tables directly (no cascade — ClickHouse never
fires MV triggers on MV inserts).

- `market.mv_trade_hourly/daily`: `sumState(quote_qty)`, `sumState(qty)`,
  `countState()`, `countStateIf(is_buyer_maker=...)`, `quantileState(price)`.
- `market.mv_quote_daily`: spread states
  (`avgState((ask-bid)/mid)`, `quantileState(spread_bps)`).
- Registry additions (`backend/app/metrics/registry.py`, category
  `market`): `vwap_daily` (`sumMerge(quote_qty)/sumMerge(qty)`), notional
  volume, trade count, avg trade size, taker-buy ratio, spread bps daily,
  tick-OHLC (validates existing `price_ohlc_*` from REST klines).
- ASOF-join slippage analysis stays ad-hoc SQL (docs runbook), not an
  always-on chart — too heavy per render.
- Coverage endpoint extended to include market day bounds.

## 6. Frontend

New `market` category in `Dashboard.tsx` metric rail; reuse `OnchainChart`
(+ price overlay) and `PriceChart` candles. No chart-lib changes.
Charts v1: VWAP daily, notional volume, trade count, spread bps.
Tick-OHLC shown as validation overlay against REST `price_ohlc_daily`.

## 7. Error handling

- Checksum mismatch → skip insert, `status='failed'`, keep bad file out of
  S3 `market-raw/` (or under `quarantine/` prefix), retry next beat.
- Partial insert → rerun same day (ReplacingMergeTree dedups).
- Missing day (venue gap, e.g. quotes halt like blog's Mar-2024 futures
  stop) → `status='skipped'` with note; UI coverage banner shows gap.
- S3 upload failure → abort before insert (raw-first invariant).

## 8. Testing

- Unit: spot + futures CSV row parsers (header variants:
  `time` vs `transaction_time`), checksum verifier, S3 key builder.
- E2E mini-load: 3-day sample (trades + bookTicker) into throwaway
  ClickHouse, assert row counts + VWAP spot-check vs known value.
- Registry: SQL dry-run (`EXPLAIN`) for each new metric; API 200 + shape.
- Playwright: market category renders, charts non-empty (headed mode).

## 9. Rollout

1. Migration `07_market.sql` (tables) + `08_market_mvs.sql` (MVs).
2. Backfill script + docs runbook; local 90 d first, verify charts.
3. Celery beat daily task on; prod full-history backfill in background.
4. Futures venue = config flip (`MARKET_VENUES=spot,futures-um`), no
   schema change.

## Open questions (non-blocking)

- Futures `symbol` naming (`BTCUSDT` collides across venues) — resolved
  by `market` column, but UI must always filter `market='spot'` until
  futures ships.
- Quotes retention: full raw approved; if prod storage surprises, add
  downsampled `market.quotes_1m` + 90 d raw TTL as follow-up (approach B
  fallback).
