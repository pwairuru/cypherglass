# CypherGlass Onchain Metrics + ClickHouse Optimization — Design (2026-09-03)

## Context
Pipeline exists: Knots → JuiceFS → Go decoder → ClickHouse (`bitcoin.blocks`,
`transactions`, `outputs`, `inputs`, `addresses` + 3 MVs in `02_views.sql`).
All base tables `ReplacingMergeTree` on `s3_main`, ZSTD throughout, no
`PARTITION BY`, time-unfriendly `ORDER BY`, no input values / spend linkage.
Goal: explorer-parity BTC metric catalog (Bitcoin Magazine / IntoTheCryptoverse
style), every chart <500ms at block/hour/daily/weekly/monthly grains, with
compression/ordering/grouping tuned for S3. Rebuild allowed, re-sync OK.

Decisions locked: all families BTC-only; grains block+hour+daily+weekly+monthly;
price via Binance/Kraken OHLC ingest; <500ms SLO; approach A
(optimized base + projections + hierarchical MVs); ZSTD up to level 9.

## Decision 1 — Strategy: optimized base + projections + hierarchical MVs
Alternative B (flat wide daily fact) rejected: loses hourly/block grain, schema
change per metric. Alternative C (projections-only) rejected: misses <500ms on
realized/HODL/cohort scans. Chosen A: rebuild base for time pruning, projections
for point lookups, hourly MVs from base → daily marts from hourly, weekly/monthly
computed from daily at query time (<50k rows, no extra storage). Price-joined
metrics built as scheduled batch marts, not MVs (late-arriving price breaks MV
exactly-once).

## Section 1 — Metric catalog (70 metrics, 8 families)
Grains: B=block, H=hourly MV, D=daily mart, W/M=query on daily. Direct = base +
projection, fast enough. MV = pre-aggregated.

**1 Network/blocks (9):** height (B direct), block_count (H/D MV),
block_interval mean/median (H/D MV, `interval_sec` from decoder), block_size
mean/total (H/D MV), block_weight mean (H/D MV), tx_per_block mean (H/D MV),
difficulty (B direct + D MV avg), chainwork_delta (B direct), height-gap proxy
for orphans (B direct scan).
SQL pattern: `SELECT hour, countMerge(block_count), avgMerge(avg_size) ... FROM
mv_blocks_hourly GROUP BY hour`.

**2 Transactions (10):** tx_count (H/D), tx_rate (H derived), vin/vout per tx mean
(H/D), coinbase_count (H/D `is_coinbase=1`), OP_RETURN count (H/D via
`script_type='nulldata'`), SegWit share (`p2wpkh/p2wsh/p2tr` ratio, separate
`mv_script_hourly` by script_type), Taproot share (same), RBF proxy
(`sequence < 0xfffffffe` count, H/D), dust output share (<546 sat, H/D),
large tx count (>10 BTC, H/D via `total_out_sat` quantiles).
Direct per-tx lookup stays on base via `p_txid`.

**3 Fees/miner (9):** total_fees (H/D sum `fee_sat`), avg fee (H/D),
median fee (H/D `quantileState(0.5)`), fee_rate sat/vB mean/median (H/D,
decoder `fee_rate_sat_vbyte`), fee revenue share (fees/reward, batch mart),
block reward total (B direct `reward_sat`), subsidy check vs halving schedule
(B direct), Puell Multiple (daily revenue USD 365d MA ratio — price mart),
hashprice proxy (price mart).

**4 Mining/security (7):** hashrate proxy `difficulty*2^32/600` (D MV),
difficulty change % (D MV + retarget logic 2016 blocks), interval vs 600s target
(H/D), retarget countdown (B direct from height % 2016), issuance per block
(B direct subsidy), next halving estimate (B direct), empty block share
(tx_count==1, H/D).

**5 Addresses (12):** active/day (H/D `uniqMerge`), new/day (first_seen bucket,
D MV), total cumulative (D MV cumulative sum), net growth (D derived),
dust/shrimp/crab/fish/shark/whale/humpback buckets by `balance_sat`
(`<1k, <0.01, <0.1, <1, <10, <100, <1000, 1000+` BTC — `bucket` LowCardinality
materialized at insert, D MV counts), zero-balance churn (D MV), 30d retention
(weekly batch query on `p_seen`), top-100 concentration (daily batch, small scan
on addresses snapshot).

**6 Supply/realized (10):** circulating supply (D cumulative subsidy),
inflation annual % (D derived), realized cap (sum UTXO `value_sat * price_at_creation`
— daily batch mart, needs `inputs.value_sat` + price), MVRV (mart),
NUPL (mart), SOPR (spent output sale/creation price ratio — needs spend linkage
+ price, daily mart), HODL waves bands
(1d/1w/1m/3m/6m/1y/2y/3-5y/5y+ — `marts.hodl_daily` columns per band from
`spent_time IS NULL OR spent_time > day_end`), liveliness proxy (CDD / sum age),
1y+ vaulted supply (hodl mart derived). All price-joined = batch, never live.

**7 UTXO/lifespan (8):** utxo_count (D MV from outputs created minus spent),
utxo total value (D MV), avg utxo value (D derived), age distribution (hodl mart),
mean dormancy / CDD `sum(value*age_days)` (H/D MV from spend enrich),
ASOL/MSOL proxy (CDD / spent count), spent vs created ratio (H/D).

**8 Value/velocity (7):** total transfer sat (H/D sum `total_out_sat`),
adjusted transfer (exclude change: heuristic skip outputs where address in input
address set — batch H/D MV with decoder-assisted flag `is_change UInt8`),
avg/median tx value (H/D quantiles), velocity (transfer/supply, D derived),
NVT marketcap/transfer (price mart), NVT-signal 7d MA (price mart),
large-flow top-1% proxy (H/D quantiles, no labels v1).

Price tables: `bitcoin.price_ohlc_hourly/daily (source, symbol, ts, o/h/l/c,
volume)`, Binance primary + Kraken fallback in `source` column.

## Section 2 — Base rebuild
New tables as `*_v2`, atomic `EXCHANGE` after verification. All time tables
`PARTITION BY toYYYYMM(timestamp)`.

- `blocks_v2`: `ORDER BY (timestamp, height)`, add `reward_sat UInt64`,
  `fee_total_sat UInt64`, `interval_sec Int32`, `updated_at DateTime` as
  `ReplacingMergeTree(updated_at)` ver (current schema has no ver →
  nondeterministic dedup). Difficulty codec `Gorilla,ZSTD(6)`; hashes `ZSTD(6)`.
- `transactions_v2`: `ORDER BY (timestamp, block_height, txid)`, add
  `input_total_sat UInt64`, `fee_rate_sat_vbyte Float32`, `is_change_heavy UInt8`
  heuristic flag. Monthly partition.
- `outputs_v2`: `ORDER BY (timestamp, block_height, txid, output_index)`, add
  `spent_height UInt32 DEFAULT 0`, `spent_time DateTime DEFAULT toDateTime(0)`.
  Enables age/CDD/HODL without self-join.
- `inputs_v2`: `ORDER BY (timestamp, block_height, txid, input_index)`, add
  `value_sat UInt64` (decoder UTXO-map fill; unlocks SOPR/realized/adjusted
  transfer). This is the single highest-value enrichment.
- `addresses_v2`: keep `ORDER BY address`, add `bucket LowCardinality(String)`
  materialized at insert + projection `p_seen (last_seen_time, bucket)`.
- `price_ohlc_hourly/daily`: `ORDER BY (source, symbol, ts)`,
  `ReplacingMergeTree(ts)`, OHLC `Gorilla,ZSTD(9)`, volume `T64,ZSTD(9)`.
- Base codec level 6 (one-time rebuild, S3 PUT savings beat CPU), decoder
  backfill batches 100 blocks to amortize. Global `compression` max case level 9.

## Section 3 — Projections
Built after backfill (`ADD PROJECTION` + `MATERIALIZE`), `compress_primary_key=1`:
- blocks: `p_height (height)`, `p_hash` Bloom on `(hash, prev_hash, merkle_root)`.
- transactions: `p_block (block_height, txid)`, `p_txid` Bloom on `txid`,
  `p_fee (fee_rate_sat_vbyte)` minmax.
- outputs: `p_addr_time (address, timestamp)` (address history without MV),
  `p_spend (spending_txid, spent_height)`, `p_value (value_sat)` minmax
  (whale/dust filters).
- inputs: `p_prev (prev_txid, prev_output_index)` (UTXO/SOPR join),
  `p_block (block_height, txid)`.
- addresses: `p_seen (last_seen_time, bucket)`, `p_balance (balance_sat)` minmax.

## Section 4 — MV hierarchy
Drop existing 3 MVs (store `-State` with no `-Merge` reader, no partition).
New hourly MVs `PARTITION BY toYYYYMM(hour)`, `ORDER BY hour` single-key:

- `mv_blocks_hourly`: `countState, avgState(size/weight/tx_count/interval),
  avgState(difficulty), sumState(reward/fee_total)`.
- `mv_tx_fee_hourly`: `countState, sumState(fee_sat/input_total/total_out),
  quantileState(0.5,0.9,0.99)(fee_sat, fee_rate, total_out), sumState(vin/vout),
  countStateIf(coinbase/empty/RBF/dust/large)`.
- `mv_script_hourly`: `GROUP BY (hour, script_type)` with `countState/sumState`.
- `mv_addr_hourly`: `uniqState(address), uniqStateIf(new),
  groupBitmapState? no — plain uniq`.
- `mv_flow_hourly`: `sumState(transfer/adjusted/CDD), countState(created/spent)`.

Daily marts from hourly with `-Merge` re-aggregation
(`mv_blocks_daily`, `mv_tx_fee_daily`, `mv_addr_daily`, `mv_flow_daily`,
`ORDER BY day`). Weekly/monthly = `SELECT ... FROM *_daily ... GROUP BY
toStartOfWeek/Month` (no extra MVs). Price-joined marts
(`marts.realized_daily/sopr_daily/mvrv_nupl_daily/puell_daily/hodl_daily`)
via Refreshable MV / Celery beat hourly `INSERT-SELECT` with date param; same
SQL used for backfill.

## Section 5 — Compression / ordering / grouping
- Monotonic ints: `Delta(4),ZSTD(6)` base, `ZSTD(9)` marts. Timestamps:
  `DoubleDelta,ZSTD(6/9)`. Small ints: `T64,ZSTD(6)`. Floats:
  `Gorilla,ZSTD(6/9)` (beats T64 on series). Hashes/hex: `ZSTD(6)` only (high
  level wasted on entropic hex). Low-cardinality: `LowCardinality(...)`.
  Address stays `String ZSTD(6)` (too high cardinality for dict).
- MVs single-key `ORDER BY time_bucket`, `GROUP BY` same key only; cohort splits
  (bucket, script_type) get separate MVs, never extra GROUP keys (preserves
  `-Merge` rollup). Levels: hourly `ZSTD(7)`, daily marts + price `ZSTD(9)`.
- S3: keep `s3_main`; `min_bytes_for_wide_part=0`, `parts_to_throw_insert=1`
  (fewer PUTs); decoder `async_insert=1, wait_for_async_insert=0`. Marks
  `index_granularity=8192`. No TTL v1 (full history needed).

## Section 6 — Backfill / ingest / validation / API
- Decoder enrich before resync: in-memory UTXO map (chunked 100k-block windows,
  spill to Valkey/RocksDB on pressure) fills `inputs.value_sat`, spend linkage,
  fee/fee_rate, block reward/interval. Keep `STATE_FILE` resume format.
- Price ingest: Celery beat `price_ohlc_hourly` (Binance klines, Kraken fallback);
  historical bulk CSV 2010→now, dedup by ver.
- Order: `01_schema` v2 → decoder resync → `MATERIALIZE PROJECTION` → hourly MV
  autofill → daily `INSERT-SELECT` full history → price marts refresh → `FINAL`
  + `OPTIMIZE ... FINAL` once → dual-run verify → `EXCHANGE TABLES`.
- Validation: `blocks == headers` count; `sum(fee)==reward-fee_total` spot;
  golden checks (halving heights, known difficulty); `EXPLAIN` + timed query per
  metric for 30d/1y ranges asserting <500ms; S3 bytes before/after recorded.
- API: `GET /metrics/{id}/series` allowlist reads hourly/daily/marts only, never
  base. Price gaps → `NULL` points + `stale:true`, no interpolation. Old tables
  kept until new stack verified.

## Testing
Backend pytest: metric-id allowlist shape, series shape `{points:[{t,v}], unit}`,
price-stale flag, mocked CH. Manual: per-metric 30d + 1y chart loads <500ms from
CH query log. Decoder Go tests: UTXO-map spend linkage, fee_rate math, subsidy
schedule vectors.
