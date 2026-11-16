//! ClickHouse row builders + batched flush (Task 5).
//!
//! Mirrors Go `decoder/internal/clickhouse/client.go` (v1 tables) and
//! `client_v2.go` (v2 tables) field-for-field: every row struct declares its
//! fields in the exact order of the corresponding Go `batch.Append(...)`
//! call, and [`build_batch`] applies the same derivations (`reward_sat` from
//! coinbase economics, `fee_total_sat` clamped at 0, 600 s default interval,
//! UTXO-miss input values written as 0, `spent_time` epoch, `updated_at` now
//! UTC). [`ClickHouseWriter::flush`] inserts the 8 tables sequentially in
//! syncer order (`syncer.go` `insertBlock`: v1 blocks, transactions, outputs,
//! inputs, then v2 blocks, transactions, inputs, outputs) and aborts on the
//! first failure so the caller never checkpoints past a partial flush. The
//! production writer issues every batch with `wait_for_async_insert=1`
//! ([`WAIT_FOR_ASYNC_INSERT`]); Go used fire-and-forget `0`.
//!
//! Call contract (Task 6 syncer consumes this; replay-safety pinned by
//! `failed_flush_retry_is_identical`):
//!
//! 1. `build_batch(block, utxo, prev_time, now)` — PURE READ-ONLY. Only
//!    `UtxoStore::get`; never `put`/`delete`. Safe to call any number of
//!    times, before or after failed flushes, with identical results.
//! 2. `writer.flush(&batch)` — on `Err`, retry step 1–2 freely (the store is
//!    untouched) and do NOT checkpoint.
//! 3. Only after `flush` returns `Ok`: `apply_utxo(block, utxo)` — index the
//!    block's outputs, then delete spent entries. Only then checkpoint.
//!
//! Same-block spends resolve without mutation: resolution consults an
//! in-memory overlay of the block's own outputs first (Go `syncer.go` pass 1
//! makes those visible by pre-indexing; the overlay yields identical values,
//! including Go's overwrite-wins precedence on duplicate keys).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use clickhouse::Row;
use serde::Serialize;

use crate::enrich::{change_heavy, fee_rate, subsidy_at};
use crate::parser::ParsedBlock;
use crate::utxo::UtxoStore;

/// V2 column counts mirror `clickhouse/init/03_schema_v2.sql`; guards against
/// silent schema/drift mismatches in batch appends (Go `columns.go` parity).
pub const BLOCKS_V2_COLS: usize = 17;
pub const TXS_V2_COLS: usize = 17;
pub const OUTPUTS_V2_COLS: usize = 13;
pub const INPUTS_V2_COLS: usize = 11;

/// V1 column counts mirror `clickhouse/init/01_schema.sql`.
pub const BLOCKS_COLS: usize = 13;
pub const TXS_COLS: usize = 13;
pub const OUTPUTS_COLS: usize = 10;
pub const INPUTS_COLS: usize = 9;

/// Async-insert durability flag the production writer attaches to every
/// batch (`wait_for_async_insert=1`).
pub const WAIT_FOR_ASYNC_INSERT: u8 = 1;

/// Flush order = syncer `insertBlock` order. `FakeWriter::failing_at` indexes
/// into this sequence (1-based).
pub const TABLE_ORDER: [&str; 8] = [
    "blocks",
    "transactions",
    "outputs",
    "inputs",
    "blocks_v2",
    "transactions_v2",
    "inputs_v2",
    "outputs_v2",
];

// ---------------------------------------------------------------------------
// Row structs (field order == Go Append order)
// ---------------------------------------------------------------------------

/// One `blocks` (v1) row: 13 cols (`client.go` `InsertBlock`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct BlockRow {
    pub height: u32,
    pub hash: String,
    pub timestamp: u32,
    pub size: u32,
    pub weight: u32,
    pub version: u32,
    pub bits: u32,
    pub nonce: u32,
    pub merkle_root: String,
    pub prev_hash: String,
    pub tx_count: u16,
    pub difficulty: f64,
    pub chainwork: String,
}

/// One `transactions` (v1) row: 13 cols (`client.go` `InsertTransactions`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct TxRow {
    pub txid: String,
    pub block_height: u32,
    pub block_hash: String,
    pub timestamp: u32,
    pub version: u32,
    pub locktime: u32,
    pub size: u32,
    pub weight: u32,
    pub vin_count: u16,
    pub vout_count: u16,
    pub is_coinbase: u8,
    pub total_out_sat: u64,
    pub fee_sat: i64,
}

/// One `outputs` (v1) row: 10 cols (`client.go` `InsertOutputs`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct OutputRow {
    pub txid: String,
    pub output_index: u16,
    pub value_sat: u64,
    pub script_pubkey_hex: String,
    pub script_type: String,
    pub address: String,
    pub spent: u8,
    pub spending_txid: String,
    pub block_height: u32,
    pub timestamp: u32,
}

/// One `inputs` (v1) row: 9 cols (`client.go` `InsertInputs`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct InputRow {
    pub txid: String,
    pub input_index: u16,
    pub prev_txid: String,
    pub prev_output_index: u32,
    pub script_sig_hex: String,
    pub sequence: u32,
    pub coinbase_data: String,
    pub block_height: u32,
    pub timestamp: u32,
}

/// One `blocks_v2` row: 17 cols (`client_v2.go` `InsertBlockV2`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct BlockRowV2 {
    pub height: u32,
    pub hash: String,
    pub timestamp: u32,
    pub size: u32,
    pub weight: u32,
    pub version: u32,
    pub bits: u32,
    pub nonce: u32,
    pub merkle_root: String,
    pub prev_hash: String,
    pub tx_count: u16,
    pub difficulty: f64,
    pub chainwork: String,
    pub reward_sat: u64,
    pub fee_total_sat: u64,
    pub interval_sec: i32,
    pub updated_at: u32,
}

/// One `transactions_v2` row: 17 cols (`client_v2.go` `InsertTransactionsV2`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct TxRowV2 {
    pub txid: String,
    pub block_height: u32,
    pub block_hash: String,
    pub timestamp: u32,
    pub version: u32,
    pub locktime: u32,
    pub size: u32,
    pub weight: u32,
    pub vin_count: u16,
    pub vout_count: u16,
    pub is_coinbase: u8,
    pub total_out_sat: u64,
    pub input_total_sat: u64,
    pub fee_sat: i64,
    pub fee_rate_sat_vbyte: f32,
    pub is_change_heavy: u8,
    pub updated_at: u32,
}

/// One `outputs_v2` row: 13 cols (`client_v2.go` `InsertOutputsV2`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct OutputRowV2 {
    pub txid: String,
    pub output_index: u16,
    pub value_sat: u64,
    pub script_pubkey_hex: String,
    pub script_type: String,
    pub address: String,
    pub spent: u8,
    pub spending_txid: String,
    pub spent_height: u32,
    pub spent_time: u32,
    pub block_height: u32,
    pub timestamp: u32,
    pub updated_at: u32,
}

/// One `inputs_v2` row: 11 cols (`client_v2.go` `InsertInputsV2`).
#[derive(Debug, Clone, PartialEq, Serialize, Row)]
pub struct InputRowV2 {
    pub txid: String,
    pub input_index: u16,
    pub prev_txid: String,
    pub prev_output_index: u32,
    pub value_sat: u64,
    pub script_sig_hex: String,
    pub sequence: u32,
    pub coinbase_data: String,
    pub block_height: u32,
    pub timestamp: u32,
    pub updated_at: u32,
}

// ---------------------------------------------------------------------------
// Batch + stats
// ---------------------------------------------------------------------------

/// All 8 table payloads for one block, plus the UTXO-miss count accumulated
/// while resolving `inputs_v2` values (misses write 0, Go parity).
#[derive(Debug, Default)]
pub struct BlockBatch {
    pub blocks: Vec<BlockRow>,
    pub transactions: Vec<TxRow>,
    pub outputs: Vec<OutputRow>,
    pub inputs: Vec<InputRow>,
    pub blocks_v2: Vec<BlockRowV2>,
    pub transactions_v2: Vec<TxRowV2>,
    pub inputs_v2: Vec<InputRowV2>,
    pub outputs_v2: Vec<OutputRowV2>,
    pub utxo_misses: u64,
}

/// Flush outcome returned to the pipeline; the caller checkpoints only on
/// `Ok`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FlushStats {
    pub blocks: usize,
    pub transactions: usize,
    pub outputs: usize,
    pub inputs: usize,
    pub utxo_misses: u64,
}

/// Current UTC time as unix seconds, for `updated_at` columns.
pub fn now_utc_secs() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or(0)
}

/// Build all 8 table payloads for `block`. PURE READ-ONLY against `utxo`
/// (only `get`, never `put`/`delete`): a failed [`ClickHouseWriter::flush`]
/// leaves the store untouched, so the caller can rebuild/retry and derive
/// byte-identical fees and miss counts.
///
/// Same-block spends resolve via an in-memory overlay of the block's own
/// outputs (checked before the store), mirroring Go `syncer.go` pass 1
/// pre-indexing with identical values — including overwrite-wins precedence
/// on duplicate keys and the `value_sat >= 0` guard. `prev_time` is the
/// previous block's timestamp (`None` for genesis/unknown → 600 s default
/// interval, Go parity).
///
/// Caller contract: build → flush → only on `Ok`, [`apply_utxo`].
pub fn build_batch(
    block: &ParsedBlock,
    utxo: &UtxoStore,
    prev_time: Option<u32>,
    now_unix: u32,
) -> Result<BlockBatch> {
    // In-block overlay: (txid, vout) -> value, Go pass-1 parity.
    let mut own: HashMap<(&str, u32), u64> = HashMap::new();
    for tx in &block.txs {
        for out in &tx.outputs {
            if out.value_sat >= 0 {
                own.insert((tx.hash.as_str(), out.index), out.value_sat as u64);
            }
        }
    }

    // Resolve input values once; shared by v2 tx and input rows (Go resolves
    // in each insert separately against the same map state — same result).
    let mut input_values: Vec<Vec<u64>> = Vec::with_capacity(block.txs.len());
    let mut misses: u64 = 0;
    for tx in &block.txs {
        let mut vals = Vec::with_capacity(tx.inputs.len());
        for inp in &tx.inputs {
            if tx.is_coinbase {
                vals.push(0);
                continue;
            }
            if let Some(&v) = own.get(&(inp.prev_txid.as_str(), inp.prev_index)) {
                vals.push(v);
                continue;
            }
            match utxo.get(&inp.prev_txid, inp.prev_index)? {
                Some(v) => vals.push(v),
                None => {
                    // Miss: value 0, counted (Go logs the count per block).
                    misses += 1;
                    vals.push(0);
                }
            }
        }
        input_values.push(vals);
    }

    let mut batch = BlockBatch {
        utxo_misses: misses,
        ..BlockBatch::default()
    };

    // V1 + V2 block rows.
    let mut coinbase_out: i64 = 0;
    for tx in &block.txs {
        if tx.is_coinbase {
            coinbase_out = coinbase_out.saturating_add(tx.total_out_sat);
        }
    }
    let reward = subsidy_at(block.height);
    let fee_total = (coinbase_out - reward as i64).max(0) as u64;
    let interval = prev_time
        .map(|p| (block.timestamp as i64 - p as i64) as i32)
        .unwrap_or(600);

    batch.blocks.push(BlockRow {
        height: block.height,
        hash: block.hash.clone(),
        timestamp: block.timestamp,
        // Verified zero-by-construction: Go `client.go InsertBlock` Appends
        // literal `uint32(0), uint32(0)` for size/weight (same for v1 txs
        // below), so plumbing parser values here would DIVERGE from Go.
        size: 0,
        weight: 0,
        version: block.version as u32,
        bits: block.bits,
        nonce: block.nonce,
        merkle_root: block.merkle_root.clone(),
        prev_hash: block.prev_hash.clone(),
        tx_count: block.txs.len() as u16,
        difficulty: 0.0, // backfilled from RPC headers (Go parity)
        chainwork: String::new(),
    });
    batch.blocks_v2.push(BlockRowV2 {
        height: block.height,
        hash: block.hash.clone(),
        timestamp: block.timestamp,
        // Verified zero-by-construction: Go `client_v2.go InsertBlockV2`
        // Appends `uint32(0), // size: not tracked by parser yet` and the
        // same for weight. Only v2 TRANSACTIONS carry real values
        // (`tx.SizeVBytes, tx.WeightUnits`, plumbed below), exactly as here.
        size: 0,
        weight: 0,
        version: block.version as u32,
        bits: block.bits,
        nonce: block.nonce,
        merkle_root: block.merkle_root.clone(),
        prev_hash: block.prev_hash.clone(),
        tx_count: block.txs.len() as u16,
        difficulty: 0.0,
        chainwork: String::new(),
        reward_sat: reward,
        fee_total_sat: fee_total,
        interval_sec: interval,
        updated_at: now_unix,
    });

    // Tx / output / input rows.
    for (tx, vals) in block.txs.iter().zip(input_values.iter()) {
        let input_total: u64 = vals.iter().fold(0u64, |a, &v| a.saturating_add(v));
        let total_out = tx.total_out_sat.max(0) as u64;
        // Go v1: fee = 0 - TotalOutSat for non-coinbase (wrapping_neg: never
        // panic, Globally matches Go silent wrap on absurd input).
        let fee_v1: i64 = if tx.is_coinbase {
            0
        } else {
            0i64.wrapping_sub(tx.total_out_sat)
        };
        // Go v2: fee = int64(inputTotal) - TotalOutSat. Saturating (no u64
        // wrap, no panic): misses just shrink the fee, possibly negative.
        let fee_v2: i64 = if tx.is_coinbase {
            0
        } else {
            i64::try_from(input_total)
                .unwrap_or(i64::MAX)
                .saturating_sub(tx.total_out_sat)
        };
        let addrs: Vec<String> = tx.outputs.iter().map(|o| o.address.clone()).collect();

        batch.transactions.push(TxRow {
            txid: tx.hash.clone(),
            block_height: block.height,
            block_hash: block.hash.clone(),
            timestamp: block.timestamp,
            version: tx.version as u32,
            locktime: tx.lock_time,
            // Verified zero-by-construction: Go `client.go InsertTransactions`
            // Appends literal `uint32(0), uint32(0)` for v1 size/weight.
            // (v2 transactions below carry the real parser vsize/weight,
            // matching Go `client_v2.go`.)
            size: 0,
            weight: 0,
            vin_count: tx.vin_count,
            vout_count: tx.vout_count,
            is_coinbase: u8::from(tx.is_coinbase),
            total_out_sat: total_out,
            fee_sat: fee_v1,
        });
        batch.transactions_v2.push(TxRowV2 {
            txid: tx.hash.clone(),
            block_height: block.height,
            block_hash: block.hash.clone(),
            timestamp: block.timestamp,
            version: tx.version as u32,
            locktime: tx.lock_time,
            size: tx.size_vbytes,
            weight: tx.weight_units,
            vin_count: tx.vin_count,
            vout_count: tx.vout_count,
            is_coinbase: u8::from(tx.is_coinbase),
            total_out_sat: total_out,
            input_total_sat: input_total,
            fee_sat: fee_v2,
            fee_rate_sat_vbyte: fee_rate(fee_v2, tx.size_vbytes),
            is_change_heavy: change_heavy(&addrs),
            updated_at: now_unix,
        });

        for out in &tx.outputs {
            batch.outputs.push(OutputRow {
                txid: tx.hash.clone(),
                output_index: out.index as u16,
                value_sat: out.value_sat.max(0) as u64,
                script_pubkey_hex: out.script_hex.clone(),
                script_type: out.script_type.clone(),
                address: out.address.clone(),
                spent: 0,
                spending_txid: String::new(),
                block_height: block.height,
                timestamp: block.timestamp,
            });
            batch.outputs_v2.push(OutputRowV2 {
                txid: tx.hash.clone(),
                output_index: out.index as u16,
                value_sat: out.value_sat.max(0) as u64,
                script_pubkey_hex: out.script_hex.clone(),
                script_type: out.script_type.clone(),
                address: out.address.clone(),
                spent: 0,
                spending_txid: String::new(),
                spent_height: 0,
                spent_time: 0, // epoch = unset (Go `time.Unix(0,0).UTC()` parity)
                block_height: block.height,
                timestamp: block.timestamp,
                updated_at: now_unix,
            });
        }

        for (inp, &value) in tx.inputs.iter().zip(vals.iter()) {
            batch.inputs.push(InputRow {
                txid: tx.hash.clone(),
                input_index: inp.index as u16,
                prev_txid: inp.prev_txid.clone(),
                prev_output_index: inp.prev_index,
                script_sig_hex: inp.script_sig_hex.clone(),
                sequence: inp.sequence,
                coinbase_data: inp.coinbase_data.clone(),
                block_height: block.height,
                timestamp: block.timestamp,
            });
            batch.inputs_v2.push(InputRowV2 {
                txid: tx.hash.clone(),
                input_index: inp.index as u16,
                prev_txid: inp.prev_txid.clone(),
                prev_output_index: inp.prev_index,
                value_sat: value,
                script_sig_hex: inp.script_sig_hex.clone(),
                sequence: inp.sequence,
                coinbase_data: inp.coinbase_data.clone(),
                block_height: block.height,
                timestamp: block.timestamp,
                updated_at: now_unix,
            });
        }
    }

    Ok(batch)
}

/// UTXO mutations for one batch: `(txid, vout, value)` puts (pass 1) and
/// `(txid, vout)` deletes (pass 2).
pub type UtxoPuts = Vec<(String, u32, u64)>;
pub type UtxoDeletes = Vec<(String, u32)>;

/// Collect a block's UTXO mutations without touching the store: all outputs
/// with `value_sat >= 0` as puts (Go `insertBlock` pass 1), then spent
/// entries as deletes (pass 2). Pure function so the syncer can merge ops
/// across a whole batch into ONE write transaction.
pub fn collect_utxo_ops(block: &ParsedBlock) -> (UtxoPuts, UtxoDeletes) {
    let mut puts = Vec::new();
    let mut deletes = Vec::new();
    for tx in &block.txs {
        for out in &tx.outputs {
            if out.value_sat >= 0 {
                puts.push((tx.hash.clone(), out.index, out.value_sat as u64));
            }
        }
    }
    for tx in &block.txs {
        if tx.is_coinbase {
            continue;
        }
        for inp in &tx.inputs {
            deletes.push((inp.prev_txid.clone(), inp.prev_index));
        }
    }
    (puts, deletes)
}

/// Advance the UTXO set after a successful flush. Mirrors Go `syncer.go`
/// `insertBlock`: index ALL of the block's outputs first (Go:
/// `if out.ValueSat >= 0`), then delete spent entries (no-op for missing
/// keys). Single write transaction via [`UtxoStore::batch_write`].
///
/// MUST be called only after [`ClickHouseWriter::flush`] returns `Ok`
/// (then checkpoint). Never before/during build: [`build_batch`] is
/// read-only precisely so a failed flush leaves the store untouched and a
/// retry derives identical values.
pub fn apply_utxo(block: &ParsedBlock, utxo: &UtxoStore) -> Result<()> {
    let (puts, deletes) = collect_utxo_ops(block);
    utxo.batch_write(&puts, &deletes)
}

// ---------------------------------------------------------------------------
// Writer trait + batched flush
// ---------------------------------------------------------------------------

/// One method per table, in flush/syncer order. The production backend
/// issues each batch with `wait_for_async_insert=1`.
pub trait DbWriter {
    fn insert_blocks(&self, rows: &[BlockRow]) -> Result<()>;
    fn insert_transactions(&self, rows: &[TxRow]) -> Result<()>;
    fn insert_outputs(&self, rows: &[OutputRow]) -> Result<()>;
    fn insert_inputs(&self, rows: &[InputRow]) -> Result<()>;
    fn insert_blocks_v2(&self, rows: &[BlockRowV2]) -> Result<()>;
    fn insert_transactions_v2(&self, rows: &[TxRowV2]) -> Result<()>;
    fn insert_inputs_v2(&self, rows: &[InputRowV2]) -> Result<()>;
    fn insert_outputs_v2(&self, rows: &[OutputRowV2]) -> Result<()>;
}

/// Batched flush over any [`DbWriter`] backend.
pub struct ClickHouseWriter<W: DbWriter> {
    pub inner: W,
}

impl<W: DbWriter> ClickHouseWriter<W> {
    pub fn new(inner: W) -> Self {
        Self { inner }
    }

    /// Insert all 8 tables sequentially; abort on the first failure so the
    /// caller must NOT checkpoint past a partial flush.
    pub fn flush(&self, batch: &BlockBatch) -> Result<FlushStats> {
        self.inner
            .insert_blocks(&batch.blocks)
            .context("insert blocks")?;
        self.inner
            .insert_transactions(&batch.transactions)
            .context("insert transactions")?;
        self.inner
            .insert_outputs(&batch.outputs)
            .context("insert outputs")?;
        self.inner
            .insert_inputs(&batch.inputs)
            .context("insert inputs")?;
        self.inner
            .insert_blocks_v2(&batch.blocks_v2)
            .context("insert blocks_v2")?;
        self.inner
            .insert_transactions_v2(&batch.transactions_v2)
            .context("insert transactions_v2")?;
        self.inner
            .insert_inputs_v2(&batch.inputs_v2)
            .context("insert inputs_v2")?;
        self.inner
            .insert_outputs_v2(&batch.outputs_v2)
            .context("insert outputs_v2")?;
        Ok(FlushStats {
            blocks: batch.blocks.len() + batch.blocks_v2.len(),
            transactions: batch.transactions.len() + batch.transactions_v2.len(),
            outputs: batch.outputs.len() + batch.outputs_v2.len(),
            inputs: batch.inputs.len() + batch.inputs_v2.len(),
            utxo_misses: batch.utxo_misses,
        })
    }
}

// ---------------------------------------------------------------------------
// Fake writer (tests; no live ClickHouse)
// ---------------------------------------------------------------------------

/// In-memory [`DbWriter`]: records per-table calls in order, with an
/// injectable failure at table sequence N (1-based into [`TABLE_ORDER`).
pub struct FakeWriter {
    fail_at: Option<usize>,
    calls: Mutex<Vec<String>>,
    row_counts: Mutex<Vec<usize>>,
}

impl FakeWriter {
    pub fn new() -> Self {
        Self {
            fail_at: None,
            calls: Mutex::new(Vec::new()),
            row_counts: Mutex::new(Vec::new()),
        }
    }

    pub fn failing_at(table_seq: usize) -> Self {
        Self {
            fail_at: Some(table_seq),
            calls: Mutex::new(Vec::new()),
            row_counts: Mutex::new(Vec::new()),
        }
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    pub fn row_counts(&self) -> Vec<usize> {
        self.row_counts.lock().unwrap().clone()
    }

    fn record(&self, table: &'static str, n: usize) -> Result<()> {
        let mut calls = self.calls.lock().unwrap();
        calls.push(table.to_string());
        self.row_counts.lock().unwrap().push(n);
        if self.fail_at == Some(calls.len()) {
            anyhow::bail!("fake failure at table {table}");
        }
        Ok(())
    }
}

impl Default for FakeWriter {
    fn default() -> Self {
        Self::new()
    }
}

impl DbWriter for FakeWriter {
    fn insert_blocks(&self, rows: &[BlockRow]) -> Result<()> {
        self.record("blocks", rows.len())
    }
    fn insert_transactions(&self, rows: &[TxRow]) -> Result<()> {
        self.record("transactions", rows.len())
    }
    fn insert_outputs(&self, rows: &[OutputRow]) -> Result<()> {
        self.record("outputs", rows.len())
    }
    fn insert_inputs(&self, rows: &[InputRow]) -> Result<()> {
        self.record("inputs", rows.len())
    }
    fn insert_blocks_v2(&self, rows: &[BlockRowV2]) -> Result<()> {
        self.record("blocks_v2", rows.len())
    }
    fn insert_transactions_v2(&self, rows: &[TxRowV2]) -> Result<()> {
        self.record("transactions_v2", rows.len())
    }
    fn insert_inputs_v2(&self, rows: &[InputRowV2]) -> Result<()> {
        self.record("inputs_v2", rows.len())
    }
    fn insert_outputs_v2(&self, rows: &[OutputRowV2]) -> Result<()> {
        self.record("outputs_v2", rows.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_block;
    use bitcoin::absolute::LockTime;
    use bitcoin::block::{Block, Header, Version};
    use bitcoin::consensus::serialize;
    use bitcoin::hashes::Hash as _;
    use bitcoin::{
        Amount, BlockHash, CompactTarget, OutPoint, ScriptBuf, Sequence, Transaction, TxIn,
        TxMerkleNode, TxOut, Witness,
    };

    const HEIGHT: u32 = 840_000;
    const TIME: u32 = 1_700_000_000;
    const NOW: u32 = 1_700_000_001;

    fn p2pkh_script(fill: u8) -> ScriptBuf {
        let mut v = vec![0x76, 0xa9, 0x14];
        v.extend_from_slice(&[fill; 20]);
        v.extend_from_slice(&[0x88, 0xac]);
        ScriptBuf::from_bytes(v)
    }

    fn fixture_block() -> Block {
        let mut cb_script = HEIGHT.to_le_bytes().to_vec();
        cb_script.extend_from_slice(b"cb");
        let coinbase = Transaction {
            version: bitcoin::transaction::Version::ONE,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::null(),
                script_sig: ScriptBuf::from_bytes(cb_script),
                sequence: Sequence::MAX,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(312_501_000),
                script_pubkey: p2pkh_script(0x11),
            }],
        };
        let spend = Transaction {
            version: bitcoin::transaction::Version::ONE,
            lock_time: LockTime::ZERO,
            input: vec![
                TxIn {
                    previous_output: OutPoint {
                        txid: "11".repeat(32).parse().unwrap(),
                        vout: 0,
                    },
                    script_sig: ScriptBuf::from_bytes(b"sig1".to_vec()),
                    sequence: Sequence::MAX,
                    witness: Witness::new(),
                },
                TxIn {
                    previous_output: OutPoint {
                        txid: "22".repeat(32).parse().unwrap(),
                        vout: 1,
                    },
                    script_sig: ScriptBuf::from_bytes(b"sig2".to_vec()),
                    sequence: Sequence::MAX,
                    witness: Witness::new(),
                },
            ],
            output: vec![TxOut {
                value: Amount::from_sat(7_000),
                script_pubkey: p2pkh_script(0x22),
            }],
        };
        Block {
            header: Header {
                version: Version::from_consensus(1),
                prev_blockhash: BlockHash::from_byte_array([0u8; 32]),
                merkle_root: TxMerkleNode::from_byte_array([0u8; 32]),
                time: TIME,
                bits: CompactTarget::from_consensus(0x1d00ffff),
                nonce: 7,
            },
            txdata: vec![coinbase, spend],
        }
    }

    fn parsed_fixture() -> ParsedBlock {
        let raw = serialize(&fixture_block());
        parse_block(&raw).unwrap()
    }

    fn mem_utxo() -> (tempfile::TempDir, UtxoStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
        (dir, store)
    }

    #[test]
    fn v2_column_counts() {
        assert_eq!(BLOCKS_V2_COLS, 17);
        assert_eq!(TXS_V2_COLS, 17);
        assert_eq!(OUTPUTS_V2_COLS, 13);
        assert_eq!(INPUTS_V2_COLS, 11);
    }

    #[test]
    fn v1_column_counts_and_settings() {
        assert_eq!(BLOCKS_COLS, 13);
        assert_eq!(TXS_COLS, 13);
        assert_eq!(OUTPUTS_COLS, 10);
        assert_eq!(INPUTS_COLS, 9);
        // Production backend attaches this to every batch (Go used 0).
        assert_eq!(WAIT_FOR_ASYNC_INSERT, 1);
        assert!(now_utc_secs() >= TIME, "updated_at clock must be sane");
    }

    #[test]
    fn miss_writes_zero_with_counter() {
        let (_dir, utxo) = mem_utxo();
        // Prefill all but one parent: ("11..":0) present, ("22..":1) missing.
        utxo.put(&"11".repeat(32), 0, 8_000).unwrap();
        let block = parsed_fixture();
        let batch = build_batch(&block, &utxo, None, NOW).unwrap();

        let spend_txid = block.txs[1].hash.clone();
        let mut vals: Vec<u64> = batch
            .inputs_v2
            .iter()
            .filter(|r| r.txid == spend_txid)
            .map(|r| r.value_sat)
            .collect();
        vals.sort_unstable();
        assert_eq!(vals, vec![0, 8_000], "miss must write 0, hit keeps value");
        assert_eq!(batch.utxo_misses, 1);

        let tx = batch
            .transactions_v2
            .iter()
            .find(|r| r.txid == spend_txid)
            .unwrap();
        assert_eq!(tx.input_total_sat, 8_000);
        // Fee stays signed (8000 - 7000); no u64 wrap-around.
        assert_eq!(tx.fee_sat, 1_000);
    }

    #[test]
    fn failed_flush_retry_is_identical() {
        // Replay-safety: build is read-only, so a failed flush leaves the
        // store untouched and a retry derives identical fees/miss counts
        // (the old delete-before-flush shape corrupted retries).
        let (_dir, utxo) = mem_utxo();
        utxo.put(&"11".repeat(32), 0, 8_000).unwrap();
        let block = parsed_fixture();

        let batch1 = build_batch(&block, &utxo, None, NOW).unwrap();
        let bad = ClickHouseWriter::new(FakeWriter::failing_at(5));
        assert!(bad.flush(&batch1).is_err());

        // Store untouched: parent still present, block outputs NOT indexed.
        assert_eq!(utxo.get(&"11".repeat(32), 0).unwrap(), Some(8_000));
        assert_eq!(utxo.get(&block.txs[0].hash, 0).unwrap(), None);
        assert_eq!(utxo.get(&block.txs[1].hash, 0).unwrap(), None);

        // Retry from scratch: identical derivation.
        let batch2 = build_batch(&block, &utxo, None, NOW).unwrap();
        assert_eq!(batch2.utxo_misses, batch1.utxo_misses);
        assert_eq!(batch2.transactions_v2, batch1.transactions_v2);
        assert_eq!(batch2.inputs_v2, batch1.inputs_v2);
        let good = ClickHouseWriter::new(FakeWriter::new());
        let stats = good.flush(&batch2).unwrap();
        assert_eq!(stats.utxo_misses, 1);
        assert_eq!(
            batch2
                .transactions_v2
                .iter()
                .find(|r| r.txid == block.txs[1].hash)
                .unwrap()
                .fee_sat,
            1_000
        );

        // Only now advance the store: parents spent, block outputs indexed.
        apply_utxo(&block, &utxo).unwrap();
        assert_eq!(utxo.get(&"11".repeat(32), 0).unwrap(), None);
        assert_eq!(utxo.get(&block.txs[0].hash, 0).unwrap(), Some(312_501_000));
        assert_eq!(utxo.get(&block.txs[1].hash, 0).unwrap(), Some(7_000));
    }

    #[test]
    fn same_block_spend_resolves_without_mutation() {
        // Child spends the coinbase output of the SAME block: Go pass 1
        // pre-indexing hits it; the in-block overlay must too — with zero
        // store writes (store miss counter stays 0).
        use bitcoin::Txid;
        let mut block = fixture_block();
        let cb_txid: Txid =
            bitcoin::consensus::deserialize(&bitcoin::consensus::serialize(&block.txdata[0]))
                .map(|tx: Transaction| tx.compute_txid())
                .unwrap();
        block.txdata[1].input[0].previous_output = OutPoint {
            txid: cb_txid,
            vout: 0,
        };
        let raw = serialize(&block);
        let parsed = parse_block(&raw).unwrap();

        let (_dir, utxo) = mem_utxo();
        let batch = build_batch(&parsed, &utxo, None, NOW).unwrap();
        let spend_txid = parsed.txs[1].hash.clone();
        let vals: Vec<u64> = batch
            .inputs_v2
            .iter()
            .filter(|r| r.txid == spend_txid)
            .map(|r| r.value_sat)
            .collect();
        // First input hits the same-block coinbase output; second still misses.
        assert!(vals.contains(&312_501_000), "same-block output must hit");
        assert_eq!(batch.utxo_misses, 1);
        // Read-only: nothing indexed (the store's internal miss metric may
        // increment on `get` — Task 4 behavior — but no entries are added).
        assert_eq!(utxo.len(), 0);
        assert_eq!(utxo.get(&parsed.txs[0].hash, 0).unwrap(), None);
    }

    #[test]
    fn failed_table_aborts_flush() {
        let (_dir, utxo) = mem_utxo();
        let block = parsed_fixture();
        let batch = build_batch(&block, &utxo, None, NOW).unwrap();

        let w = ClickHouseWriter::new(FakeWriter::failing_at(5));
        let res = w.flush(&batch);
        assert!(res.is_err(), "flush must abort on table 5 failure");
        assert_eq!(
            w.inner.calls(),
            vec!["blocks", "transactions", "outputs", "inputs", "blocks_v2"],
            "caller must not proceed past the failed table (no checkpoint)"
        );
    }

    #[test]
    fn display_hex_parity_pinned() {
        // PARITY-PINNED vs Go `chainhash.String()`: the vendored btcsuite
        // source (chaincfg/chainhash@v1.2.0/hash.go, `func (hash Hash)
        // String()`) reverses the 32 internal digest bytes and hex-encodes
        // them. rust-bitcoin `BlockHash`/`Txid` Display follows the same
        // convention; these constants were produced by an INDEPENDENT
        // implementation — python3 `hashlib.sha256(sha256(payload))` over the
        // exact consensus bytes of the fixture below, byte-reversed — because
        // no Go toolchain exists in this env for a direct chainhash
        // comparison. If the display convention drifts, this breaks loudly
        // before Task 6/7 lock anything in.
        const BLOCK_HASH: &str = "c1df5d36061d12e3cdf7a678cf84216b5586ea4f7f81033abd4a86b698d02d53";
        const COINBASE_TXID: &str =
            "0da83339cc2f058dd937aabb42e13d1de473e5ad62133c7cb0eeb565f8ffe392";
        const SPEND_TXID: &str = "73dace905a21b1bd89446a9765a7ceeac31c04e434904294ad53406d6440d43c";

        let block = parsed_fixture();
        assert_eq!(block.hash, BLOCK_HASH);
        assert_eq!(block.txs[0].hash, COINBASE_TXID);
        assert_eq!(block.txs[1].hash, SPEND_TXID);
        // Zero digests render as 64 zeros (Go coinbase-prev / empty-hash parity).
        assert_eq!(block.prev_hash, "00".repeat(32));
        assert_eq!(block.merkle_root, "00".repeat(32));
        assert_eq!(block.txs[0].inputs[0].prev_txid, "00".repeat(32));
    }

    #[test]
    fn block_v2_derivations() {
        let (_dir, utxo) = mem_utxo();
        let block = parsed_fixture();

        // Unknown prev time -> 600 s default (Go parity).
        let batch = build_batch(&block, &utxo, None, NOW).unwrap();
        let b = &batch.blocks_v2[0];
        assert_eq!(b.height, HEIGHT);
        assert_eq!(b.tx_count, 2);
        assert_eq!(b.reward_sat, 312_500_000, "subsidy_at(840_000)");
        assert_eq!(
            b.fee_total_sat, 1_000,
            "coinbase 312_501_000 - subsidy 312_500_000"
        );
        assert_eq!(b.interval_sec, 600);
        assert_eq!(b.updated_at, NOW);
        assert_eq!(b.difficulty, 0.0);
        assert_eq!(b.chainwork, "");

        // Known prev time -> exact signed delta.
        let (_dir2, utxo2) = mem_utxo();
        let batch2 = build_batch(&block, &utxo2, Some(TIME - 60), NOW).unwrap();
        assert_eq!(batch2.blocks_v2[0].interval_sec, 60);

        // Fresh UTXO: both spend parents miss -> input_total 0, fee negative
        // but signed (0 - 7000), not wrapped.
        let tx = batch
            .transactions_v2
            .iter()
            .find(|r| r.txid == block.txs[1].hash)
            .unwrap();
        assert_eq!(tx.input_total_sat, 0);
        assert_eq!(tx.fee_sat, -7_000);

        // Unspent outputs land with epoch spent_time (Go `time.Unix(0,0)`).
        assert!(batch.outputs_v2.iter().all(|o| o.spent == 0
            && o.spending_txid.is_empty()
            && o.spent_height == 0
            && o.spent_time == 0));

        // Successful flush returns row counts across all 8 tables.
        let w = ClickHouseWriter::new(FakeWriter::new());
        let stats = w.flush(&batch).unwrap();
        assert_eq!(
            w.inner.calls(),
            TABLE_ORDER
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
        );
        assert_eq!(w.inner.row_counts(), vec![1, 2, 2, 3, 1, 2, 3, 2]);
        assert_eq!(
            stats,
            FlushStats {
                blocks: 2,
                transactions: 4,
                outputs: 4,
                inputs: 6,
                utxo_misses: 2,
            }
        );
    }
}
