-- clickhouse/init/08_extended_mvs.sql
-- WARNING: DROP VIEWs below make re-applying this file DESTRUCTIVE on
-- populated systems (fresh MVs start empty). See 05_mvs.sql header.
-- Extended pre-aggregations for 200+ metric catalog. All read ONLY base v2
-- tables (never MVs — no cascade), emit -State columns queried with -Merge.
-- S3-friendly: AggregatingMergeTree, monthly partitions, ZSTD(7/9).

-- Daily script-type breakdown (hourly exists as mv_script_hourly).
-- NOTE: no DROP VIEW statements in this file (removed 2026-11-23).
-- MV re-definition is intentionally NOT automatic: DROP+CREATE on a
-- populated system wipes aggregates irreversibly (proven live). To change
-- an MV definition, drop it manually during maintenance, then apply.
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_script_daily
(day Date CODEC(ZSTD(9)),
 script_type LowCardinality(String),
 out_count AggregateFunction(count) CODEC(ZSTD(9)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY (day, script_type)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day, script_type,
  countState() AS out_count,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 GROUP BY day, script_type;

-- Fee-rate buckets: whale/urgent vs economy split (ITC + BM Pro fee panels).
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_fee_buckets_daily
(day Date CODEC(ZSTD(9)),
 bucket LowCardinality(String),
 tx_count AggregateFunction(count) CODEC(ZSTD(9)),
 fee_sum AggregateFunction(sum, Int64) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY (day, bucket)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  multiIf(fee_rate_sat_vbyte < 1, '0-1',
          fee_rate_sat_vbyte < 5, '1-5',
          fee_rate_sat_vbyte < 20, '5-20',
          fee_rate_sat_vbyte < 100, '20-100', '100+') AS bucket,
  countState() AS tx_count,
  sumState(fee_sat) AS fee_sum
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY day, bucket;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_fee_buckets_hourly
(hour DateTime CODEC(ZSTD(7)),
 bucket LowCardinality(String),
 tx_count AggregateFunction(count) CODEC(ZSTD(7)),
 fee_sum AggregateFunction(sum, Int64) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY (hour, bucket)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  multiIf(fee_rate_sat_vbyte < 1, '0-1',
          fee_rate_sat_vbyte < 5, '1-5',
          fee_rate_sat_vbyte < 20, '5-20',
          fee_rate_sat_vbyte < 100, '20-100', '100+') AS bucket,
  countState() AS tx_count,
  sumState(fee_sat) AS fee_sum
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour, bucket;

-- Tx size / weight / input-output shape (supports BM Pro throughput panels).
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_size_daily
(day Date CODEC(ZSTD(9)),
 tx_count AggregateFunction(count) CODEC(ZSTD(9)),
 size_median AggregateFunction(quantile(0.5), UInt32) CODEC(ZSTD(9)),
 weight_median AggregateFunction(quantile(0.5), UInt32) CODEC(ZSTD(9)),
 size_sum AggregateFunction(sum, UInt32) CODEC(ZSTD(9)),
 weight_sum AggregateFunction(sum, UInt32) CODEC(ZSTD(9)),
 vin_median AggregateFunction(quantile(0.5), UInt16) CODEC(ZSTD(9)),
 vout_median AggregateFunction(quantile(0.5), UInt16) CODEC(ZSTD(9)),
 segwit_share AggregateFunction(avg, UInt8) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  countState() AS tx_count,
  quantileState(0.5)(size) AS size_median,
  quantileState(0.5)(weight) AS weight_median,
  sumState(size) AS size_sum,
  sumState(weight) AS weight_sum,
  quantileState(0.5)(vin_count) AS vin_median,
  quantileState(0.5)(vout_count) AS vout_median,
  avgState(weight < size * 4) AS segwit_share
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_size_hourly
(hour DateTime CODEC(ZSTD(7)),
 tx_count AggregateFunction(count) CODEC(ZSTD(7)),
 size_median AggregateFunction(quantile(0.5), UInt32) CODEC(ZSTD(7)),
 weight_median AggregateFunction(quantile(0.5), UInt32) CODEC(ZSTD(7)),
 size_sum AggregateFunction(sum, UInt32) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS tx_count,
  quantileState(0.5)(size) AS size_median,
  quantileState(0.5)(weight) AS weight_median,
  sumState(size) AS size_sum
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

-- Output value buckets (dust / retail / whale / institutional).
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_value_buckets_daily
(day Date CODEC(ZSTD(9)),
 bucket LowCardinality(String),
 out_count AggregateFunction(count) CODEC(ZSTD(9)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY (day, bucket)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  multiIf(value_sat < 10000, 'dust',
          value_sat < 1000000, 'small',
          value_sat < 100000000, 'retail',
          value_sat < 1000000000, 'whale', 'institutional') AS bucket,
  countState() AS out_count,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 GROUP BY day, bucket;

-- Hourly address cohorts are uniqState (non-additive across days); daily
-- new-address proxy uses min-seen via outputs (decoder backfills
-- addresses_v2 async, so MV stays independent of sweeper lag).
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_outputs_daily
(day Date CODEC(ZSTD(9)),
 out_count AggregateFunction(count) CODEC(ZSTD(9)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)),
 value_median AggregateFunction(quantile(0.5), UInt64) CODEC(ZSTD(9)),
 addr_count AggregateFunction(uniq, String) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  countState() AS out_count,
  sumState(value_sat) AS value_sum,
  quantileState(0.5)(value_sat) AS value_median,
  uniqState(address) AS addr_count
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY day;
