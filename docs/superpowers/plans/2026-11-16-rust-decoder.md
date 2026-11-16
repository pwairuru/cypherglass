# Rust Decoder Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Go block decoder as a single Rust binary with identical tables and ops interface, plus batched inserts, disk-backed UTXO, and measured speed/CPU/RAM/binary improvements.

**Architecture:** One `decoder` binary: `parser` (magic scan, XOR, `bitcoin`-crate deserialization) → `enrich` (subsidy, fees, addresses) → `utxo` (`redb`) → `ch` (8 batched inserts, all-OK-then-checkpoint) → `syncer` (catch-up + notify/poll watch). `DbWriter` trait keeps ClickHouse fakeable in tests.

**Tech Stack:** Rust 2021+, tokio 1, notify 6, clickhouse 0.11, bitcoin 0.32, redb 2, serde/serde_json 1, tracing 0.1, anyhow 1, hex 0.4 (musl release, stripped).

**Spec:** `docs/superpowers/specs/2026-11-16-rust-decoder-design.md`

## Global Constraints

- Mainnet only v1: magic bytes `f9 be b4 d9`, 8 MiB record cap (`8 << 20`), never allocate on forged length.
- Block path guard regex `^blk[0-9]+\.dat$`, symlink resolution + dir containment, reject-before-open.
- DB name regex `^[A-Za-z_][A-Za-z0-9_]{0,63}$`, interpolated only after validation; values stay bound.
- Env defaults: `CLICKHOUSE_HOST=clickhouse`, `CLICKHOUSE_PORT=8123` (HTTP; Go used native `9000`), `CLICKHOUSE_USER=bitcoin`, `CLICKHOUSE_PASSWORD=bitcoin_clickhouse`, `CLICKHOUSE_DATABASE=bitcoin`, `BLOCKS_DIR=/data/bitcoin/blocks`, `STATE_FILE=/data/decoder_state.json`, `UTXO_DB=<STATE_FILE dir>/utxo.redb`, `BATCH_BLOCKS=10`, poll `10 s`, CH reconnect backoff `5 s`.
- Column counts: blocks 13, transactions 13, outputs 10, inputs 9, blocks_v2 17, transactions_v2 17, outputs_v2 13, inputs_v2 11; field order matches Go `Append` order in `client.go` / `client_v2.go`.
- State file `0600`, atomic tmp+rename; v1 (Go, no version) migrates with `.bak` copy first.
- Flush protocol: all-8-OK with durable ack → redb commit → state save; any error = no checkpoint.
- Binary name stays `decoder`; Go sources move to `decoder/legacy-go/` at cutover; compose files unchanged.
- Go code is never deleted in this plan: Go baseline must be committed before the move, the move is `git mv` (history preserved), and `legacy-go/` removal happens only after Rust is production-ready (separate future change, not this plan).

## Review Focus

- Truncated `blk` mid-record (EOF after magic/size/partial body) stops cleanly with no panic and resume offset unchanged.
- Corrupt state JSON, negative offset, or hostile `LastFile` resumes clean with warning, never panics.
- Watcher events for symlink escapes or non-`blk` names are rejected before open.
- UTXO miss (pre-cutover parent) writes value 0 with miss counter, fee undercounts but never wraps negative.
- Reorg (same height, different hash) warns and keeps both rows with no auto-delete and no checkpoint skip.

---
## File Structure

- `decoder/Cargo.toml` — binary crate `decoder`, deps above, musl profile (`opt-level=3`, `strip=true`).
- `decoder/src/config.rs` — `Config::from_env()`, `valid_db_name()`, single-variant `network` hook.
- `decoder/src/state.rs` — `SyncState`, `load_state()`, `save_state_atomic()`; owns migration + validation.
- `decoder/src/parser.rs` — magic scan, XOR, block/tx parse, height, clamp/saturate, weight/vsize.
- `decoder/src/address.rs` + `src/enrich.rs` — script classification, subsidy, fee-rate, bucket, change-heavy.
- `decoder/src/utxo.rs` — `redb`-backed `UtxoStore`.
- `decoder/src/ch.rs` — row structs (exact field order), `DbWriter` trait, `ClickHouseWriter::flush()`, `FakeWriter`.
- `decoder/src/syncer.rs` — listing, path guard, catch-up, watch+poll, checkpoints.
- `decoder/src/main.rs` — wiring, retry connect, signal shutdown, flush-on-exit.
- `decoder/Dockerfile` — rust-alpine builder (musl) → alpine:3.20 runtime, non-root `decoder`, same ENTRYPOINT/HEALTHCHECK.
- `scripts/bench_decoder.sh` — Go-vs-Rust fixture benchmark; report at `docs/superpowers/reports/2026-11-16-rust-decoder-benchmark.md`.

### Task 1: Scaffolding, config, state

**Files:**
- Create: `decoder/Cargo.toml`, `decoder/src/main.rs`, `decoder/src/config.rs`, `decoder/src/state.rs`
- Test: inline `#[cfg(test)]` in `config.rs`, `state.rs`

**Interfaces:**
- Consumes: none.
- Produces: `Config::from_env() -> Config`, `valid_db_name(&str) -> bool`, `SyncState { version: u8, last_height: u32, last_file: String, last_offset: i64 }`, `load_state(&Path) -> SyncState`, `save_state_atomic(&Path, &SyncState) -> Result<()>`.

- [ ] **Step 1: Write failing tests** for db-name guard and state migration in `config.rs` / `state.rs`:
```rust
#[test]
fn rejects_injection_db_name() {
    assert!(!valid_db_name("bitcoin; DROP TABLE x"));
    assert!(valid_db_name("bitcoin"));
}
#[test]
fn migrates_go_state_with_backup() {
    // write Go-format {"last_height":800000,...} with no version, load, expect version==2 and .bak exists
}
#[test]
fn corrupt_state_resumes_clean() {
    // garbage bytes + negative offset + hostile LastFile "../evil.dat" -> zero state, no panic
}
```
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder config:: state::` Expected: FAIL, module(s) not defined.
- [ ] **Step 3: Implement** `Config::from_env`, `valid_db_name` (exact regex), `SyncState` + migrate/validate/save (atomic tmp+rename, `0600`).
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder` Expected: PASS. Also `cargo clippy -- -D warnings`, `cargo fmt --check`.
- [ ] **Step 5: Commit.** `git add decoder/Cargo.toml decoder/src && git commit -m "feat: decoder-rs config and versioned state"`

### Task 2: Parser core

**Files:**
- Create: `decoder/src/parser.rs`
- Test: inline `#[cfg(test)]` in `parser.rs` (synthetic blocks built with `bitcoin` crate, serialized + framed)

**Interfaces:**
- Consumes: none (pure).
- Produces: `MAINNET_MAGIC: [u8; 4]`, `MAX_BLOCK_SIZE: usize`, `XorDeobfuscator::deobfuscate(&self, buf: &mut [u8], offset: u64)`, `scan_blocks(path: &Path, file_num: u32, start_offset: u64, deob: Option<&XorDeobfuscator>, cb: &mut dyn FnMut(BlockScan) -> Result<()>) -> Result<()>`, `ParsedBlock { height: u32, hash: String, timestamp: u32, version: i32, bits: u32, nonce: u32, merkle_root: String, prev_hash: String, txs: Vec<ParsedTx> }` with `ParsedTx/ParsedInput/ParsedOutput` mirroring Go fields.

- [ ] **Step 1: Write failing tests:** oversize `0xFFFFFFFF` record skipped with zero callbacks; negative output clamped to 0 with total intact; truncated body stops cleanly with offset unchanged; XOR roundtrip; BIP34 height read.
```rust
#[test]
fn skips_forged_length_without_alloc() { /* magic + 0xFFFFFFFF + trailing magic, expect 0 callbacks, Ok(()) */ }
#[test]
fn clamps_negative_output() { /* tx with -100 sat output -> ValueSat 0, total excludes it */ }
#[test]
fn truncated_record_stops_clean() { /* magic+size, body cut short -> Ok, no callback, offset unchanged */ }
```
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder parser::` Expected: FAIL.
- [ ] **Step 3: Implement** scan loop (seek, magic resync 1 byte, cap check, deobfuscate at offset) + `bitcoin`-crate deserialization + clamp/saturate + BIP-141 weight/vsize + coinbase height.
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder parser::` Expected: PASS.
- [ ] **Step 5: Commit.** `git add decoder/src/parser.rs && git commit -m "feat: decoder-rs blk parser with DoS caps"`

### Task 3: Address extraction and enrich math

**Files:**
- Create: `decoder/src/address.rs`, `decoder/src/enrich.rs`
- Test: inline `#[cfg(test)]` in both

**Interfaces:**
- Consumes: `ParsedTx` shape from Task 2.
- Produces: `extract_address(script: &[u8]) -> (String, String)`, `subsidy_at(height: u32) -> u64`, `fee_rate(fee_sat: i64, vsize: u32) -> f32`, `bucket_for(balance_sat: i64) -> &'static str`, `change_heavy(addrs: &[String]) -> u8`.

- [ ] **Step 1: Write failing tests** with golden vectors:
```rust
#[test]
fn genesis_p2pkh_vector() {
    let script = hex::decode("76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f188ac").unwrap();
    let (addr, typ) = extract_address(&script);
    assert_eq!(addr, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    assert_eq!(typ, "pubkeyhash");
}
#[test]
fn subsidy_schedule() {
    assert_eq!(subsidy_at(0), 5_000_000_000);
    assert_eq!(subsidy_at(210_000), 2_500_000_000);
    assert_eq!(subsidy_at(840_000), 312_500_000);
}
#[test]
fn fee_rate_and_buckets() {
    assert_eq!(fee_rate(1000, 250), 4.0);
    assert_eq!(bucket_for(500), "dust");
    assert_eq!(bucket_for(150_000_000_000), "whale");
}
```
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder address:: enrich::` Expected: FAIL.
- [ ] **Step 3: Implement** via `bitcoin::Address::from_script` (mainnet) + type strings matching Go `txscript` names; subsidy shift, fee division, bucket bounds, duplicate-address change flag.
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder` Expected: PASS.
- [ ] **Step 5: Commit.** `git add decoder/src/address.rs decoder/src/enrich.rs && git commit -m "feat: decoder-rs addresses and enrich math"`

### Task 4: Disk-backed UTXO store

**Files:**
- Create: `decoder/src/utxo.rs`
- Test: inline `#[cfg(test)]` (tempfile dir, reopen persistence)

**Interfaces:**
- Consumes: none.
- Produces: `UtxoStore::open(path: &Path) -> Result<Self>`, `put(&self, txid: &str, vout: u32, value: u64) -> Result<()>`, `get(&self, txid: &str, vout: u32) -> Result<Option<u64>>`, `delete(&self, txid: &str, vout: u32) -> Result<()>`, `len(&self) -> u64`, `misses(&self) -> u64`.

- [ ] **Step 1: Write failing tests:**
```rust
#[test]
fn put_get_delete_survives_reopen() { /* put, close, reopen, get == Some, delete, get == None */ }
#[test]
fn miss_returns_none() { /* unknown key -> None, misses() increments */ }
```
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder utxo::` Expected: FAIL.
- [ ] **Step 3: Implement** single `redb` table `utxo` keyed `"{txid}:{vout}"` → `u64`; one write txn per batch caller (no per-op fsync beyond redb default); in-process miss counter.
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder utxo::` Expected: PASS.
- [ ] **Step 5: Commit.** `git add decoder/src/utxo.rs && git commit -m "feat: decoder-rs persistent UTXO store"`

### Task 5: ClickHouse writer with batched flush

**Files:**
- Create: `decoder/src/ch.rs`
- Test: inline `#[cfg(test)]` with `FakeWriter` (no live CH)

**Interfaces:**
- Consumes: `ParsedBlock`, `UtxoStore`, `subsidy_at/fee_rate/change_heavy` from Tasks 2–4.
- Produces: row structs per table in exact Go `Append` field order, `trait DbWriter`, `ClickHouseWriter::flush(&self, batch: &BlockBatch) -> Result<FlushStats>`, `FakeWriter` (records batches, injectable failure at table N).

- [ ] **Step 1: Write failing tests:**
```rust
#[test]
fn v2_column_counts() { assert_eq!(BLOCKS_V2_COLS, 17); assert_eq!(TXS_V2_COLS, 17); assert_eq!(OUTPUTS_V2_COLS, 13); assert_eq!(INPUTS_V2_COLS, 11); }
#[test]
fn miss_writes_zero_with_counter() { /* prefill UTXO minus one parent -> input value 0, misses 1, fee not wrapped */ }
#[test]
fn failed_table_aborts_flush() { /* FakeWriter fails on 5th table -> flush Err, caller must not checkpoint */ }
```
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder ch::` Expected: FAIL.
- [ ] **Step 3: Implement** row builders (same derivations as `client.go`/`client_v2.go`, `spent_time` epoch, `updated_at` now UTC) + sequential 8-batch flush with `wait_for_async_insert=1`.
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder ch::` Expected: PASS.
- [ ] **Step 5: Commit.** `git add decoder/src/ch.rs && git commit -m "feat: decoder-rs batched ClickHouse writer"`

### Task 6: Syncer (catch-up, watch, checkpoints)

**Files:**
- Create: `decoder/src/syncer.rs`
- Test: inline `#[cfg(test)]` (tempfile dirs, `FakeWriter`, synthetic `blk*.dat` from Task 2 helper)

**Interfaces:**
- Consumes: all Tasks 1–5 interfaces.
- Produces: `list_blk_files(dir: &Path) -> Result<Vec<String>>`, `resolve_blk_path(blocks_dir: &Path, path: &Path) -> Result<PathBuf>`, `Syncer::process_file()`, `Syncer::catch_up()`, watch+poll loop honoring `BATCH_BLOCKS`.

- [ ] **Step 1: Write failing tests:** valid names resolve; traversal list (`../evil.dat`, `/etc/passwd`, `blk.dat`, `rev00001.dat`, `xor.dat`) rejected; symlink escape rejected, inner symlink allowed; second `process_file` run inserts nothing new; same-height different-hash warns and keeps both.
- [ ] **Step 2: Run to verify they fail.** Run: `cargo test -p decoder syncer::` Expected: FAIL.
- [ ] **Step 3: Implement** sorted catch-up, resume offsets, skip-seen heights, reorg warn, `notify` watcher + 10 s poll, per-flush checkpoint protocol from Task 5, checkpoint every 1000 + EOF.
- [ ] **Step 4: Run to verify pass.** Run: `cargo test -p decoder` Expected: PASS (full suite).
- [ ] **Step 5: Commit.** `git add decoder/src/syncer.rs && git commit -m "feat: decoder-rs syncer with watch and resume"`

### Task 7: Binary, Docker, integration, benchmark report

**Files:**
- Modify: `decoder/src/main.rs`, `decoder/Dockerfile`
- Create: `scripts/bench_decoder.sh`, `docs/superpowers/reports/2026-11-16-rust-decoder-benchmark.md`
- Test: `cargo test -p decoder` full suite + live integration vs ephemeral ClickHouse (all 8 tables row counts + spot values)

**Interfaces:**
- Consumes: all Tasks 1–6.
- Produces: working `decoder` binary + image + benchmark report table (`metric | Go | Rust | Δ`: wall time, CPU user+sys, max RSS via `/usr/bin/time -v`, binary bytes stripped + unstripped; Go baseline today: `decoder/decoder` = 16,453,222 bytes).

- [ ] **Step 1: Write failing integration test** asserting one synthetic block lands exactly one `blocks`/`blocks_v2` row and matching tx/output/input counts via `FakeWriter` (live-CH variant gated behind `CH_TEST_ADDR`).
- [ ] **Step 2: Run to verify it fails.** Run: `cargo test -p decoder --test '*'` / `cargo test -p decoder integration` Expected: FAIL (wiring absent).
- [ ] **Step 3: Implement** `main.rs` (env, infinite CH retry, signal context, flush-on-shutdown), musl `Dockerfile`, `bench_decoder.sh` (same fixture both binaries, records `time -v`, `ls -l`, fixture sha256, host info).
- [ ] **Step 4: Verify everything:** `cargo test -p decoder`, `cargo clippy -- -D warnings`, `cargo fmt --check`, `scripts/bench_decoder.sh` → fill report table with measured numbers only.
- [ ] **Step 5: Commit.** `git add decoder/src/main.rs decoder/Dockerfile scripts/bench_decoder.sh docs/superpowers/reports/2026-11-16-rust-decoder-benchmark.md && git commit -m "feat: decoder-rs binary, image, benchmarks"`
