-- One-time backfill: v1 base tables -> v2 (MV sources).
-- Run manually ONCE: cat 01_v1_to_v2.sql | clickhouse-client --multiquery
-- (NOT in init/: fresh installs get v2 rows from decoder v2 cutover.)
-- Mirrors decoder/internal/clickhouse/client_v2.go derivations:
--   reward = SubsidyAt(height) = 5e9 >> (height DIV 210000)
--   fee_total = max(coinbase_out - reward, 0); interval default 600s
--   fee_rate = fee/size (0 when size 0); is_change_heavy = 0 (no metric reads it)
-- Idempotent: v2 tables are ReplacingMergeTree; DELETEs below clear the 3
-- synthetic 2024 test rows (heights 0-2) first so they cannot double-count.

ALTER TABLE bitcoin.blocks_v2 DELETE WHERE timestamp >= '2024-01-01';
ALTER TABLE bitcoin.transactions_v2 DELETE WHERE timestamp >= '2024-01-01';
ALTER TABLE bitcoin.mv_blocks_hourly DELETE WHERE hour >= '2024-01-01';
ALTER TABLE bitcoin.mv_blocks_daily DELETE WHERE day >= '2024-01-01';
ALTER TABLE bitcoin.mv_tx_fee_hourly DELETE WHERE hour >= '2024-01-01';
ALTER TABLE bitcoin.mv_tx_fee_daily DELETE WHERE day >= '2024-01-01';
ALTER TABLE bitcoin.mv_flow_hourly DELETE WHERE hour >= '2024-01-01';
ALTER TABLE bitcoin.mv_flow_daily DELETE WHERE day >= '2024-01-01';

INSERT INTO bitcoin.blocks_v2
SELECT
    b.height, b.hash, b.timestamp, b.size, b.weight, b.version, b.bits,
    b.nonce, b.merkle_root, b.prev_hash, b.tx_count, b.difficulty, b.chainwork,
    bitShiftRight(toUInt64(5000000000), b.height DIV 210000) AS reward_sat,
    toUInt64(greatest(coalesce(cb.coinbase_out, 0) - toInt64(bitShiftRight(toUInt64(5000000000), b.height DIV 210000)), 0)) AS fee_total_sat,
    ifNull(toInt32(dateDiff('second', p.timestamp, b.timestamp)), 600) AS interval_sec,
    -- NOTE: CH fills missing-join DateTime with epoch (not NULL), so genesis
    -- gets ts-epoch; fix post-load: ALTER TABLE blocks_v2 UPDATE
    -- interval_sec = 600 WHERE height = 0 (chain heights contiguous otherwise).
    now() AS updated_at
FROM bitcoin.blocks AS b
LEFT JOIN bitcoin.blocks AS p ON p.height = b.height - 1
LEFT JOIN (
    SELECT block_height, sum(total_out_sat) AS coinbase_out
    FROM bitcoin.transactions WHERE is_coinbase = 1 GROUP BY block_height
) AS cb ON cb.block_height = b.height;

INSERT INTO bitcoin.transactions_v2
SELECT
    txid, block_height, block_hash, timestamp, version, locktime, size, weight,
    vin_count, vout_count, is_coinbase, total_out_sat,
    if(is_coinbase = 1, 0, toUInt64(total_out_sat + fee_sat)) AS input_total_sat,
    fee_sat,
    if(size = 0, 0, toFloat32(fee_sat) / size) AS fee_rate_sat_vbyte,
    0 AS is_change_heavy,
    now() AS updated_at
FROM bitcoin.transactions;

INSERT INTO bitcoin.outputs_v2
SELECT
    o.txid, o.output_index, o.value_sat, o.script_pubkey_hex, o.script_type,
    o.address, o.spent, o.spending_txid,
    coalesce(sp.height, 0) AS spent_height,
    coalesce(sp.ts, toDateTime('1970-01-01 00:00:00')) AS spent_time,
    o.block_height, o.timestamp, now() AS updated_at
FROM bitcoin.outputs AS o
LEFT JOIN (
    SELECT t.txid AS txid, t.block_height AS height, t.timestamp AS ts
    FROM bitcoin.transactions AS t
) AS sp ON sp.txid = o.spending_txid AND o.spending_txid != '';

INSERT INTO bitcoin.inputs_v2
SELECT
    i.txid, i.input_index, i.prev_txid, i.prev_output_index,
    coalesce(o.value_sat, 0) AS value_sat,
    i.script_sig_hex, i.sequence, i.coinbase_data,
    t.block_height, t.timestamp, now() AS updated_at
FROM bitcoin.inputs AS i
JOIN bitcoin.transactions AS t ON t.txid = i.txid
LEFT JOIN bitcoin.outputs AS o
    ON o.txid = i.prev_txid AND o.output_index = i.prev_output_index;
