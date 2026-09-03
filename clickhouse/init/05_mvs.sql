-- clickhouse/init/05_mvs.sql
DROP VIEW IF EXISTS bitcoin.block_stats_daily;
DROP VIEW IF EXISTS bitcoin.tx_volume_hourly;
DROP VIEW IF EXISTS bitcoin.address_activity_daily;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS block_count CODEC(ZSTD(7)),
  avgState(size) AS avg_size CODEC(ZSTD(7)),
  avgState(weight) AS avg_weight CODEC(ZSTD(7)),
  avgState(tx_count) AS avg_tx_count CODEC(ZSTD(7)),
  avgState(interval_sec) AS avg_interval CODEC(ZSTD(7)),
  avgState(difficulty) AS avg_difficulty CODEC(ZSTD(7)),
  sumState(reward_sat) AS reward_sum CODEC(ZSTD(7)),
  sumState(fee_total_sat) AS fee_sum CODEC(ZSTD(7))
FROM bitcoin.blocks_v2 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS tx_count CODEC(ZSTD(7)),
  countStateIf(total_out_sat > 1000000000) AS large_tx_count CODEC(ZSTD(7)),
  sumState(fee_sat) AS fee_sum CODEC(ZSTD(7)),
  quantileState(0.5)(fee_sat) AS fee_median CODEC(ZSTD(7)),
  quantileState(0.5)(fee_rate_sat_vbyte) AS feerate_median CODEC(ZSTD(7)),
  quantileState(0.5)(total_out_sat) AS value_median CODEC(ZSTD(7)),
  sumState(total_out_sat) AS transfer_sum CODEC(ZSTD(7)),
  sumState(vin_count) AS vin_sum CODEC(ZSTD(7)),
  sumState(vout_count) AS vout_sum CODEC(ZSTD(7))
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_script_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY (hour, script_type)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour, script_type,
  countState() AS out_count CODEC(ZSTD(7)),
  sumState(value_sat) AS value_sum CODEC(ZSTD(7))
FROM bitcoin.outputs_v2 GROUP BY hour, script_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  uniqState(address) AS active CODEC(ZSTD(7)),
  sumState(value_sat) AS value_sum CODEC(ZSTD(7))
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  sumState(total_out_sat) AS transfer_sum CODEC(ZSTD(7)),
  countState() AS tx_count CODEC(ZSTD(7))
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(block_count) AS blocks CODEC(ZSTD(9)),
  avgMerge(avg_size) AS avg_size CODEC(ZSTD(9)),
  avgMerge(avg_weight) AS avg_weight CODEC(ZSTD(9)),
  avgMerge(avg_tx_count) AS avg_tx_count CODEC(ZSTD(9)),
  avgMerge(avg_interval) AS avg_interval CODEC(ZSTD(9)),
  avgMerge(avg_difficulty) AS avg_difficulty CODEC(ZSTD(9)),
  sumMerge(reward_sum) AS reward_sum CODEC(ZSTD(9)),
  sumMerge(fee_sum) AS fee_sum CODEC(ZSTD(9))
FROM bitcoin.mv_blocks_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(tx_count) AS tx_count CODEC(ZSTD(9)),
  sumMerge(fee_sum) AS fee_sum CODEC(ZSTD(9)),
  quantileMerge(fee_median) AS fee_median CODEC(ZSTD(9)),
  quantileMerge(feerate_median) AS feerate_median CODEC(ZSTD(9)),
  sumMerge(transfer_sum) AS transfer_sum CODEC(ZSTD(9))
FROM bitcoin.mv_tx_fee_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  uniqMerge(active) AS active CODEC(ZSTD(9)),
  sumMerge(value_sum) AS value_sum CODEC(ZSTD(9))
FROM bitcoin.mv_addr_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  sumMerge(transfer_sum) AS transfer_sum CODEC(ZSTD(9)),
  countMerge(tx_count) AS tx_count CODEC(ZSTD(9))
FROM bitcoin.mv_flow_hourly GROUP BY day;
