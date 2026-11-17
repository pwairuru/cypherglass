-- clickhouse/init/09_derived_marts.sql
-- Derived marts for 200+ catalog: supply, price-technicals, risk composite,
-- cycle bands. Populated by backend worker / seed_dev.py (ReplacingMergeTree
-- updated_at -> query with argMax(col, updated_at)). Small tables, S3-backed.
CREATE DATABASE IF NOT EXISTS marts;

-- Cumulative supply + issuance (backfill: sum rewards from mv_blocks_daily).
CREATE TABLE IF NOT EXISTS marts.supply_daily
(day Date CODEC(ZSTD(9)),
 supply_btc Float64 CODEC(Gorilla, ZSTD(9)),
 issued_btc Float64 CODEC(Gorilla, ZSTD(9)),
 subsidy_btc Float64 CODEC(Gorilla, ZSTD(9)),
 inflation_annual Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

-- Price technicals: SMA/EMA, Mayer, drawdown, ATH, volatility, RSI14.
-- Backfill from bitcoin.price_ohlc_daily with window functions.
CREATE TABLE IF NOT EXISTS marts.price_tech_daily
(day Date CODEC(ZSTD(9)),
 close Float64 CODEC(Gorilla, ZSTD(9)),
 sma20 Float64 CODEC(Gorilla, ZSTD(9)),
 sma50 Float64 CODEC(Gorilla, ZSTD(9)),
 sma200 Float64 CODEC(Gorilla, ZSTD(9)),
 ema21 Float64 CODEC(Gorilla, ZSTD(9)),
 mayer Float64 CODEC(Gorilla, ZSTD(9)),
 ath Float64 CODEC(Gorilla, ZSTD(9)),
 drawdown Float64 CODEC(Gorilla, ZSTD(9)),
 ath_distance Float64 CODEC(Gorilla, ZSTD(9)),
 volatility30 Float64 CODEC(Gorilla, ZSTD(9)),
 rsi14 Float64 CODEC(Gorilla, ZSTD(9)),
 bull_support Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

-- Composite risk 0-100 + component z-scores (ITC-style). Inputs: MVRV, NUPL,
-- SOPR, Puell, NVT, Mayer. Seed computes from marts + price_tech.
CREATE TABLE IF NOT EXISTS marts.risk_daily
(day Date CODEC(ZSTD(9)),
 risk Float64 CODEC(Gorilla, ZSTD(9)),
 risk_mvrv Float64 CODEC(Gorilla, ZSTD(9)),
 risk_nupl Float64 CODEC(Gorilla, ZSTD(9)),
 risk_sopr Float64 CODEC(Gorilla, ZSTD(9)),
 risk_puell Float64 CODEC(Gorilla, ZSTD(9)),
 risk_mayer Float64 CODEC(Gorilla, ZSTD(9)),
 regime LowCardinality(String),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

-- Cycle bands: 200W MA heatmap, 2Y MA multiplier, Pi-cycle proxies,
-- golden-ratio multiples, power-law fair value.
CREATE TABLE IF NOT EXISTS marts.bands_daily
(day Date CODEC(ZSTD(9)),
 ma200w Float64 CODEC(Gorilla, ZSTD(9)),
 heat_200w Float64 CODEC(Gorilla, ZSTD(9)),
 ma2y Float64 CODEC(Gorilla, ZSTD(9)),
 ma2y_x5 Float64 CODEC(Gorilla, ZSTD(9)),
 ma111 Float64 CODEC(Gorilla, ZSTD(9)),
 ma350 Float64 CODEC(Gorilla, ZSTD(9)),
 ma350_x2 Float64 CODEC(Gorilla, ZSTD(9)),
 cvdd_proxy Float64 CODEC(Gorilla, ZSTD(9)),
 balanced_proxy Float64 CODEC(Gorilla, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';

-- S2F / issuance schedule (deterministic from height; seeded once).
CREATE TABLE IF NOT EXISTS marts.issuance_daily
(day Date CODEC(ZSTD(9)),
 height UInt32 CODEC(T64, ZSTD(9)),
 subsidy_sat UInt64 CODEC(T64, ZSTD(9)),
 s2f Float64 CODEC(Gorilla, ZSTD(9)),
 s2f_fair Float64 CODEC(Gorilla, ZSTD(9)),
 next_halving_days UInt32 CODEC(T64, ZSTD(9)),
 updated_at DateTime CODEC(DoubleDelta, ZSTD(9)))
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
