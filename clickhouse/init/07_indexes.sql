-- 07_indexes.sql: additive bloom/skip indexes for explorer point lookups.
-- Safe to apply on fresh volumes; on existing volumes run manually
-- (docker-entrypoint-initdb.d only runs once).
-- v2 tables order by timestamp; these indexes accelerate hash/txid/address.

ALTER TABLE bitcoin.blocks_v2 ADD INDEX IF NOT EXISTS idx_blocks_hash (hash) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE bitcoin.transactions_v2 ADD INDEX IF NOT EXISTS idx_tx_txid (txid) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE bitcoin.transactions_v2 ADD INDEX IF NOT EXISTS idx_tx_block (block_height) TYPE minmax GRANULARITY 1;
ALTER TABLE bitcoin.outputs_v2 ADD INDEX IF NOT EXISTS idx_out_txid (txid) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE bitcoin.outputs_v2 ADD INDEX IF NOT EXISTS idx_out_addr (address) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE bitcoin.inputs_v2 ADD INDEX IF NOT EXISTS idx_in_prev (prev_txid) TYPE bloom_filter(0.01) GRANULARITY 1;
