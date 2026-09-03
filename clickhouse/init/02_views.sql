-- Daily block statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.block_stats_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    countState() AS block_count,
    avgState(size) AS avg_size_bytes,
    sumState(tx_count) AS tx_count,
    avgState(difficulty) AS avg_difficulty
FROM bitcoin.blocks
GROUP BY day;

-- Hourly transaction volume
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.tx_volume_hourly
ENGINE = AggregatingMergeTree
ORDER BY hour
SETTINGS storage_policy = 's3_main'
AS SELECT
    toStartOfHour(timestamp) AS hour,
    countState() AS tx_count,
    sumState(total_out_sat) AS total_out_sat_state,
    avgState(fee_sat) AS avg_fee_sat
FROM bitcoin.transactions
WHERE is_coinbase = 0
GROUP BY hour;

-- Daily active addresses
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.address_activity_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    uniqState(address) AS active_addresses
FROM bitcoin.outputs
WHERE address != ''
GROUP BY day;
