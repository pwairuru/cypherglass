-- clickhouse/init/13_address_usd.sql
-- USD-denominated address cohorts + share of addresses in profit.
-- Populated by external address-USD ingest (legacy Python worker removed
-- 2026-11-24; Rust scheduler TODO):
-- per-address average cost = sum(received USD) / sum(received BTC) from
-- outputs_v2 (latest-version dedup) joined to bitcoin.price_ohlc_daily,
-- balances revalued at the day's close. Addresses with average cost below
-- the day's close count as in profit. Receives on days without a BTCUSDT
-- close are excluded from both sides (documented approximation; Binance
-- history starts 2017, so pre-2017 receives need a price backfill).
CREATE TABLE IF NOT EXISTS marts.address_usd_daily
(day Date CODEC(ZSTD(9)),
 gt_1k_usd UInt64 CODEC(T64, ZSTD(9)),
 gt_10k_usd UInt64 CODEC(T64, ZSTD(9)),
 gt_100k_usd UInt64 CODEC(T64, ZSTD(9)),
 gt_1m_usd UInt64 CODEC(T64, ZSTD(9)),
 pct_in_profit Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
