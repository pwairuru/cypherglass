# Rust Decoder Benchmark Report — 2026-11-16

Method: `scripts/bench_decoder.sh`. Same synthetic `blk00001.dat` fixture for
both binaries (300 chained blocks, 1 coinbase + 1 spend each, generated
in-script, sha256 pinned below). Release binaries only: Rust
`cargo build --release` (workspace `opt-level=3`, `strip=true`); Go plain
`go build` from `decoder/legacy-go/` (release-equivalent, no `-gcflags`
debug flags). Wall time = sync-poll loop (both binaries watch forever, so
SIGTERM ends the run after all rows are visible); CPU user+sys and max RSS
via `/usr/bin/time -v`; binary bytes via `ls -l` (stripped + unstripped);
row counts verified after each run (`blocks` = 300, `transactions` = 600,
`max(height)` = 300 on both sides).

## Results

| metric | Go | Rust | delta |
|---|---|---|---|
| wall | 4.05 s | 8.05 s | Rust +98.9% (~2.0x slower) |
| cpu user+sys (s) | 0.51 + 0.42 = 0.93 | 0.05 + 0.02 = 0.07 | Rust −92.5% (~13x less CPU) |
| max RSS (kB) | 18264 | 9360 | Rust −48.8% (~half the RAM) |
| binary stripped (B) | 11940002 | 3625352 | Rust −69.6% (~3.3x smaller) |
| binary unstripped (B) | 16528513 | 9097064 | Rust −45.0% |

Fixture sha256:
`151aa2cfbdfa98357be94402dc3276e005b20074cd33f7ec7d818d70766c9501`
(`blk00001.dat`, 69600 bytes)

Host: `Linux turi-a-mumbi 7.0.0-43-generic x86_64 GNU/Linux`, 8 CPUs,
32 GB RAM, ClickHouse server 26.7.3.19 (local, same instance for both runs).

Reference: the Go baseline binary measured earlier was 16,453,222 bytes;
today's `go build` (unstripped) in `golang:1.26-alpine` measured 16,528,513
bytes — same order, toolchain/env variance. All numbers above are from one
`bench_decoder.sh` run (artifacts under `/tmp/decoder-bench-sVlcMm`);
re-run with `BENCH_DIR`/`KEEP=1` to reproduce.

## Reading the numbers

The wall-time result cuts against the naive "Rust is faster" story and is
reported as measured. Likely causes (hypotheses, not profiled):

- Durability is not equal: the Rust writer attaches
  `async_insert=1, wait_for_async_insert=1` (server acks after the async
  batch is durable, Task 5 contract), while the Go client uses
  fire-and-forget `wait_for_async_insert=0`. Wall time on the Rust side is
  dominated by waiting on the server, not by local work — consistent with
  13x less CPU and half the RSS.
- `UtxoStore` commits one redb transaction per `put`/`delete` (up to 3 per
  block here); each commit fsyncs. Batching those commits is future work
  (Task 4 territory), not this task.
- The `insert::<T>` call in the `clickhouse` crate performs a metadata
  roundtrip per table batch on top of the insert itself.

CPU, RSS, and binary size all favor Rust decisively; wall time on this
small local fixture favors Go under the current durability settings. The
decision-relevant question for cutover is which durability setting
production wants — the comparison above is apples-to-oranges on fsync
semantics, stated here so the decision is made with eyes open.

## BIP34 height acceptance (parity-vs-correctness)

The release binary was run over a synthetic chain whose coinbase carries a
realistic BIP34 scriptSig (`03 00 35 0c aa bb`, true height 800000). The
emitted `blocks.height` is **204800003** — the Go-parity value
(`LE(03 00 35 0c) = 0x0C350003`), NOT the true height 800000. The same value
is pinned by the `bip34_coinbase_height_go_parity` integration test (and by
the Task 2 parser vector). FLAG: wherever the BIP34 push opcode is nonzero,
Rust heights match Go byte-for-byte but disagree with true mainnet heights.
Opcode-aware parsing would be MORE correct and would DIVERGE from Go. This
is a controller decision: keep parity (current) or fix both (separate
change, needs backfill thinking).
