-- clickhouse/init/05_mvs.sql
DROP VIEW IF EXISTS bitcoin.block_stats_daily;
DROP VIEW IF EXISTS bitcoin.tx_volume_hourly;
DROP VIEW IF EXISTS bitcoin.address_activity_daily;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_hourly
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
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY (hour, script_type)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour, script_type,
  countState() AS out_count,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 GROUP BY hour, script_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  uniqState(address) AS active,
  sumState(value_sat) AS value_sum
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  sumState(total_out_sat) AS transfer_sum,
  countState() AS tx_count
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(block_count) AS blocks,
  avgMerge(avg_size) AS avg_size,
  avgMerge(avg_weight) AS avg_weight,
  avgMerge(avg_tx_count) AS avg_tx_count,
  avgMerge(avg_interval) AS avg_interval,
  avgMerge(avg_difficulty) AS avg_difficulty,
  sumMerge(reward_sum) AS reward_sum,
  sumMerge(fee_sum) AS fee_sum
FROM bitcoin.mv_blocks_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(tx_count) AS tx_count,
  sumMerge(fee_sum) AS fee_sum,
  quantileMerge(fee_median) AS fee_median,
  quantileMerge(feerate_median) AS feerate_median,
  sumMerge(transfer_sum) AS transfer_sum
FROM bitcoin.mv_tx_fee_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  uniqMerge(active) AS active,
  sumMerge(value_sum) AS value_sum
FROM bitcoin.mv_addr_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  sumMerge(transfer_sum) AS transfer_sum,
  countMerge(tx_count) AS tx_count
FROM bitcoin.mv_flow_hourly GROUP BY day;
