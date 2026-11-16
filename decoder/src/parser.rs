//! Bitcoin Core `blk*.dat` parser: magic scan, XOR deobfuscation, block/tx parse.
//!
//! Mirrors the Go decoder's `internal/parser` semantics:
//! - mainnet magic `f9 be b4 d9` scan with 1-byte resync on mismatch,
//! - `u32` LE size with an 8 MiB cap (never allocate on a forged length),
//! - offset-aware XOR deobfuscation (`xor.dat` key, 8-byte cycle),
//! - negative output values clamped to 0, output totals saturated at `i64::MAX`,
//! - BIP-141 weight/vsize, BIP34 height from the coinbase `scriptSig[0:4]` LE.
//!
//! `address`/`script_type` on [`ParsedOutput`] are left empty here; Task 3
//! (address extraction) fills them during enrichment.

use anyhow::{Context, Result};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Bitcoin mainnet P2P/block-file magic: `f9 be b4 d9`.
pub const MAINNET_MAGIC: [u8; 4] = [0xf9, 0xbe, 0xb4, 0xd9];

/// Maximum single `blk` record accepted. Consensus blocks never exceed 4 MiB
/// serialized; anything larger is corruption, not a block. The scan never
/// allocates on a forged length prefix (up to `0xFFFFFFFF` would OOM otherwise).
pub const MAX_BLOCK_SIZE: usize = 8 << 20;

/// XOR deobfuscator for Bitcoin Core block files.
///
/// Bitcoin Core obfuscates `blk*.dat` files by XORing every byte with an
/// 8-byte key stored in `xor.dat` in the blocks directory. Deobfuscation is
/// offset-aware: byte at absolute file position `p` uses `key[p % 8]`.
#[derive(Clone, Debug)]
pub struct XorDeobfuscator {
    key: [u8; 8],
}

impl XorDeobfuscator {
    /// Build from the raw `xor.dat` bytes (first 8 used, short keys zero-padded,
    /// mirroring Go's `copy(d.key[:], key)`).
    pub fn new(key: &[u8]) -> Self {
        let mut k = [0u8; 8];
        let n = key.len().min(8);
        k[..n].copy_from_slice(&key[..n]);
        Self { key: k }
    }

    /// XOR `buf` in place; `offset` is the absolute file offset of `buf[0]`.
    pub fn deobfuscate(&self, buf: &mut [u8], offset: u64) {
        for (i, b) in buf.iter_mut().enumerate() {
            *b ^= self.key[((offset + i as u64) % 8) as usize];
        }
    }
}

/// Parsed transaction input, mirroring Go's `ParsedInput`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedInput {
    pub index: u32,
    pub prev_txid: String,
    pub prev_index: u32,
    pub script_sig_hex: String,
    pub sequence: u32,
    pub coinbase_data: String,
}

/// Parsed transaction output, mirroring Go's `ParsedOutput`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedOutput {
    pub index: u32,
    pub value_sat: i64,
    pub script_hex: String,
    /// Filled by Task 3 address extraction; empty from the parser.
    pub address: String,
    /// Filled by Task 3 address extraction; empty from the parser.
    pub script_type: String,
}

/// Parsed transaction, mirroring Go's `ParsedTx`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedTx {
    pub hash: String,
    pub version: i32,
    pub lock_time: u32,
    pub is_coinbase: bool,
    pub inputs: Vec<ParsedInput>,
    pub outputs: Vec<ParsedOutput>,
    pub vin_count: u16,
    pub vout_count: u16,
    pub total_out_sat: i64,
    /// BIP-141 vsize: `(weight + 3) / 4`.
    pub size_vbytes: u32,
    /// BIP-141 transaction weight.
    pub weight_units: u32,
}

/// Parsed block, mirroring Go's `ParsedBlock` (hash/header fields flattened).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedBlock {
    /// BIP34 height from coinbase `scriptSig[0:4]` LE; 0 when absent.
    pub height: u32,
    pub hash: String,
    pub timestamp: u32,
    pub version: i32,
    pub bits: u32,
    pub nonce: u32,
    pub merkle_root: String,
    pub prev_hash: String,
    pub txs: Vec<ParsedTx>,
}

/// One scan hit: the parsed block plus its framing, mirroring Go's
/// `BlockScanResult`. `offset_start` is the size-field offset (Go parity:
/// block-data start minus 4); resume seeks use `offset_start + bytes_read`.
#[derive(Debug, Clone)]
pub struct BlockScan {
    pub block: ParsedBlock,
    pub bytes_read: u64,
    pub file_num: u32,
    pub offset_start: u64,
}

/// Deserialize one raw block body (without magic/size framing).
pub fn parse_block(raw: &[u8]) -> Result<ParsedBlock> {
    use bitcoin::consensus::deserialize;

    let block: bitcoin::block::Block =
        deserialize(raw).with_context(|| format!("deserialize block ({} bytes)", raw.len()))?;

    let mut txs = Vec::with_capacity(block.txdata.len());
    for tx in &block.txdata {
        txs.push(parse_transaction(tx));
    }

    // BIP34 height: first 4 bytes of the coinbase scriptSig, little-endian.
    // (Go parity: the push opcode + 3 height bytes are read as a raw LE u32.)
    let mut height = 0u32;
    if let Some(coinbase) = block.txdata.first() {
        if let Some(input) = coinbase.input.first() {
            let script = input.script_sig.as_bytes();
            if script.len() >= 4 {
                height = u32::from_le_bytes([script[0], script[1], script[2], script[3]]);
            }
        }
    }

    let header = &block.header;
    Ok(ParsedBlock {
        height,
        hash: block.block_hash().to_string(),
        timestamp: header.time,
        version: header.version.to_consensus(),
        bits: header.bits.to_consensus(),
        nonce: header.nonce,
        merkle_root: header.merkle_root.to_string(),
        prev_hash: header.prev_blockhash.to_string(),
        txs,
    })
}

fn parse_transaction(tx: &bitcoin::Transaction) -> ParsedTx {
    let is_coinbase = tx.is_coinbase();

    let mut inputs = Vec::with_capacity(tx.input.len());
    for (i, input) in tx.input.iter().enumerate() {
        let (prev_txid, prev_index, script_sig_hex, coinbase_data) = if is_coinbase {
            // Go parity: zero-value hash (renders as 64 zeros) and index 0.
            (
                "00".repeat(32),
                0,
                String::new(),
                hex::encode(input.script_sig.as_bytes()),
            )
        } else {
            (
                input.previous_output.txid.to_string(),
                input.previous_output.vout,
                hex::encode(input.script_sig.as_bytes()),
                String::new(),
            )
        };
        inputs.push(ParsedInput {
            index: i as u32,
            prev_txid,
            prev_index,
            script_sig_hex,
            sequence: input.sequence.to_consensus_u32(),
            coinbase_data,
        });
    }

    let mut outputs = Vec::with_capacity(tx.output.len());
    let mut total_out: i64 = 0;
    for (i, out) in tx.output.iter().enumerate() {
        // The consensus decoder yields an unsigned amount; values with the
        // high bit set are invalid on the wire (Go reads them as negative
        // int64). Clamp: a negative would wrap fee aggregates in ClickHouse.
        let mut v = out.value.to_sat() as i64;
        if v < 0 {
            eprintln!("WARN: negative output value {v}, clamped to 0");
            v = 0;
        }
        outputs.push(ParsedOutput {
            index: i as u32,
            value_sat: v,
            script_hex: hex::encode(out.script_pubkey.as_bytes()),
            address: String::new(),
            script_type: String::new(),
        });
        total_out = total_out.wrapping_add(v);
        if total_out < 0 {
            total_out = i64::MAX; // saturate on corrupt-file overflow (Go parity)
        }
    }

    // BIP-141 vsize: ceil(weight / 4), i.e. Go's (weight + 3) / 4.
    let weight_units = u32::try_from(tx.weight().to_wu()).unwrap_or(u32::MAX);

    ParsedTx {
        hash: tx.compute_txid().to_string(),
        version: tx.version.0,
        lock_time: tx.lock_time.to_consensus_u32(),
        is_coinbase,
        vin_count: tx.input.len() as u16,
        vout_count: tx.output.len() as u16,
        total_out_sat: total_out,
        size_vbytes: weight_units.div_ceil(4),
        weight_units,
        inputs,
        outputs,
    }
}

/// Scan a `blk*.dat` file for blocks, invoking `cb` per valid record.
///
/// Semantics mirror Go's `ScanBlocksOpts`: seek to `start_offset`, resync past
/// bad magic one byte at a time, skip oversize records without allocating,
/// stop cleanly (`Ok`) on truncated tails, skip undecodable bodies with a
/// warning. `deob` XOR-deobfuscates every byte read when present.
///
/// Note: on magic mismatch this steps one byte forward, while Go's scan steps
/// a full 4-byte magic width. One-byte resync is strictly more robust (finds
/// magic at any alignment after 1-byte corruption); oversize resync matches Go
/// exactly (one byte past the size field).
pub fn scan_blocks(
    path: &Path,
    file_num: u32,
    start_offset: u64,
    deob: Option<&XorDeobfuscator>,
    cb: &mut dyn FnMut(BlockScan) -> Result<()>,
) -> Result<()> {
    let mut f = File::open(path).with_context(|| format!("open {}", path.display()))?;
    f.seek(SeekFrom::Start(start_offset))
        .with_context(|| format!("seek {path:?} to {start_offset}"))?;

    let mut offset = start_offset;
    let mut magic_buf = [0u8; 4];
    let mut size_buf = [0u8; 4];

    loop {
        let record_start = offset;
        match f.read_exact(&mut magic_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(e) => return Err(e).context("read magic"),
        }
        if let Some(d) = deob {
            d.deobfuscate(&mut magic_buf, offset);
        }
        offset += 4;

        if magic_buf != MAINNET_MAGIC {
            // Resync: step one byte forward from the record start.
            offset = record_start + 1;
            f.seek(SeekFrom::Start(offset)).context("seek resync")?;
            continue;
        }

        match f.read_exact(&mut size_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(e) => return Err(e).context("read size"),
        }
        if let Some(d) = deob {
            d.deobfuscate(&mut size_buf, offset);
        }
        let block_size = u32::from_le_bytes(size_buf);
        offset += 4;

        if block_size as usize > MAX_BLOCK_SIZE {
            // Corrupt/forged length: never allocate on it. Step one byte
            // forward and resync the magic scan instead of aborting the
            // whole file (keeps syncing past disk corruption).
            eprintln!("WARN: implausible block size {block_size} at offset {offset}, resyncing");
            offset += 1;
            f.seek(SeekFrom::Start(offset)).context("seek resync")?;
            continue;
        }

        let mut body = vec![0u8; block_size as usize];
        match f.read_exact(&mut body) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(e) => return Err(e).context("read block data"),
        }
        if let Some(d) = deob {
            d.deobfuscate(&mut body, offset);
        }

        let data_start = offset;
        match parse_block(&body) {
            Ok(block) => {
                let total_read = 4 + 4 + block_size as u64;
                cb(BlockScan {
                    block,
                    bytes_read: total_read,
                    file_num,
                    offset_start: data_start - 4,
                })?;
            }
            Err(e) => {
                eprintln!("WARN: skipping block at offset {offset}: {e:#}");
            }
        }
        offset = data_start + block_size as u64;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::absolute::LockTime;
    use bitcoin::block::{Block, Header, Version};
    use bitcoin::consensus::serialize;
    use bitcoin::hashes::Hash as _;
    use bitcoin::{
        Amount, BlockHash, CompactTarget, OutPoint, ScriptBuf, Sequence, Transaction, TxIn,
        TxMerkleNode, TxOut,
    };

    const TEST_HEIGHT: u32 = 840_000;

    fn coinbase_script(height: u32) -> ScriptBuf {
        let mut v = height.to_le_bytes().to_vec();
        v.extend_from_slice(b"test");
        ScriptBuf::from_bytes(v)
    }

    fn coinbase_tx(height: u32, outputs: Vec<TxOut>) -> Transaction {
        Transaction {
            version: bitcoin::transaction::Version::ONE,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::null(),
                script_sig: coinbase_script(height),
                sequence: Sequence::MAX,
                witness: bitcoin::Witness::new(),
            }],
            output: outputs,
        }
    }

    fn p2pkh_output(value_sat: u64) -> TxOut {
        // OP_DUP OP_HASH160 <20x0x11> OP_EQUALVERIFY OP_CHECKSIG.
        let mut script = vec![0x76, 0xa9, 0x14];
        script.extend_from_slice(&[0x11; 20]);
        script.extend_from_slice(&[0x88, 0xac]);
        TxOut {
            value: Amount::from_sat(value_sat),
            script_pubkey: ScriptBuf::from_bytes(script),
        }
    }

    fn test_block(txs: Vec<Transaction>) -> Block {
        Block {
            header: Header {
                version: Version::from_consensus(1),
                prev_blockhash: BlockHash::from_byte_array([0u8; 32]),
                merkle_root: TxMerkleNode::from_byte_array([0u8; 32]),
                time: 1_700_000_000,
                bits: CompactTarget::from_consensus(0x1d00ffff),
                nonce: 12345,
            },
            txdata: txs,
        }
    }

    fn framed(block: &Block) -> Vec<u8> {
        let body = serialize(block);
        let mut v = Vec::with_capacity(8 + body.len());
        v.extend_from_slice(&MAINNET_MAGIC);
        v.extend_from_slice(&(body.len() as u32).to_le_bytes());
        v.extend_from_slice(&body);
        v
    }

    fn write_temp(name: &str, bytes: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(name);
        std::fs::write(&path, bytes).unwrap();
        (dir, path)
    }

    fn write_temp_obfuscated(
        name: &str,
        bytes: &[u8],
        key: &[u8; 8],
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let mut obf = bytes.to_vec();
        for (i, b) in obf.iter_mut().enumerate() {
            *b ^= key[i % 8];
        }
        write_temp(name, &obf)
    }

    #[test]
    fn skips_forged_length_without_alloc() {
        // magic + 0xFFFFFFFF + trailing magic, expect 0 callbacks, Ok(())
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&MAINNET_MAGIC);
        bytes.extend_from_slice(&0xFFFF_FFFFu32.to_le_bytes());
        bytes.extend_from_slice(&MAINNET_MAGIC);
        let (_dir, path) = write_temp("blk00001.dat", &bytes);
        let mut calls = 0u32;
        let res = scan_blocks(&path, 1, 0, None, &mut |_| {
            calls += 1;
            Ok(())
        });
        assert!(res.is_ok(), "scan must stop cleanly, got {res:?}");
        assert_eq!(calls, 0, "forged length must yield zero callbacks");
    }

    #[test]
    fn clamps_negative_output() {
        // tx with -100 sat output -> ValueSat 0, total excludes it
        let neg = TxOut {
            value: Amount::from_sat((-100i64) as u64),
            script_pubkey: ScriptBuf::new(),
        };
        let block = test_block(vec![coinbase_tx(
            TEST_HEIGHT,
            vec![neg, p2pkh_output(5_000)],
        )]);
        let bytes = framed(&block);
        let (_dir, path) = write_temp("blk00001.dat", &bytes);
        let mut seen: Vec<ParsedBlock> = Vec::new();
        let res = scan_blocks(&path, 1, 0, None, &mut |scan| {
            seen.push(scan.block);
            Ok(())
        });
        assert!(res.is_ok(), "got {res:?}");
        assert_eq!(seen.len(), 1);
        let tx = &seen[0].txs[0];
        assert_eq!(
            tx.outputs[0].value_sat, 0,
            "negative output must clamp to 0"
        );
        assert_eq!(tx.outputs[1].value_sat, 5_000);
        assert_eq!(
            tx.total_out_sat, 5_000,
            "total must exclude the clamped output"
        );
    }

    #[test]
    fn truncated_record_stops_clean() {
        // magic+size, body cut short -> Ok, no callback, offset unchanged
        let block = test_block(vec![coinbase_tx(TEST_HEIGHT, vec![p2pkh_output(5_000)])]);
        let mut bytes = framed(&block);
        bytes.truncate(8 + 10);
        let (_dir, path) = write_temp("blk00001.dat", &bytes);
        let mut calls = 0u32;
        let res = scan_blocks(&path, 1, 0, None, &mut |_| {
            calls += 1;
            Ok(())
        });
        assert!(res.is_ok(), "truncated tail must stop cleanly, got {res:?}");
        assert_eq!(calls, 0, "no callback for a truncated record");
    }

    #[test]
    fn xor_roundtrip_at_offset() {
        let key = [0x11u8, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
        let deob = XorDeobfuscator::new(&key);
        let mut buf = b"bitcoin-blk-payload-0123456789".to_vec();
        let orig = buf.clone();
        deob.deobfuscate(&mut buf, 5);
        assert_ne!(buf, orig);
        deob.deobfuscate(&mut buf, 5);
        assert_eq!(
            buf, orig,
            "double deobfuscation at same offset must roundtrip"
        );

        // End to end: obfuscated framed file scans back to the same block.
        let block = test_block(vec![coinbase_tx(TEST_HEIGHT, vec![p2pkh_output(5_000)])]);
        let bytes = framed(&block);
        let (_dir, path) = write_temp_obfuscated("blk00001.dat", &bytes, &key);
        let mut seen: Vec<ParsedBlock> = Vec::new();
        let res = scan_blocks(&path, 1, 0, Some(&deob), &mut |scan| {
            seen.push(scan.block);
            Ok(())
        });
        assert!(res.is_ok(), "got {res:?}");
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].height, TEST_HEIGHT);
    }

    #[test]
    fn bip34_height_read() {
        let block = test_block(vec![coinbase_tx(TEST_HEIGHT, vec![p2pkh_output(5_000)])]);
        let bytes = framed(&block);
        let (_dir, path) = write_temp("blk00001.dat", &bytes);
        let mut seen: Vec<BlockScan> = Vec::new();
        scan_blocks(&path, 7, 0, None, &mut |scan| {
            seen.push(scan);
            Ok(())
        })
        .unwrap();
        assert_eq!(seen.len(), 1);
        let scan = &seen[0];
        assert_eq!(scan.file_num, 7);
        assert_eq!(
            scan.bytes_read,
            bytes.len() as u64,
            "framing must be 8 + body"
        );
        assert_eq!(scan.offset_start, 4, "Go parity: size-field offset");
        let parsed = &scan.block;
        assert_eq!(parsed.height, TEST_HEIGHT);
        assert!(!parsed.hash.is_empty());
        assert_eq!(parsed.timestamp, 1_700_000_000);
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.bits, 0x1d00ffff);
        assert_eq!(parsed.nonce, 12345);
        assert_eq!(parsed.merkle_root, "00".repeat(32));
        assert_eq!(parsed.prev_hash, "00".repeat(32));
        assert_eq!(parsed.txs.len(), 1);
        assert!(parsed.txs[0].is_coinbase);
        // BIP-141 consistency: vsize == ceil(weight/4) (Go: (weight+3)/4).
        let tx = &parsed.txs[0];
        assert!(tx.weight_units > 0);
        #[allow(clippy::manual_div_ceil)]
        let expected_vsize = (tx.weight_units + 3) / 4;
        assert_eq!(tx.size_vbytes, expected_vsize);
    }
}
