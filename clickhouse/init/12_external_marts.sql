-- clickhouse/init/12_external_marts.sql
-- Externally-sourced marts for LookIntoBitcoin / IntoTheCryptoverse coverage:
-- derivatives (Binance futures, no key), ETF flows, macro (FRED, needs key),
-- sentiment (Alternative.me, no key), cross-asset (Kraken/CoinGecko, no key),
-- lightning (1ML, needs token), address cohorts (needs addresses_v2 sweeper).
-- Populated by external ingest (legacy Python Celery worker removed 2026-11-24;
-- Rust scheduler TODO). Tables exist empty until ingest runs; metrics read them
-- with argMax and the API marks empty results stale=true, so no fake data is
-- ever served.
CREATE DATABASE IF NOT EXISTS marts;

CREATE TABLE IF NOT EXISTS marts.funding_daily
(day Date CODEC(ZSTD(9)),
 funding_rate Float64 CODEC(Gorilla, ZSTD(9)),
 open_interest_usd Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS marts.etf_flows_daily
(day Date CODEC(ZSTD(9)),
 flow_btc Float64 CODEC(Gorilla, ZSTD(9)),
 flow_usd Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS marts.macro_daily
(day Date CODEC(ZSTD(9)),
 dxy Float64 CODEC(Gorilla, ZSTD(9)),
 m2_global_t Float64 CODEC(Gorilla, ZSTD(9)),
 fed_funds Float64 CODEC(Gorilla, ZSTD(9)),
 cpi_yoy Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS marts.fear_greed_daily
(day Date CODEC(ZSTD(9)),
 value UInt8 CODEC(T64, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS marts.alt_prices_daily
(day Date CODEC(ZSTD(9)),
 ethbtc Float64 CODEC(Gorilla, ZSTD(9)),
 btc_dominance Float64 CODEC(Gorilla, ZSTD(9)),
 total_mcap_t Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
CREATE TABLE IF NOT EXISTS marts.lightning_daily
(day Date CODEC(ZSTD(9)),
 capacity_btc Float64 CODEC(Gorilla, ZSTD(9)),
 nodes UInt32 CODEC(T64, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

-- Address balance cohorts. Populated by the addresses_v2 sweeper (TODO):
-- per-day counts of addresses by BTC balance + new addresses (first-seen).
CREATE TABLE IF NOT EXISTS marts.address_cohorts_daily
(day Date CODEC(ZSTD(9)),
 new_addresses UInt64 CODEC(T64, ZSTD(9)),
 gt_1_btc UInt64 CODEC(T64, ZSTD(9)),
 gt_10_btc UInt64 CODEC(T64, ZSTD(9)),
 gt_100_btc UInt64 CODEC(T64, ZSTD(9)),
 gt_1000_btc UInt64 CODEC(T64, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
