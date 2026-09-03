-- clickhouse/init/05_mvs.sql
-- Hourly MVs aggregate base v2 tables into -State columns (queried with
-- -Merge combinators). Daily MVs aggregate the SAME base v2 tables directly
-- (NOT cascaded from hourly MVs — ClickHouse never fires MV triggers on MV
-- inserts, so cascaded daily MVs stayed empty; measured hourly rows arrive,
-- daily stays 0). Daily columns are therefore -State too, merged at read.
-- mv_script_hourly stays hourly-only (no daily rollup).
DROP VIEW IF EXISTS bitcoin.block_stats_daily;
DROP VIEW IF EXISTS bitcoin.tx_volume_hourly;
DROP VIEW IF EXISTS bitcoin.address_activity_daily;
DROP VIEW IF EXISTS bitcoin.mv_blocks_hourly;
DROP VIEW IF EXISTS bitcoin.mv_tx_fee_hourly;
DROP VIEW IF EXISTS bitcoin.mv_script_hourly;
DROP VIEW IF EXISTS bitcoin.mv_addr_hourly;
DROP VIEW IF EXISTS bitcoin.mv_flow_hourly;
DROP VIEW IF EXISTS bitcoin.mv_blocks_daily;
DROP VIEW IF EXISTS bitcoin.mv_tx_fee_daily;
DROP VIEW IF EXISTS bitcoin.mv_addr_daily;
DROP VIEW IF EXISTS bitcoin.mv_flow_daily;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_hourly
(hour DateTime CODEC(ZSTD(7)),
 block_count AggregateFunction(count) CODEC(ZSTD(7)),
 avg_size AggregateFunction(avg, UInt32) CODEC(ZSTD(7)),
 avg_weight AggregateFunction(avg, UInt32) CODEC(ZSTD(7)),
 avg_tx_count AggregateFunction(avg, UInt16) CODEC(ZSTD(7)),
 avg_interval AggregateFunction(avg, Int32) CODEC(ZSTD(7)),
 avg_difficulty AggregateFunction(avg, Float64) CODEC(ZSTD(7)),
 reward_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)),
 fee_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS block_count,
  avgState(size) AS avg_size,
  avgState(weight) AS avg_weight,
  avgState(tx_count) AS avg_tx_count,
  avgState(interval_sec) AS avg_interval,
  avgState(difficulty) AS avg_difficulty,
  sumState(reward_sat) AS reward_sum,
  sumState(fee_total_sat) AS fee_sum
FROM bitcoin.blocks_v2 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_hourly
(hour DateTime CODEC(ZSTD(7)),
 tx_count AggregateFunction(count) CODEC(ZSTD(7)),
 large_tx_count AggregateFunction(countIf, UInt8) CODEC(ZSTD(7)),
 fee_sum AggregateFunction(sum, Int64) CODEC(ZSTD(7)),
 fee_median AggregateFunction(quantile(0.5), Int64) CODEC(ZSTD(7)),
 feerate_median AggregateFunction(quantile(0.5), Float32) CODEC(ZSTD(7)),
 value_median AggregateFunction(quantile(0.5), UInt64) CODEC(ZSTD(7)),
 transfer_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)),
 vin_sum AggregateFunction(sum, UInt16) CODEC(ZSTD(7)),
 vout_sum AggregateFunction(sum, UInt16) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS tx_count,
  countStateIf(total_out_sat > 1000000000) AS large_tx_count,
  sumState(fee_sat) AS fee_sum,
  quantileState(0.5)(fee_sat) AS fee_median,
  quantileState(0.5)(fee_rate_sat_vbyte) AS feerate_median,
  quantileState(0.5)(total_out_sat) AS value_median,
  sumState(total_out_sat) AS transfer_sum,
  sumState(vin_count) AS vin_sum,
  sumState(vout_count) AS vout_sum
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_script_hourly
(hour DateTime CODEC(ZSTD(7)),
 script_type LowCardinality(String),
 out_count AggregateFunction(count) CODEC(ZSTD(7)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY (hour, script_type)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour, script_type,
  countState() AS out_count,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 GROUP BY hour, script_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_hourly
(hour DateTime CODEC(ZSTD(7)),
 active AggregateFunction(uniq, String) CODEC(ZSTD(7)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  uniqState(address) AS active,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_hourly
(hour DateTime CODEC(ZSTD(7)),
 transfer_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(7)),
 tx_count AggregateFunction(count) CODEC(ZSTD(7)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  sumState(total_out_sat) AS transfer_sum,
  countState() AS tx_count
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_daily
(day Date CODEC(ZSTD(9)),
 block_count AggregateFunction(count) CODEC(ZSTD(9)),
 avg_size AggregateFunction(avg, UInt32) CODEC(ZSTD(9)),
 avg_weight AggregateFunction(avg, UInt32) CODEC(ZSTD(9)),
 avg_tx_count AggregateFunction(avg, UInt16) CODEC(ZSTD(9)),
 avg_interval AggregateFunction(avg, Int32) CODEC(ZSTD(9)),
 avg_difficulty AggregateFunction(avg, Float64) CODEC(ZSTD(9)),
 reward_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)),
 fee_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  countState() AS block_count,
  avgState(size) AS avg_size,
  avgState(weight) AS avg_weight,
  avgState(tx_count) AS avg_tx_count,
  avgState(interval_sec) AS avg_interval,
  avgState(difficulty) AS avg_difficulty,
  sumState(reward_sat) AS reward_sum,
  sumState(fee_total_sat) AS fee_sum
FROM bitcoin.blocks_v2 GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_daily
(day Date CODEC(ZSTD(9)),
 tx_count AggregateFunction(count) CODEC(ZSTD(9)),
 large_tx_count AggregateFunction(countIf, UInt8) CODEC(ZSTD(9)),
 fee_sum AggregateFunction(sum, Int64) CODEC(ZSTD(9)),
 fee_median AggregateFunction(quantile(0.5), Int64) CODEC(ZSTD(9)),
 feerate_median AggregateFunction(quantile(0.5), Float32) CODEC(ZSTD(9)),
 value_median AggregateFunction(quantile(0.5), UInt64) CODEC(ZSTD(9)),
 transfer_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)),
 vin_sum AggregateFunction(sum, UInt16) CODEC(ZSTD(9)),
 vout_sum AggregateFunction(sum, UInt16) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  countState() AS tx_count,
  countStateIf(total_out_sat > 1000000000) AS large_tx_count,
  sumState(fee_sat) AS fee_sum,
  quantileState(0.5)(fee_sat) AS fee_median,
  quantileState(0.5)(fee_rate_sat_vbyte) AS feerate_median,
  quantileState(0.5)(total_out_sat) AS value_median,
  sumState(total_out_sat) AS transfer_sum,
  sumState(vin_count) AS vin_sum,
  sumState(vout_count) AS vout_sum
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_daily
(day Date CODEC(ZSTD(9)),
 active AggregateFunction(uniq, String) CODEC(ZSTD(9)),
 value_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  uniqState(address) AS active,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_daily
(day Date CODEC(ZSTD(9)),
 transfer_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)),
 tx_count AggregateFunction(count) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(timestamp) AS day,
  sumState(total_out_sat) AS transfer_sum,
  countState() AS tx_count
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY day;
