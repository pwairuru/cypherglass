//! End-to-end pipeline test: one synthetic block through [`Syncer`] into a
//! [`FakeWriter`], asserting all 8 tables land with exact row counts plus
//! spot values on the built batch.
//!
//! The live ClickHouse variant (`live_clickhouse_roundtrip`, `#[ignore]`)
//! runs the same fixture through [`NativeWriter`] against the address in
//! `CH_TEST_ADDR` (e.g. `http://bitcoin:bitcoin_clickhouse@127.0.0.1:8124`)
//! using an ephemeral `decoder_it` database (dropped at the end).

use std::path::{Path, PathBuf};

use decoder::ch::{build_batch, now_utc_secs, ClickHouseWriter, FakeWriter, TABLE_ORDER};
use decoder::parser::{parse_block, MAINNET_MAGIC};
use decoder::state::SyncState;
use decoder::syncer::Syncer;
use decoder::utxo::UtxoStore;

const ZERO_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

/// One block: coinbase (1 out) + one spend of a prefilled parent (1 in).
fn fixture_bytes() -> (Vec<u8>, String, String) {
    use bitcoin::absolute::LockTime;
    use bitcoin::block::{Block, Header, Version};
    use bitcoin::consensus::serialize;
    use bitcoin::hashes::Hash as _;
    use bitcoin::{
        Amount, CompactTarget, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxMerkleNode,
        TxOut, Witness,
    };

    // Height 1 encoded the way the syncer tests do: raw LE bytes first, so
    // the parser's Go-parity `script[0:4] LE` read yields exactly 1.
    let mut cb_script = 1u32.to_le_bytes().to_vec();
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
            value: Amount::from_sat(5_000_001_000),
            script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
        }],
    };
    let parent_txid: String = "11".repeat(32);
    let spend = Transaction {
        version: bitcoin::transaction::Version::ONE,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint {
                txid: parent_txid.parse().unwrap(),
                vout: 0,
            },
            script_sig: ScriptBuf::from_bytes(b"sig".to_vec()),
            sequence: Sequence::MAX,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(8_000),
            script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
        }],
    };
    let block = Block {
        header: Header {
            version: Version::from_consensus(1),
            prev_blockhash: ZERO_HASH.parse().unwrap(),
            merkle_root: TxMerkleNode::from_byte_array([0u8; 32]),
            time: 1_700_000_000,
            bits: CompactTarget::from_consensus(0x1d00ffff),
            nonce: 7,
        },
        txdata: vec![coinbase, spend],
    };
    let body = serialize(&block);
    let mut framed = Vec::with_capacity(8 + body.len());
    framed.extend_from_slice(&MAINNET_MAGIC);
    framed.extend_from_slice(&(body.len() as u32).to_le_bytes());
    framed.extend_from_slice(&body);
    let parsed = parse_block(&body).unwrap();
    (framed, parsed.hash, parent_txid)
}

fn write_blk(blocks_dir: &Path, framed: &[u8]) {
    std::fs::write(blocks_dir.join("blk00001.dat"), framed).unwrap();
}

fn test_syncer(
    dir: &tempfile::TempDir,
    writer: FakeWriter,
    prefill: Option<(&str, u32, u64)>,
) -> (Syncer<FakeWriter>, PathBuf) {
    let blocks = dir.path().join("blocks");
    std::fs::create_dir_all(&blocks).unwrap();
    let utxo = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
    if let Some((txid, vout, value)) = prefill {
        utxo.put(txid, vout, value).unwrap();
    }
    let s = Syncer::new(
        blocks.clone(),
        dir.path().join("state.json"),
        SyncState::default(),
        utxo,
        ClickHouseWriter::new(writer),
        10,
    );
    (s, blocks)
}

#[test]
fn one_block_all_eight_tables_row_counts() {
    let dir = tempfile::tempdir().unwrap();
    let (framed, _hash, parent) = fixture_bytes();
    let (mut s, blocks) = test_syncer(&dir, FakeWriter::new(), Some((&parent, 0, 8_000)));
    write_blk(&blocks, &framed);

    let n = s.catch_up().unwrap();
    assert_eq!(n, 1, "exactly one block must be inserted");

    // Flush order is syncer insertBlock order; one block => one batch of 8.
    let calls = s.writer.inner.calls();
    assert_eq!(
        calls,
        TABLE_ORDER
            .iter()
            .map(|t| t.to_string())
            .collect::<Vec<_>>(),
        "all 8 tables must flush in syncer order"
    );
    // 1 coinbase + 1 spend: 2 txs, 2 outputs, 2 inputs (coinbase has 1 in-row).
    assert_eq!(s.writer.inner.row_counts(), vec![1, 2, 2, 2, 1, 2, 2, 2]);
    assert_eq!(s.state().last_height, 1);
    assert_eq!(s.state().last_file, "blk00001.dat");
}

#[test]
fn one_block_spot_values() {
    // Same fixture through build_batch directly: pins emitted values.
    let (framed, block_hash, parent) = fixture_bytes();
    let block = parse_block(&framed[8..]).unwrap();
    assert_eq!(block.height, 1);
    assert_eq!(block.hash, block_hash);

    let dir = tempfile::tempdir().unwrap();
    let utxo = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
    utxo.put(&parent, 0, 8_000).unwrap();
    let batch = build_batch(&block, &utxo, None, now_utc_secs()).unwrap();

    // blocks / blocks_v2.
    assert_eq!(batch.blocks.len(), 1);
    assert_eq!(batch.blocks[0].height, 1);
    assert_eq!(batch.blocks[0].hash, block_hash);
    assert_eq!(batch.blocks_v2[0].tx_count, 2);
    // reward: subsidy_at(1) == 50 BTC; coinbase out 5_000_001_000 => fee 1000.
    assert_eq!(batch.blocks_v2[0].reward_sat, 5_000_000_000);
    assert_eq!(batch.blocks_v2[0].fee_total_sat, 1_000);
    assert_eq!(batch.blocks_v2[0].interval_sec, 600);

    // Spend tx: input_total 8000, out 8000 => fee 0; coinbase fee 0.
    let spend_hash = &block.txs[1].hash;
    let spend_v2 = batch
        .transactions_v2
        .iter()
        .find(|r| &r.txid == spend_hash)
        .unwrap();
    assert_eq!(spend_v2.input_total_sat, 8_000);
    assert_eq!(spend_v2.fee_sat, 0);
    assert_eq!(spend_v2.block_height, 1);

    // v1 fee: 0 - total_out for non-coinbase.
    let spend_v1 = batch
        .transactions
        .iter()
        .find(|r| &r.txid == spend_hash)
        .unwrap();
    assert_eq!(spend_v1.fee_sat, -8_000);

    // inputs_v2 carries the resolved parent value; coinbase input is 0.
    let in_vals: Vec<u64> = batch.inputs_v2.iter().map(|r| r.value_sat).collect();
    assert!(in_vals.contains(&8_000), "parent value must resolve");
    assert!(in_vals.contains(&0), "coinbase input value is 0");

    // Outputs land unspent with epoch spent_time.
    assert!(batch
        .outputs_v2
        .iter()
        .all(|o| o.spent == 0 && o.spent_time == 0));
    let cb_out = batch
        .outputs_v2
        .iter()
        .find(|o| o.txid == block.txs[0].hash)
        .unwrap();
    assert_eq!(cb_out.value_sat, 5_000_001_000);
}

#[test]
fn bip34_coinbase_height_go_parity() {
    // Realistic BIP34 coinbase scriptSig for true height 800000
    // (`03 00 35 0c ...`: push=0x03, then 00 35 0c LE, then extra bytes).
    // Go reads script[0:4] as a raw LE u32, so the push opcode lands in the
    // low byte: LE(03 00 35 0c) = 0x0C350003 = 204800003, NOT 800000.
    // This test pins the parity value. If mainnet heights ever disagree with
    // known-good values, THIS is the documented parity-vs-correctness
    // conflict to resolve (opcode-aware parsing would diverge from Go).
    use bitcoin::absolute::LockTime;
    use bitcoin::block::{Block, Header, Version};
    use bitcoin::consensus::serialize;
    use bitcoin::hashes::Hash as _;
    use bitcoin::{
        Amount, CompactTarget, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxMerkleNode,
        TxOut, Witness,
    };

    let mut script = vec![0x03u8, 0x00, 0x35, 0x0c, 0xaa, 0xbb];
    script.extend_from_slice(&[0u8; 10]);
    let coinbase = Transaction {
        version: bitcoin::transaction::Version::ONE,
        lock_time: LockTime::ZERO,
        input: vec![TxIn {
            previous_output: OutPoint::null(),
            script_sig: ScriptBuf::from_bytes(script),
            sequence: Sequence::MAX,
            witness: Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(3_125_000_000),
            script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
        }],
    };
    let block = Block {
        header: Header {
            version: Version::from_consensus(1),
            prev_blockhash: ZERO_HASH.parse().unwrap(),
            merkle_root: TxMerkleNode::from_byte_array([0u8; 32]),
            time: 1_700_000_000,
            bits: CompactTarget::from_consensus(0x1d00ffff),
            nonce: 1,
        },
        txdata: vec![coinbase],
    };
    let raw = serialize(&block);
    let parsed = parse_block(&raw).unwrap();
    assert_eq!(
        parsed.height, 204_800_003,
        "Go-parity BIP34 read of script [03 00 35 0c ...]"
    );
    assert_eq!(0x0C35_0003u32, 204_800_003);
}

/// Live ClickHouse roundtrip: same one-block fixture through [`Syncer`] +
/// [`NativeWriter`](decoder::native::NativeWriter) into an ephemeral
/// `decoder_it` database. Run with:
/// `CH_TEST_ADDR=http://user:pass@127.0.0.1:8124 cargo test --test integration -- --ignored --nocapture`
/// Live ClickHouse roundtrip: same one-block fixture through [`Syncer`] +
/// [`NativeWriter`](decoder::native::NativeWriter) into an ephemeral
/// `decoder_it` database. Run with:
/// `CH_TEST_ADDR=http://user:pass@127.0.0.1:8124 cargo test --test integration -- --ignored --nocapture`
#[test]
#[ignore]
fn live_clickhouse_roundtrip() {
    use decoder::ch::ClickHouseWriter;
    use decoder::native::NativeWriter;

    let addr = match std::env::var("CH_TEST_ADDR") {
        Ok(a) if !a.is_empty() => a,
        _ => {
            eprintln!("SKIP: CH_TEST_ADDR not set");
            return;
        }
    };
    let db = std::env::var("CH_TEST_DATABASE").unwrap_or_else(|_| "decoder_it".to_string());
    if !decoder::config::valid_db_name(&db) {
        panic!("invalid CH_TEST_DATABASE {db:?}");
    }

    // Admin phase on the always-present `default` db: create the scratch db
    // first, because the pipeline writer (bound to `db`) cannot ping a
    // database that does not exist yet.
    let admin_writer = NativeWriter::for_url(&addr, "default").unwrap();
    admin_writer.ping().unwrap();
    let admin = admin_writer.client().clone();
    admin_writer.block_on(async {
        admin
            .query(&format!("CREATE DATABASE IF NOT EXISTS {db}"))
            .execute()
            .await
            .unwrap();
        for ddl in decoder::native::integration_table_ddls(&db) {
            admin.query(&ddl).execute().await.unwrap();
        }
    });

    let writer = NativeWriter::for_url(&addr, &db).unwrap();
    writer.ping().unwrap();

    let dir = tempfile::tempdir().unwrap();
    let (framed, block_hash, parent) = fixture_bytes();
    let blocks = dir.path().join("blocks");
    std::fs::create_dir_all(&blocks).unwrap();
    std::fs::write(blocks.join("blk00001.dat"), &framed).unwrap();
    let utxo = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
    utxo.put(&parent, 0, 8_000).unwrap();

    // No ambient runtime here: Syncer + NativeWriter run synchronously.
    let mut s = Syncer::new(
        blocks,
        dir.path().join("state.json"),
        SyncState::default(),
        utxo,
        ClickHouseWriter::new(writer),
        10,
    );
    let n = s.catch_up().unwrap();
    assert_eq!(n, 1);

    // Verify through the pipeline writer's own runtime (single-runtime
    // rule: the pooled connections belong to it).
    let inner = &s.writer.inner;
    let verify = inner.client().clone();
    inner.block_on(async {
        for (table, want) in [
            ("blocks", 1),
            ("blocks_v2", 1),
            ("transactions", 2),
            ("transactions_v2", 2),
            ("outputs", 2),
            ("outputs_v2", 2),
            ("inputs", 2),
            ("inputs_v2", 2),
        ] {
            let got: u64 = verify
                .query(&format!("SELECT count() FROM {db}.{table}"))
                .fetch_one()
                .await
                .unwrap();
            assert_eq!(got, want, "live row count for {table}");
        }
        let height: u32 = verify
            .query(&format!("SELECT height FROM {db}.blocks"))
            .fetch_one()
            .await
            .unwrap();
        assert_eq!(height, 1);
        let got_hash: String = verify
            .query(&format!("SELECT hash FROM {db}.blocks"))
            .fetch_one()
            .await
            .unwrap();
        assert_eq!(got_hash, block_hash);

        verify
            .query(&format!("DROP DATABASE IF EXISTS {db}"))
            .execute()
            .await
            .unwrap();
    });
}
