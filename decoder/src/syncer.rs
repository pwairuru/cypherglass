//! Catch-up + watch syncer: `blk*.dat` files into ClickHouse (Task 6).
//!
//! Mirrors `decoder/internal/syncer/syncer.go`: strict path guard, sorted
//! catch-up with offset resume, skip-seen heights, reorg warn-and-keep,
//! `notify` watcher + 10 s poll fallback, and the Task 5 batch commit
//! protocol (build read-only, flush all 8 tables, only on `Ok` apply UTXO +
//! advance + atomic state save; any flush error replays on restart).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use anyhow::{Context, Result};

use crate::ch::{
    build_batch, collect_utxo_ops, now_utc_secs, BlockBatch, ClickHouseWriter, DbWriter,
};
use crate::parser::{scan_blocks, ParsedBlock, XorDeobfuscator};
use crate::state::{save_state_atomic, SyncState};
use crate::utxo::UtxoStore;

/// One built-but-unflushed block: merged into the next flush when
/// `batch_blocks` is reached (or at EOF / shutdown for a partial batch).
struct PendingBlock {
    block: ParsedBlock,
    batch: BlockBatch,
    end_offset: u64,
    file_name: String,
}

/// Cursor snapshot at batch start: restored if the batch flush fails so an
/// in-process continuation replays from checkpoint-consistent state.
struct BatchSnapshot {
    next_height: u32,
    prev_time: Option<u32>,
    prev_hash: String,
    seen_prev: Vec<(u32, Option<String>)>,
}

/// Filesystem syncer over a generic [`DbWriter`] backend.
pub struct Syncer<W: DbWriter> {
    blocks_dir: PathBuf,
    state_file: PathBuf,
    state: SyncState,
    utxo: UtxoStore,
    /// The writer backend (public so integration tests and the binary can
    /// inspect a [`FakeWriter`](crate::ch::FakeWriter) after a run).
    pub writer: ClickHouseWriter<W>,
    batch_blocks: usize,
    prev_hash: String,
    prev_time: Option<u32>,
    seen: HashMap<u32, String>,
    deob: Option<XorDeobfuscator>,
    next_height: u32,
    pending: Vec<PendingBlock>,
    batch_snapshot: Option<BatchSnapshot>,
    /// Poll fallback interval (Go: 10 s; tests shrink this).
    pub poll_interval: Duration,
}

/// Sorted `blk*.dat` names in `dir` (loose Go-parity filter; strictness
/// lives in [`resolve_blk_path`]).
pub fn list_blk_files(dir: &Path) -> Result<Vec<String>> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir).with_context(|| format!("reading {}", dir.display()))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("blk") && name.ends_with(".dat") {
            files.push(name);
        }
    }
    files.sort();
    Ok(files)
}

/// Strict Bitcoin Core block file name (`blk` + 1+ digits + `.dat`),
/// mirroring Go `blkFileRe` without a regex dependency.
fn valid_blk_name(name: &str) -> bool {
    if name.len() < 8 || !name.starts_with("blk") || !name.ends_with(".dat") {
        return false;
    }
    let digits = &name[3..name.len() - 4];
    !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
}

/// Confine an event/listed path to `blocks_dir`: strict `blkNNNNN.dat`
/// name, symlink resolution, prefix containment.
///
/// Mirrors Go `resolveBlkPath`: the basename must match strictly (so
/// `../evil.dat`, `/etc/passwd`, `blk.dat`, `rev00001.dat`, `xor.dat` are
/// rejected before any filesystem access), then the joined candidate is
/// resolved through symlinks and must stay inside `blocks_dir` (a symlink
/// pointing outside is rejected; an inner symlink is allowed). A missing
/// file (racy delete between event and open) is an error the caller skips.
pub fn resolve_blk_path(blocks_dir: &Path, path: &Path) -> Result<PathBuf> {
    let base = path
        .file_name()
        .and_then(|s| s.to_str())
        .with_context(|| format!("not a block file: {}", path.display()))?;
    if !valid_blk_name(base) {
        anyhow::bail!("not a block file: {base:?}");
    }
    let dir_abs = std::fs::canonicalize(blocks_dir)
        .with_context(|| format!("resolving {}", blocks_dir.display()))?;
    let candidate = dir_abs.join(base);
    let resolved = std::fs::canonicalize(&candidate)
        .with_context(|| format!("resolving {}", candidate.display()))?;
    if !resolved.starts_with(&dir_abs) {
        anyhow::bail!("block file escapes data dir: {}", path.display());
    }
    Ok(resolved)
}

/// Numeric suffix of `blkNNNNN.dat` for the parser (Go `parseBlkNum` parity;
/// 0 when unparseable, unreachable after [`resolve_blk_path`]).
fn parse_blk_num(name: &str) -> u32 {
    name.strip_prefix("blk")
        .and_then(|s| s.strip_suffix(".dat"))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Read the `xor.dat` obfuscation key (Go `loadDeobfuscator` parity):
/// `None` when missing or empty, else the first 8 bytes (short keys
/// zero-padded by [`XorDeobfuscator::new`]).
fn load_deobfuscator(blocks_dir: &Path) -> Option<XorDeobfuscator> {
    match std::fs::read(blocks_dir.join("xor.dat")) {
        Ok(data) if !data.is_empty() => {
            eprintln!("Loaded blk file obfuscation key from xor.dat");
            Some(XorDeobfuscator::new(&data))
        }
        _ => None,
    }
}

impl<W: DbWriter> Syncer<W> {
    /// Build a syncer; `batch_blocks` clamps to >= 1 (config parity).
    pub fn new(
        blocks_dir: PathBuf,
        state_file: PathBuf,
        state: SyncState,
        utxo: UtxoStore,
        writer: ClickHouseWriter<W>,
        batch_blocks: usize,
    ) -> Self {
        let next_height = if state.last_height == 0 && state.last_file.is_empty() {
            0
        } else {
            state.last_height.saturating_add(1)
        };
        let deob = load_deobfuscator(&blocks_dir);
        Self {
            blocks_dir,
            state_file,
            state,
            utxo,
            writer,
            batch_blocks: batch_blocks.max(1),
            prev_hash: String::new(),
            prev_time: None,
            seen: HashMap::new(),
            deob,
            next_height,
            pending: Vec::new(),
            batch_snapshot: None,
            poll_interval: Duration::from_secs(10),
        }
    }

    /// Resume view of the checkpoint.
    pub fn state(&self) -> &SyncState {
        &self.state
    }

    /// Ingest one scanned block: exact-duplicate skip, reorg warn-and-keep,
    /// pre-BIP34 sequential height mapping, read-only build, batch
    /// accumulation. Returns blocks flushed by this ingest (0 or batch size).
    ///
    /// Cursor fields (`seen`/`prev_*`/`next_height`) update eagerly per block
    /// (Go parity for `interval_sec` chaining inside a batch); a batch-start
    /// snapshot restores them if the batch flush later fails.
    fn ingest(
        &mut self,
        mut block: ParsedBlock,
        end_offset: u64,
        file_name: &str,
    ) -> Result<usize> {
        if block.height != 0 {
            match self.seen.get(&block.height) {
                Some(known) if *known == block.hash => {
                    return Ok(0); // exact duplicate already indexed: skip
                }
                Some(_) => {
                    eprintln!(
                        "REORG suspected at height {}: different hash {} (keeping both, needs backfill)",
                        block.height, block.hash
                    );
                }
                None => {
                    if block.height <= self.state.last_height {
                        eprintln!(
                            "REORG suspected at height {}: below tip {} with no record (keeping both, needs backfill)",
                            block.height,
                            self.state.last_height
                        );
                    }
                }
            }
        }
        // Prefer parser height (BIP34 coinbase); fall back to sequential
        // only for pre-BIP34 blocks where height is 0 (Go parity).
        if block.height == 0 {
            block.height = self.next_height;
        }
        let height = block.height;
        // Reorg detection: prev_hash must link to the previous block hash
        // (Go parity: warn, keep both, no auto-delete).
        if !self.prev_hash.is_empty()
            && !block.prev_hash.is_empty()
            && block.prev_hash != self.prev_hash
            && height != 0
        {
            eprintln!(
                "REORG suspected at height {height}: prev {} != last {} (keeping both, needs backfill)",
                block.prev_hash, self.prev_hash
            );
        }
        // Chain the interval clock across the open batch (Go updates
        // prevTime per block; the batch tail is the predecessor here).
        let prev_time = self
            .pending
            .last()
            .map(|p| p.block.timestamp)
            .or(self.prev_time);
        // Read-only build: safe to repeat after a failed flush (Task 5).
        let batch = build_batch(&block, &self.utxo, prev_time, now_utc_secs())?;
        if self.pending.is_empty() {
            self.batch_snapshot = Some(BatchSnapshot {
                next_height: self.next_height,
                prev_time: self.prev_time,
                prev_hash: self.prev_hash.clone(),
                seen_prev: Vec::new(),
            });
        }
        if let Some(snap) = self.batch_snapshot.as_mut() {
            if !snap.seen_prev.iter().any(|(h, _)| *h == height) {
                snap.seen_prev
                    .push((height, self.seen.get(&height).cloned()));
            }
        }
        self.seen.insert(height, block.hash.clone());
        self.prev_hash = block.hash.clone();
        self.prev_time = Some(block.timestamp);
        self.next_height = height.saturating_add(1);
        self.pending.push(PendingBlock {
            block,
            batch,
            end_offset,
            file_name: file_name.to_string(),
        });
        if self.pending.len() >= self.batch_blocks {
            return self.flush_pending();
        }
        Ok(0)
    }

    /// Restore batch-start cursors (failure path: offsets never advanced,
    /// so the batch replays on restart from the checkpoint).
    fn restore_snapshot(&mut self) {
        if let Some(snap) = self.batch_snapshot.take() {
            self.next_height = snap.next_height;
            self.prev_time = snap.prev_time;
            self.prev_hash = snap.prev_hash;
            for (h, prev) in snap.seen_prev {
                match prev {
                    Some(v) => {
                        self.seen.insert(h, v);
                    }
                    None => {
                        self.seen.remove(&h);
                    }
                }
            }
        }
    }

    /// Drop the open batch and restore batch-start cursors (flush/scan
    /// failure path: offsets never advanced, so the batch replays on
    /// restart from the checkpoint).
    fn discard_pending(&mut self) {
        self.restore_snapshot();
        self.pending.clear();
    }

    /// Flush the open batch: merge block batches, submit the 8 table batches
    /// sequentially, and ONLY on all-8-Ok apply the UTXO mutations (Go
    /// insertBlock pass 1+2, relocated post-flush per Task 5), advance
    /// `{last_height,last_file,last_offset}` per block, and atomically save
    /// state. Any error: no UTXO apply, no checkpoint (batch replays).
    ///
    /// Each flush commits the whole batch's UTXO ops in a SINGLE redb write
    /// transaction, so the store is durable before the state file advances
    /// (CH flush OK -> redb commit -> state save).
    fn flush_pending(&mut self) -> Result<usize> {
        if self.pending.is_empty() {
            return Ok(0);
        }
        let mut combined = BlockBatch::default();
        for p in &self.pending {
            combined.blocks.extend(p.batch.blocks.iter().cloned());
            combined
                .transactions
                .extend(p.batch.transactions.iter().cloned());
            combined.outputs.extend(p.batch.outputs.iter().cloned());
            combined.inputs.extend(p.batch.inputs.iter().cloned());
            combined.blocks_v2.extend(p.batch.blocks_v2.iter().cloned());
            combined
                .transactions_v2
                .extend(p.batch.transactions_v2.iter().cloned());
            combined.inputs_v2.extend(p.batch.inputs_v2.iter().cloned());
            combined
                .outputs_v2
                .extend(p.batch.outputs_v2.iter().cloned());
            combined.utxo_misses += p.batch.utxo_misses;
        }
        let n = self.pending.len();
        if let Err(e) = self.writer.flush(&combined) {
            self.discard_pending();
            return Err(e).context("batch flush failed; no checkpoint, will replay");
        }
        let items: Vec<PendingBlock> = std::mem::take(&mut self.pending);
        // UTXO apply has no partial-checkpoint: on error the whole batch
        // (already dropped from `pending`) replays from the checkpoint, so
        // restore the pre-batch `seen` records — otherwise the replay would
        // look like exact duplicates and be skipped (data loss). Re-apply
        // itself is idempotent (`put` overwrites, `delete` of a missing key
        // is a no-op), and uninserted rows collapse in ClickHouse.
        // One write transaction for the whole batch (puts then deletes per
        // block, Go pass-1+2 order); a single commit instead of one per op.
        let mut puts = Vec::new();
        let mut deletes = Vec::new();
        for p in &items {
            let (pp, dd) = collect_utxo_ops(&p.block);
            puts.extend(pp);
            deletes.extend(dd);
        }
        if let Err(e) = self.utxo.batch_write(&puts, &deletes) {
            self.restore_snapshot();
            return Err(e).context("UTXO apply failed; no checkpoint, will replay");
        }
        for p in &items {
            self.state.last_height = p.block.height;
            self.state.last_file = p.file_name.clone();
            self.state.last_offset = p.end_offset as i64;
            if p.block.height % 1000 == 0 {
                eprintln!("Synced block {}", p.block.height);
            }
        }
        // Bound `seen`: offsets guarantee heights below the tip are never
        // re-scanned in normal flow, so only the tip entry is load-bearing
        // from here on (a pathological re-scan below the tip warns and
        // keeps both, collapsing via ReplacingMergeTree).
        let tip = self.state.last_height;
        self.seen.retain(|&h, _| h >= tip);
        self.batch_snapshot = None;
        save_state_atomic(&self.state_file, &self.state)?;
        Ok(n)
    }

    /// Scan one file from the resume offset; returns blocks inserted.
    ///
    /// Untrusted paths fail closed to `Ok(0)` with a warning (Go parity);
    /// per-block order is parse -> skip-seen -> build (read-only, may span
    /// the batch) -> per-flush: flush all tables (durable ack) -> on `Ok`:
    /// apply UTXO + redb commit -> advance + atomic save.
    pub fn process_file(&mut self, path: &Path) -> Result<usize> {
        let resolved = match resolve_blk_path(&self.blocks_dir, path) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("Skipping untrusted block path {}: {e:#}", path.display());
                return Ok(0);
            }
        };
        let file_name = resolved
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        if !self.state.last_file.is_empty() && file_name < self.state.last_file {
            return Ok(0); // older file: nothing new (loops pre-skip these too)
        }
        let file_num = parse_blk_num(&file_name);
        let start = if self.state.last_file == file_name {
            self.state.last_offset.max(0) as u64
        } else {
            0
        };
        eprintln!("Processing {}", resolved.display());
        let deob = self.deob.clone();
        let mut inserted = 0usize;
        let scan_result = scan_blocks(&resolved, file_num, start, deob.as_ref(), &mut |scan| {
            let end = scan.offset_start + scan.bytes_read;
            inserted += self.ingest(scan.block, end, &file_name)?;
            Ok(())
        });
        if let Err(e) = scan_result {
            // Do NOT checkpoint past a failed block: offsets still point at
            // the last success; the open batch replays on restart.
            self.discard_pending();
            return Err(e).context(format!("processing {}", resolved.display()));
        }
        // EOF: flush the partial batch first, then checkpoint (Go parity).
        inserted += self.flush_pending()?;
        save_state_atomic(&self.state_file, &self.state)?;
        eprintln!("Done processing {}", resolved.display());
        Ok(inserted)
    }

    /// Sorted catch-up over all files at/after the checkpoint file.
    /// Per-file errors are logged and skipped (Go parity); a list failure
    /// propagates.
    pub fn catch_up(&mut self) -> Result<usize> {
        let files = list_blk_files(&self.blocks_dir)?;
        if files.is_empty() {
            eprintln!("No blk*.dat files found, waiting for IBD...");
            return Ok(0);
        }
        let mut total = 0usize;
        for f in &files {
            if !self.state.last_file.is_empty() && *f < self.state.last_file {
                continue;
            }
            match self.process_file(Path::new(f)) {
                Ok(n) => total += n,
                Err(e) => eprintln!("ERROR processing {f}: {e:#}"),
            }
        }
        Ok(total)
    }

    /// One poll pass over files at/after the checkpoint (10 s fallback in
    /// [`run`](Self::run); list/parse errors logged, never fatal).
    fn poll_once(&mut self) {
        let files = match list_blk_files(&self.blocks_dir) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("Poll error: {e:#}");
                return;
            }
        };
        for f in &files {
            if !self.state.last_file.is_empty() && *f < self.state.last_file {
                continue;
            }
            if let Err(e) = self.process_file(Path::new(f)) {
                eprintln!("ERROR processing {f}: {e:#}");
            }
        }
    }

    /// Catch-up, then watch (`notify`) + poll until `stop`; the partial
    /// batch flushes before return (graceful shutdown).
    pub fn run(&mut self, stop: &AtomicBool) -> Result<()> {
        std::fs::create_dir_all(&self.blocks_dir)
            .with_context(|| format!("creating {}", self.blocks_dir.display()))?;
        if let Err(e) = self.catch_up() {
            eprintln!("Historical sync error: {e:#}");
        }

        let (tx, rx) = std::sync::mpsc::channel::<Result<notify::Event, notify::Error>>();
        use notify::Watcher as _;
        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })?;
        watcher.watch(&self.blocks_dir, notify::RecursiveMode::NonRecursive)?;
        eprintln!("Watching {} for new block files", self.blocks_dir.display());

        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            match rx.recv_timeout(self.poll_interval) {
                Ok(Ok(event)) => {
                    if matches!(
                        &event.kind,
                        notify::EventKind::Create(_) | notify::EventKind::Modify(_)
                    ) {
                        // Debounce: let bitcoind finish writing (Go parity).
                        std::thread::sleep(Duration::from_secs(2));
                        for p in &event.paths {
                            if let Ok(resolved) = resolve_blk_path(&self.blocks_dir, p) {
                                if let Err(e) = self.process_file(&resolved) {
                                    eprintln!("ERROR processing {}: {e:#}", resolved.display());
                                }
                            } // untrusted event name: skip
                        }
                    }
                }
                Ok(Err(e)) => eprintln!("Watcher error: {e}"),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => self.poll_once(),
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    self.poll_once();
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                }
            }
        }
        // Graceful shutdown: flush the partial batch first, then checkpoint.
        self.flush_pending()?;
        save_state_atomic(&self.state_file, &self.state)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ch::{ClickHouseWriter, FakeWriter};
    use crate::state::SyncState;

    const BATCH: usize = 10;

    fn block_bytes(height: u32, nonce: u32, prev_hex: &str) -> Vec<u8> {
        use bitcoin::absolute::LockTime;
        use bitcoin::block::{Block, Header, Version};
        use bitcoin::consensus::serialize;
        use bitcoin::hashes::Hash as _;
        use bitcoin::{
            Amount, CompactTarget, OutPoint, ScriptBuf, Sequence, Transaction, TxIn, TxMerkleNode,
            TxOut, Witness,
        };
        let mut script = height.to_le_bytes().to_vec();
        script.extend_from_slice(b"cb");
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
                value: Amount::from_sat(100_000),
                script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
            }],
        };
        let block = Block {
            header: Header {
                version: Version::from_consensus(1),
                prev_blockhash: prev_hex.parse().unwrap(),
                merkle_root: TxMerkleNode::from_byte_array([0u8; 32]),
                time: 1_700_000_000 + height,
                bits: CompactTarget::from_consensus(0x1d00ffff),
                nonce,
            },
            txdata: vec![coinbase],
        };
        let body = serialize(&block);
        let mut v = Vec::with_capacity(8 + body.len());
        v.extend_from_slice(&crate::parser::MAINNET_MAGIC);
        v.extend_from_slice(&(body.len() as u32).to_le_bytes());
        v.extend_from_slice(&body);
        v
    }

    fn hash_of_framed(framed: &[u8]) -> String {
        crate::parser::parse_block(&framed[8..]).unwrap().hash
    }

    const ZERO_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    fn test_syncer(
        dir: &tempfile::TempDir,
        batch: usize,
        writer: FakeWriter,
    ) -> (Syncer<FakeWriter>, PathBuf) {
        let blocks = dir.path().join("blocks");
        std::fs::create_dir_all(&blocks).unwrap();
        let utxo = UtxoStore::open(&dir.path().join("utxo.redb")).unwrap();
        let s = Syncer::new(
            blocks.clone(),
            dir.path().join("state.json"),
            SyncState::default(),
            utxo,
            ClickHouseWriter::new(writer),
            batch,
        );
        (s, blocks)
    }

    #[test]
    fn valid_names_resolve() {
        let dir = tempfile::tempdir().unwrap();
        let (s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        let _ = s;
        std::fs::write(blocks.join("blk00001.dat"), b"x").unwrap();
        std::fs::write(blocks.join("blk123456.dat"), b"x").unwrap();
        for name in ["blk00001.dat", "blk123456.dat"] {
            let got = resolve_blk_path(&blocks, Path::new(name)).unwrap();
            assert!(got.ends_with(name), "must resolve to the file itself");
        }
        // Absolute in-dir path resolves to the same canonical file.
        let abs = blocks.join("blk00001.dat");
        assert_eq!(resolve_blk_path(&blocks, &abs).unwrap(), abs);
    }

    #[test]
    fn traversal_names_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let (_s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        for evil in [
            "../evil.dat",
            "/etc/passwd",
            "blk.dat",
            "rev00001.dat",
            "xor.dat",
        ] {
            assert!(
                resolve_blk_path(&blocks, Path::new(evil)).is_err(),
                "must reject {evil:?}"
            );
        }
    }

    #[test]
    #[cfg(unix)]
    fn symlink_escape_rejected_inner_allowed() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let (_s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        // Escape: symlink inside blocks dir pointing outside.
        let outside = dir.path().join("outside.dat");
        std::fs::write(&outside, b"evil").unwrap();
        symlink(&outside, blocks.join("blk99999.dat")).unwrap();
        assert!(
            resolve_blk_path(&blocks, Path::new("blk99999.dat")).is_err(),
            "symlink escape must be rejected"
        );
        // Inner: real file plus a symlink to another in-dir file.
        std::fs::write(blocks.join("blk00003.dat"), b"real").unwrap();
        symlink(blocks.join("blk00003.dat"), blocks.join("blk00004.dat")).unwrap();
        assert!(
            resolve_blk_path(&blocks, Path::new("blk00004.dat")).is_ok(),
            "inner symlink must be allowed"
        );
    }

    #[test]
    fn second_process_file_run_inserts_nothing_new() {
        let dir = tempfile::tempdir().unwrap();
        let (mut s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        let b1 = block_bytes(1, 11, ZERO_HASH);
        let b2 = block_bytes(2, 22, &hash_of_framed(&b1));
        let mut bytes = b1;
        bytes.extend_from_slice(&b2);
        std::fs::write(blocks.join("blk00001.dat"), &bytes).unwrap();
        let n = s.process_file(Path::new("blk00001.dat")).unwrap();
        assert_eq!(n, 2);
        let calls_before = s.writer.inner.calls().len();
        // Resume offset is past EOF: second run scans nothing, inserts nothing.
        let n2 = s.process_file(&blocks.join("blk00001.dat")).unwrap();
        assert_eq!(n2, 0, "second run must insert nothing new");
        assert_eq!(s.writer.inner.calls().len(), calls_before);
        assert_eq!(s.state().last_height, 2);
        assert_eq!(s.state().last_file, "blk00001.dat");
        // Checkpoint = size-field offset + (size field + body) = exact EOF,
        // so a same-file resume seeks to the next record, not past it.
        assert_eq!(s.state().last_offset, bytes.len() as i64);
    }

    #[test]
    fn append_after_process_inserts_exactly_one_new_block() {
        // Regression: the old +4 overshoot made a same-file resume seek 4
        // bytes past the true EOF and miss the first appended block.
        let dir = tempfile::tempdir().unwrap();
        let (mut s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        let b1 = block_bytes(10, 11, ZERO_HASH);
        std::fs::write(blocks.join("blk00001.dat"), &b1).unwrap();
        assert_eq!(s.process_file(Path::new("blk00001.dat")).unwrap(), 1);
        assert_eq!(s.state().last_height, 10);
        assert_eq!(s.state().last_offset, b1.len() as i64);

        // Append a chained block and reprocess: exactly one new insert.
        let b2 = block_bytes(11, 22, &hash_of_framed(&b1));
        {
            use std::io::Write as _;
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(blocks.join("blk00001.dat"))
                .unwrap();
            f.write_all(&b2).unwrap();
        }
        let n2 = s.process_file(&blocks.join("blk00001.dat")).unwrap();
        assert_eq!(n2, 1, "appended block must be picked up on resume");
        assert_eq!(s.state().last_height, 11);
        assert_eq!(s.state().last_offset, (b1.len() + b2.len()) as i64);
        assert_eq!(s.state().last_file, "blk00001.dat");
    }

    #[test]
    fn same_height_different_hash_warns_and_keeps_both() {
        let dir = tempfile::tempdir().unwrap();
        // batch 1 so the tip checkpoint lands between the two blocks.
        let (mut s, blocks) = test_syncer(&dir, 1, FakeWriter::new());
        // Same height, different nonce => different hash. Unchained prevs so
        // the reorg warn path fires deterministically; both rows are kept.
        let mut bytes = block_bytes(5, 51, ZERO_HASH);
        bytes.extend_from_slice(&block_bytes(5, 52, ZERO_HASH));
        std::fs::write(blocks.join("blk00001.dat"), &bytes).unwrap();
        let n = s.process_file(Path::new("blk00001.dat")).unwrap();
        assert_eq!(n, 2, "both same-height blocks must be kept");
        let block_rows: Vec<usize> = s
            .writer
            .inner
            .calls()
            .iter()
            .zip(s.writer.inner.row_counts().iter())
            .filter(|(t, _)| t.as_str() == "blocks")
            .map(|(_, &c)| c)
            .collect();
        assert_eq!(block_rows, vec![1, 1], "each block flushed, none skipped");
        assert_eq!(s.state().last_height, 5);
    }

    #[test]
    fn catch_up_sorted_skips_seen_and_resumes() {
        let dir = tempfile::tempdir().unwrap();
        let (mut s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        // blk00002 holds a duplicate-height-2 (same bytes => same hash) + 3.
        let b1 = block_bytes(1, 11, ZERO_HASH);
        let b2 = block_bytes(2, 22, &hash_of_framed(&b1));
        let b3 = block_bytes(3, 33, &hash_of_framed(&b2));
        let mut f1 = b1.clone();
        f1.extend_from_slice(&b2);
        let mut f2 = b2.clone();
        f2.extend_from_slice(&b3);
        std::fs::write(blocks.join("blk00002.dat"), &f2).unwrap();
        std::fs::write(blocks.join("blk00001.dat"), &f1).unwrap();
        let n = s.catch_up().unwrap();
        assert_eq!(n, 3, "1 + 2 + 3, duplicate height-2 skipped");
        assert_eq!(s.state().last_height, 3);
        assert_eq!(s.state().last_file, "blk00002.dat");
        let block_rows: Vec<usize> = s
            .writer
            .inner
            .calls()
            .iter()
            .zip(s.writer.inner.row_counts().iter())
            .filter(|(t, _)| t.as_str() == "blocks")
            .map(|(_, &c)| c)
            .collect();
        assert_eq!(block_rows, vec![2, 1], "sorted files, dup skipped");
    }

    #[test]
    fn batch_blocks_honored() {
        let dir = tempfile::tempdir().unwrap();
        let (mut s, blocks) = test_syncer(&dir, 10, FakeWriter::new());
        let mut bytes = Vec::new();
        let mut prev = ZERO_HASH.to_string();
        for h in 1u32..=25 {
            let b = block_bytes(h, h, &prev);
            prev = hash_of_framed(&b);
            bytes.extend_from_slice(&b);
        }
        std::fs::write(blocks.join("blk00001.dat"), &bytes).unwrap();
        let n = s.process_file(Path::new("blk00001.dat")).unwrap();
        assert_eq!(n, 25);
        // 25 blocks at batch 10 -> 3 flushes x 8 tables.
        assert_eq!(s.writer.inner.calls().len(), 24);
        let block_rows: Vec<usize> = s
            .writer
            .inner
            .calls()
            .iter()
            .zip(s.writer.inner.row_counts().iter())
            .filter(|(t, _)| t.as_str() == "blocks")
            .map(|(_, &c)| c)
            .collect();
        assert_eq!(block_rows, vec![10, 10, 5]);
        assert_eq!(s.state().last_height, 25);
    }

    #[test]
    fn failed_flush_no_checkpoint_replays_on_restart() {
        let dir = tempfile::tempdir().unwrap();
        let blocks_dir = dir.path().join("blocks");
        std::fs::create_dir_all(&blocks_dir).unwrap();
        let mut bytes = block_bytes(1, 11, ZERO_HASH);
        let fb2 = block_bytes(2, 22, &hash_of_framed(&bytes));
        bytes.extend_from_slice(&fb2);
        std::fs::write(blocks_dir.join("blk00001.dat"), &bytes).unwrap();
        let state_path = dir.path().join("state.json");
        let utxo_path = dir.path().join("utxo.redb");
        {
            let utxo = UtxoStore::open(&utxo_path).unwrap();
            let mut s = Syncer::new(
                blocks_dir.clone(),
                state_path.clone(),
                SyncState::default(),
                utxo,
                ClickHouseWriter::new(FakeWriter::failing_at(1)),
                BATCH,
            );
            let res = s.process_file(Path::new("blk00001.dat"));
            assert!(res.is_err(), "flush failure must abort the file");
            // No UTXO apply, no checkpoint: batch replays on restart.
            assert_eq!(s.state().last_height, 0);
            assert_eq!(s.state().last_file, "");
            assert_eq!(s.state().last_offset, 0);
            assert_eq!(s.writer.inner.calls(), vec!["blocks".to_string()]);
        }
        // Restart: fresh syncer, same store path, good writer, replay succeeds.
        let utxo2 = UtxoStore::open(&utxo_path).unwrap();
        let mut s2 = Syncer::new(
            blocks_dir,
            state_path,
            SyncState::default(),
            utxo2,
            ClickHouseWriter::new(FakeWriter::new()),
            BATCH,
        );
        let n = s2.process_file(Path::new("blk00001.dat")).unwrap();
        assert_eq!(n, 2);
        assert_eq!(s2.state().last_height, 2);
    }

    #[test]
    fn run_catches_up_and_stops() {
        use std::sync::atomic::AtomicBool;
        use std::sync::Arc;
        let dir = tempfile::tempdir().unwrap();
        let (mut s, blocks) = test_syncer(&dir, BATCH, FakeWriter::new());
        let b1 = block_bytes(1, 11, ZERO_HASH);
        let mut bytes = b1.clone();
        bytes.extend_from_slice(&block_bytes(2, 22, &hash_of_framed(&b1)));
        std::fs::write(blocks.join("blk00001.dat"), &bytes).unwrap();
        s.poll_interval = Duration::from_millis(50);
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let h = std::thread::spawn(move || {
            s.run(&stop2).unwrap();
            s
        });
        std::thread::sleep(Duration::from_millis(300));
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let s = h.join().unwrap();
        assert_eq!(s.state().last_height, 2, "run must catch up before stop");
    }
}
