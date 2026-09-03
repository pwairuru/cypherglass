CREATE DATABASE IF NOT EXISTS bitcoin;

CREATE TABLE IF NOT EXISTS bitcoin.blocks_v2 (
    height UInt32 CODEC(Delta(4), ZSTD(6)),
    hash String CODEC(ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    size UInt32 CODEC(Delta(4), ZSTD(6)),
    weight UInt32 CODEC(Delta(4), ZSTD(6)),
    version UInt32 CODEC(T64, ZSTD(6)),
    bits UInt32 CODEC(T64, ZSTD(6)),
    nonce UInt32 CODEC(T64, ZSTD(6)),
    merkle_root String CODEC(ZSTD(6)),
    prev_hash String CODEC(ZSTD(6)),
    tx_count UInt16 CODEC(T64, ZSTD(6)),
    difficulty Float64 CODEC(Gorilla, ZSTD(6)),
    chainwork String CODEC(ZSTD(6)),
    reward_sat UInt64 CODEC(T64, ZSTD(6)),
    fee_total_sat UInt64 CODEC(T64, ZSTD(6)),
    interval_sec Int32 CODEC(T64, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, height)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.transactions_v2 (
    txid String CODEC(ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    block_hash String CODEC(ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    version UInt32 CODEC(T64, ZSTD(6)),
    locktime UInt32 CODEC(T64, ZSTD(6)),
    size UInt32 CODEC(Delta(4), ZSTD(6)),
    weight UInt32 CODEC(Delta(4), ZSTD(6)),
    vin_count UInt16 CODEC(T64, ZSTD(6)),
    vout_count UInt16 CODEC(T64, ZSTD(6)),
    is_coinbase UInt8 CODEC(T64, ZSTD(6)),
    total_out_sat UInt64 CODEC(T64, ZSTD(6)),
    input_total_sat UInt64 CODEC(T64, ZSTD(6)),
    fee_sat Int64 CODEC(T64, ZSTD(6)),
    fee_rate_sat_vbyte Float32 CODEC(Gorilla, ZSTD(6)),
    is_change_heavy UInt8 CODEC(T64, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.outputs_v2 (
    txid String CODEC(ZSTD(6)),
    output_index UInt16 CODEC(T64, ZSTD(6)),
    value_sat UInt64 CODEC(T64, ZSTD(6)),
    script_pubkey_hex String CODEC(ZSTD(6)),
    script_type LowCardinality(String),
    address String CODEC(ZSTD(6)),
    spent UInt8 CODEC(T64, ZSTD(6)),
    spending_txid String CODEC(ZSTD(6)),
    spent_height UInt32 CODEC(Delta(4), ZSTD(6)),
    spent_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid, output_index)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.inputs_v2 (
    txid String CODEC(ZSTD(6)),
    input_index UInt16 CODEC(T64, ZSTD(6)),
    prev_txid String CODEC(ZSTD(6)),
    prev_output_index UInt32 CODEC(T64, ZSTD(6)),
    value_sat UInt64 CODEC(T64, ZSTD(6)),
    script_sig_hex String CODEC(ZSTD(6)),
    sequence UInt32 CODEC(T64, ZSTD(6)),
    coinbase_data String CODEC(ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid, input_index)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.addresses_v2 (
    address String CODEC(ZSTD(6)),
    bucket LowCardinality(String),
    first_seen_block UInt32 CODEC(Delta(4), ZSTD(6)),
    first_seen_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    last_seen_block UInt32 CODEC(Delta(4), ZSTD(6)),
    last_seen_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    total_received_sat UInt64 CODEC(T64, ZSTD(6)),
    total_sent_sat UInt64 CODEC(T64, ZSTD(6)),
    balance_sat Int64 CODEC(T64, ZSTD(6)),
    tx_count UInt32 CODEC(Delta(4), ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY address
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.price_ohlc_hourly (
    source LowCardinality(String),
    symbol LowCardinality(String),
    ts DateTime CODEC(DoubleDelta, ZSTD(9)),
    open Float64 CODEC(Gorilla, ZSTD(9)),
    high Float64 CODEC(Gorilla, ZSTD(9)),
    low Float64 CODEC(Gorilla, ZSTD(9)),
    close Float64 CODEC(Gorilla, ZSTD(9)),
    volume Float64 CODEC(Gorilla, ZSTD(9))
) ENGINE = ReplacingMergeTree(ts)
PARTITION BY toYYYYMM(ts)
ORDER BY (source, symbol, ts)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.price_ohlc_daily (
    source LowCardinality(String),
    symbol LowCardinality(String),
    day Date CODEC(ZSTD(9)),
    open Float64 CODEC(Gorilla, ZSTD(9)),
    high Float64 CODEC(Gorilla, ZSTD(9)),
    low Float64 CODEC(Gorilla, ZSTD(9)),
    close Float64 CODEC(Gorilla, ZSTD(9)),
    volume Float64 CODEC(Gorilla, ZSTD(9)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(9))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day)
ORDER BY (source, symbol, day)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;
