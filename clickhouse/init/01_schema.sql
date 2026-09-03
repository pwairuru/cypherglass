CREATE DATABASE IF NOT EXISTS bitcoin;

CREATE TABLE IF NOT EXISTS bitcoin.blocks (
    height UInt32 CODEC(Delta, ZSTD(3)),
    hash String CODEC(ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3)),
    size UInt32 CODEC(Delta, ZSTD(3)),
    weight UInt32 CODEC(Delta, ZSTD(3)),
    version UInt32 CODEC(T64, ZSTD(3)),
    bits UInt32 CODEC(T64, ZSTD(3)),
    nonce UInt32 CODEC(T64, ZSTD(3)),
    merkle_root String CODEC(ZSTD(3)),
    prev_hash String CODEC(ZSTD(3)),
    tx_count UInt16 CODEC(T64, ZSTD(3)),
    difficulty Float64 CODEC(ZSTD(3)),
    chainwork String CODEC(ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY height
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.transactions (
    txid String CODEC(ZSTD(3)),
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    block_hash String CODEC(ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3)),
    version UInt32 CODEC(T64, ZSTD(3)),
    locktime UInt32 CODEC(T64, ZSTD(3)),
    size UInt32 CODEC(Delta, ZSTD(3)),
    weight UInt32 CODEC(Delta, ZSTD(3)),
    vin_count UInt16 CODEC(T64, ZSTD(3)),
    vout_count UInt16 CODEC(T64, ZSTD(3)),
    is_coinbase UInt8 CODEC(T64, ZSTD(3)),
    total_out_sat UInt64 CODEC(T64, ZSTD(3)),
    fee_sat Int64 CODEC(T64, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (block_height, txid)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.outputs (
    txid String CODEC(ZSTD(3)),
    output_index UInt16 CODEC(T64, ZSTD(3)),
    value_sat UInt64 CODEC(T64, ZSTD(3)),
    script_pubkey_hex String CODEC(ZSTD(3)),
    script_type LowCardinality(String),
    address String CODEC(ZSTD(3)),
    spent UInt8,
    spending_txid String,
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (txid, output_index)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.inputs (
    txid String CODEC(ZSTD(3)),
    input_index UInt16 CODEC(T64, ZSTD(3)),
    prev_txid String CODEC(ZSTD(3)),
    prev_output_index UInt32 CODEC(T64, ZSTD(3)),
    script_sig_hex String CODEC(ZSTD(3)),
    sequence UInt32 CODEC(T64, ZSTD(3)),
    coinbase_data String CODEC(ZSTD(3)),
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (txid, input_index)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.addresses (
    address String CODEC(ZSTD(3)),
    first_seen_block UInt32 CODEC(Delta, ZSTD(3)),
    first_seen_time DateTime CODEC(DoubleDelta, ZSTD(3)),
    last_seen_block UInt32 CODEC(Delta, ZSTD(3)),
    last_seen_time DateTime CODEC(DoubleDelta, ZSTD(3)),
    total_received_sat UInt64 CODEC(T64, ZSTD(3)),
    total_sent_sat UInt64 CODEC(T64, ZSTD(3)),
    balance_sat Int64 CODEC(T64, ZSTD(3)),
    tx_count UInt32 CODEC(Delta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY address
SETTINGS storage_policy = 's3_main';
