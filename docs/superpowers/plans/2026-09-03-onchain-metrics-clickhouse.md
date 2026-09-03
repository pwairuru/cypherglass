# Onchain Metrics ClickHouse Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ClickHouse base tables with time partitioning/ordering and ZSTD up to 9, enrich decoder with input values and spend linkage, add projections plus hourly-to-daily MV hierarchy and price OHLC ingest, expand backend metric allowlist, verify E2E with passing tests.

**Architecture:** New `*_v2` tables alongside existing tables, atomic EXCHANGE after verification; hourly AggregatingMergeTree MVs from base feed daily marts via -Merge; weekly/monthly computed from daily at query time; price-joined metrics as scheduled batch marts; decoder fills value_sat, spent linkage, fee_rate, reward before resync.

**Tech Stack:** ClickHouse 26.7 SQL, Go 1.26 (btcd, clickhouse-go v2.46.0), Python 3.12 FastAPI SQLModel clickhouse-connect Celery Valkey, pytest, Binance/Kraken REST.

**Spec:** docs/superpowers/specs/2026-09-03-onchain-metrics-clickhouse-design.md

## Global Constraints

- BTC-only, no altcoin logic.
- Grains: block + hourly + daily materialized, weekly/monthly computed from daily at query time.
- Chart SLO <500ms for 30d and 1y ranges against daily/hourly/marts, never base.
- ZSTD levels: base ZSTD(6), hourly ZSTD(7), daily marts and price ZSTD(9); global compression max case level 9.
- Rebuild allowed: new `*_v2` tables, atomic EXCHANGE only after verification, old tables kept until then.
- Price gaps return NULL points plus stale:true, no interpolation.
- Every task ends with passing tests and a commit; no placeholders.

---

## File structure

- `clickhouse/init/03_schema_v2.sql` — v2 base tables (blocks/transactions/outputs/inputs/addresses) plus price_ohlc_hourly/daily. Monthly PARTITION, time-first ORDER BY, new enrich columns, ver column for ReplacingMergeTree.
- `clickhouse/init/04_projections.sql` — ALTERs adding named projections per table, materialized after backfill.
- `clickhouse/init/05_mvs.sql` — DROP old 3 MVs, create hourly MVs from v2 base plus daily marts from hourly with -Merge.
- `clickhouse/init/06_marts.sql` — price-joined batch mart tables (realized/sopr/mvrv_nupl/puell/hodl) plus refresh INSERT-SELECT statements.
- `clickhouse/config.xml` — S3 tuning plus compression level 9 case.
- `decoder/internal/enrich/utxo.go` — in-memory UTXO map with chunked windows, spend linkage lookup.
- `decoder/internal/enrich/subsidy.go` — halving subsidy schedule, reward and fee_rate math.
- `decoder/internal/enrich/*_test.go` — Go unit tests with golden vectors.
- `decoder/internal/clickhouse/client.go` — updated INSERT column lists for v2 tables.
- `backend/app/metrics/registry.py` — expanded allowlist (hourly/daily/mart SQL, -Merge readers, weekly/monthly from daily).
- `backend/app/metrics/service.py` — stale flag on NULL/empty price gaps.
- `backend/app/workers/price.py` — Binance klines fetch with Kraken fallback, hourly upsert.
- `backend/tests/test_ch_schema.py` — SQL content tests for 03/04/05/06 files.
- `backend/tests/test_metrics_catalog.py` — registry allowlist and series shape tests.
- `backend/tests/test_price.py` — price fetch fallback and upsert SQL tests.
- `scripts/e2e_onchain.py` — E2E harness: compose up clickhouse, apply SQL, insert synthetic chain, check MVs and API latency.

---
### Task 1: v2 base schema plus price tables

**Files:**
- Create: `clickhouse/init/03_schema_v2.sql`
- Create: `backend/tests/test_ch_schema.py`
- Modify: `clickhouse/config.xml:30-35`

**Interfaces:**
- Consumes: existing `clickhouse/init/01_schema.sql` column names (must keep all old columns, only add).
- Produces: tables `bitcoin.blocks_v2`, `transactions_v2`, `outputs_v2`, `inputs_v2`, `addresses_v2`, `price_ohlc_hourly`, `price_ohlc_daily`; config max ZSTD 9.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ch_schema.py
from pathlib import Path

SQL = Path("clickhouse/init/03_schema_v2.sql").read_text()

def test_v2_partitions_order_and_codecs():
    assert "PARTITION BY toYYYYMM(timestamp)" in SQL
    assert "ORDER BY (timestamp, height)" in SQL
    assert "ORDER BY (timestamp, block_height, txid)" in SQL
    assert "value_sat UInt64" in SQL
    assert "spent_height UInt32" in SQL
    assert "reward_sat UInt64" in SQL
    assert "fee_rate_sat_vbyte Float32" in SQL
    assert "ZSTD(6)" in SQL
    assert "ZSTD(9)" in SQL
    assert "ReplacingMergeTree(updated_at)" in SQL

def test_price_tables():
    assert "price_ohlc_hourly" in SQL
    assert "price_ohlc_daily" in SQL
    assert "ORDER BY (source, symbol, ts)" in SQL
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py -v`
Expected: FAIL with "03_schema_v2.sql does not exist".

- [ ] **Step 3: Write minimal implementation**

```sql
-- clickhouse/init/03_schema_v2.sql
CREATE DATABASE IF NOT EXISTS bitcoin;

CREATE TABLE IF NOT EXISTS bitcoin.blocks_v2 (
    height UInt32 CODEC(Delta(4), ZSTD(6)),
    hash String CODEC(ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    size UInt32 CODEC(Delta(4), ZSTD(6)),
    weight UInt32 CODEC(Delta(4), ZSTD(6)),
    version UInt32 CODEC(T64, ZSTD(6)),
    bits UInt32 CODEC(T64, ZSTD(6)),
    nonce UInt32 CODEC(T64, ZSTD(6)),
    merkle_root String CODEC(ZSTD(6)),
    prev_hash String CODEC(ZSTD(6)),
    tx_count UInt16 CODEC(T64, ZSTD(6)),
    difficulty Float64 CODEC(Gorilla, ZSTD(6)),
    chainwork String CODEC(ZSTD(6)),
    reward_sat UInt64 CODEC(T64, ZSTD(6)),
    fee_total_sat UInt64 CODEC(T64, ZSTD(6)),
    interval_sec Int32 CODEC(T64, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, height)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.transactions_v2 (
    txid String CODEC(ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    block_hash String CODEC(ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    version UInt32 CODEC(T64, ZSTD(6)),
    locktime UInt32 CODEC(T64, ZSTD(6)),
    size UInt32 CODEC(Delta(4), ZSTD(6)),
    weight UInt32 CODEC(Delta(4), ZSTD(6)),
    vin_count UInt16 CODEC(T64, ZSTD(6)),
    vout_count UInt16 CODEC(T64, ZSTD(6)),
    is_coinbase UInt8 CODEC(T64, ZSTD(6)),
    total_out_sat UInt64 CODEC(T64, ZSTD(6)),
    input_total_sat UInt64 CODEC(T64, ZSTD(6)),
    fee_sat Int64 CODEC(T64, ZSTD(6)),
    fee_rate_sat_vbyte Float32 CODEC(Gorilla, ZSTD(6)),
    is_change_heavy UInt8 CODEC(T64, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.outputs_v2 (
    txid String CODEC(ZSTD(6)),
    output_index UInt16 CODEC(T64, ZSTD(6)),
    value_sat UInt64 CODEC(T64, ZSTD(6)),
    script_pubkey_hex String CODEC(ZSTD(6)),
    script_type LowCardinality(String),
    address String CODEC(ZSTD(6)),
    spent UInt8 CODEC(T64, ZSTD(6)),
    spending_txid String CODEC(ZSTD(6)),
    spent_height UInt32 CODEC(Delta(4), ZSTD(6)),
    spent_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid, output_index)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.inputs_v2 (
    txid String CODEC(ZSTD(6)),
    input_index UInt16 CODEC(T64, ZSTD(6)),
    prev_txid String CODEC(ZSTD(6)),
    prev_output_index UInt32 CODEC(T64, ZSTD(6)),
    value_sat UInt64 CODEC(T64, ZSTD(6)),
    script_sig_hex String CODEC(ZSTD(6)),
    sequence UInt32 CODEC(T64, ZSTD(6)),
    coinbase_data String CODEC(ZSTD(6)),
    block_height UInt32 CODEC(Delta(4), ZSTD(6)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, block_height, txid, input_index)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.addresses_v2 (
    address String CODEC(ZSTD(6)),
    bucket LowCardinality(String),
    first_seen_block UInt32 CODEC(Delta(4), ZSTD(6)),
    first_seen_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    last_seen_block UInt32 CODEC(Delta(4), ZSTD(6)),
    last_seen_time DateTime CODEC(DoubleDelta, ZSTD(6)),
    total_received_sat UInt64 CODEC(T64, ZSTD(6)),
    total_sent_sat UInt64 CODEC(T64, ZSTD(6)),
    balance_sat Int64 CODEC(T64, ZSTD(6)),
    tx_count UInt32 CODEC(Delta(4), ZSTD(6)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(6))
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY address
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.price_ohlc_hourly (
    source LowCardinality(String),
    symbol LowCardinality(String),
    ts DateTime CODEC(DoubleDelta, ZSTD(9)),
    open Float64 CODEC(Gorilla, ZSTD(9)),
    high Float64 CODEC(Gorilla, ZSTD(9)),
    low Float64 CODEC(Gorilla, ZSTD(9)),
    close Float64 CODEC(Gorilla, ZSTD(9)),
    volume Float64 CODEC(Gorilla, ZSTD(9))
) ENGINE = ReplacingMergeTree(ts)
PARTITION BY toYYYYMM(ts)
ORDER BY (source, symbol, ts)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;

CREATE TABLE IF NOT EXISTS bitcoin.price_ohlc_daily (
    source LowCardinality(String),
    symbol LowCardinality(String),
    day Date CODEC(ZSTD(9)),
    open Float64 CODEC(Gorilla, ZSTD(9)),
    high Float64 CODEC(Gorilla, ZSTD(9)),
    low Float64 CODEC(Gorilla, ZSTD(9)),
    close Float64 CODEC(Gorilla, ZSTD(9)),
    volume Float64 CODEC(Gorilla, ZSTD(9)),
    updated_at DateTime CODEC(DoubleDelta, ZSTD(9))
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(day)
ORDER BY (source, symbol, day)
SETTINGS storage_policy = 's3_main', index_granularity = 8192;
```

Config edit in `clickhouse/config.xml` lines 30-35, replace level 3 block with:

```xml
<compression>
    <case>
        <method>zstd</method>
        <level>9</level>
    </case>
</compression>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add clickhouse/init/03_schema_v2.sql clickhouse/config.xml backend/tests/test_ch_schema.py
git commit -m "feat: ch v2 base schema price tables ZSTD-9"
```

---
### Task 2: Projections

**Files:**
- Create: `clickhouse/init/04_projections.sql`
- Modify: `backend/tests/test_ch_schema.py` (append projection test)

**Interfaces:**
- Consumes: v2 table names from Task 1.
- Produces: named projections `p_height`, `p_hash`, `p_block`, `p_txid`, `p_fee`, `p_addr_time`, `p_spend`, `p_value`, `p_prev`, `p_seen`, `p_balance`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_ch_schema.py
from pathlib import Path as _P

def test_projections():
    sql = _P("clickhouse/init/04_projections.sql").read_text()
    for name in ["p_height", "p_addr_time", "p_prev", "p_seen", "p_txid", "p_value"]:
        assert name in sql
    assert "MATERIALIZE PROJECTION" in sql
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py::test_projections -v`
Expected: FAIL with "04_projections.sql does not exist".

- [ ] **Step 3: Write minimal implementation**

```sql
-- clickhouse/init/04_projections.sql
ALTER TABLE bitcoin.blocks_v2 ADD PROJECTION IF NOT EXISTS p_height (SELECT * ORDER BY height) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.blocks_v2 ADD PROJECTION IF NOT EXISTS p_hash (SELECT hash, prev_hash, merkle_root, height, timestamp) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.transactions_v2 ADD PROJECTION IF NOT EXISTS p_block (SELECT * ORDER BY (block_height, txid)) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.transactions_v2 ADD PROJECTION IF NOT EXISTS p_txid (SELECT txid, block_height, timestamp, fee_sat) ORDER BY txid SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.transactions_v2 ADD PROJECTION IF NOT EXISTS p_fee (SELECT fee_rate_sat_vbyte, fee_sat, timestamp) ORDER BY fee_rate_sat_vbyte SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.outputs_v2 ADD PROJECTION IF NOT EXISTS p_addr_time (SELECT * ORDER BY (address, timestamp)) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.outputs_v2 ADD PROJECTION IF NOT EXISTS p_spend (SELECT spending_txid, spent_height, txid, output_index) ORDER BY spending_txid SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.outputs_v2 ADD PROJECTION IF NOT EXISTS p_value (SELECT value_sat, timestamp, address) ORDER BY value_sat SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.inputs_v2 ADD PROJECTION IF NOT EXISTS p_prev (SELECT * ORDER BY (prev_txid, prev_output_index)) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.inputs_v2 ADD PROJECTION IF NOT EXISTS p_block (SELECT * ORDER BY (block_height, txid)) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.addresses_v2 ADD PROJECTION IF NOT EXISTS p_seen (SELECT * ORDER BY (last_seen_time, bucket)) SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.addresses_v2 ADD PROJECTION IF NOT EXISTS p_balance (SELECT balance_sat, address, bucket) ORDER BY balance_sat SETTINGS compress_primary_key = 1;
ALTER TABLE bitcoin.blocks_v2 MATERIALIZE PROJECTION p_height;
ALTER TABLE bitcoin.blocks_v2 MATERIALIZE PROJECTION p_hash;
ALTER TABLE bitcoin.transactions_v2 MATERIALIZE PROJECTION p_block;
ALTER TABLE bitcoin.transactions_v2 MATERIALIZE PROJECTION p_txid;
ALTER TABLE bitcoin.transactions_v2 MATERIALIZE PROJECTION p_fee;
ALTER TABLE bitcoin.outputs_v2 MATERIALIZE PROJECTION p_addr_time;
ALTER TABLE bitcoin.outputs_v2 MATERIALIZE PROJECTION p_spend;
ALTER TABLE bitcoin.outputs_v2 MATERIALIZE PROJECTION p_value;
ALTER TABLE bitcoin.inputs_v2 MATERIALIZE PROJECTION p_prev;
ALTER TABLE bitcoin.inputs_v2 MATERIALIZE PROJECTION p_block;
ALTER TABLE bitcoin.addresses_v2 MATERIALIZE PROJECTION p_seen;
ALTER TABLE bitcoin.addresses_v2 MATERIALIZE PROJECTION p_balance;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add clickhouse/init/04_projections.sql backend/tests/test_ch_schema.py
git commit -m "feat: ch v2 projections address spend fee lookups"
```

---
### Task 3: Hourly MVs plus daily marts

**Files:**
- Create: `clickhouse/init/05_mvs.sql`
- Create: `clickhouse/init/06_marts.sql`
- Modify: `backend/tests/test_ch_schema.py` (append MV test)

**Interfaces:**
- Consumes: v2 tables from Task 1.
- Produces: `mv_blocks_hourly`, `mv_tx_fee_hourly`, `mv_script_hourly`, `mv_addr_hourly`, `mv_flow_hourly`, `mv_blocks_daily`, `mv_tx_fee_daily`, `mv_addr_daily`, `mv_flow_daily`; drops `block_stats_daily`, `tx_volume_hourly`, `address_activity_daily`.

- [ ] **Step 1: Write the failing test**

```python
def test_mvs_hierarchy():
    from pathlib import Path as _P2
    sql = _P2("clickhouse/init/05_mvs.sql").read_text()
    marts = _P2("clickhouse/init/06_marts.sql").read_text()
    assert "DROP VIEW IF EXISTS bitcoin.block_stats_daily" in sql
    assert "mv_blocks_hourly" in sql
    assert "mv_script_hourly" in sql
    assert "mv_addr_hourly" in sql
    assert "mv_flow_hourly" in sql
    assert "mv_tx_fee_daily" in sql
    assert "mv_addr_daily" in sql
    assert "countState()" in sql
    assert "countMerge(" in sql
    assert "quantileState(" in sql
    assert "uniqState(" in sql
    assert "PARTITION BY toYYYYMM(hour)" in sql
    assert "ZSTD(7)" in sql
    assert "ZSTD(9)" in sql
    assert "marts.hodl_daily" in marts
    assert "marts.realized_daily" in marts
    assert "marts.sopr_daily" in marts
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py::test_mvs_hierarchy -v`
Expected: FAIL with "05_mvs.sql does not exist".

- [ ] **Step 3: Write minimal implementation**

```sql
-- clickhouse/init/05_mvs.sql
DROP VIEW IF EXISTS bitcoin.block_stats_daily;
DROP VIEW IF EXISTS bitcoin.tx_volume_hourly;
DROP VIEW IF EXISTS bitcoin.address_activity_daily;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS block_count CODEC(ZSTD(7)),
  avgState(size) AS avg_size CODEC(ZSTD(7)),
  avgState(weight) AS avg_weight CODEC(ZSTD(7)),
  avgState(tx_count) AS avg_tx_count CODEC(ZSTD(7)),
  avgState(interval_sec) AS avg_interval CODEC(ZSTD(7)),
  avgState(difficulty) AS avg_difficulty CODEC(ZSTD(7)),
  sumState(reward_sat) AS reward_sum CODEC(ZSTD(7)),
  sumState(fee_total_sat) AS fee_sum CODEC(ZSTD(7))
FROM bitcoin.blocks_v2 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  countState() AS tx_count CODEC(ZSTD(7)),
  countStateIf(is_coinbase = 1) AS coinbase_count CODEC(ZSTD(7)),
  sumState(fee_sat) AS fee_sum CODEC(ZSTD(7)),
  quantileState(0.5)(fee_sat) AS fee_median CODEC(ZSTD(7)),
  quantileState(0.5)(fee_rate_sat_vbyte) AS feerate_median CODEC(ZSTD(7)),
  quantileState(0.5)(total_out_sat) AS value_median CODEC(ZSTD(7)),
  sumState(total_out_sat) AS transfer_sum CODEC(ZSTD(7)),
  sumState(vin_count) AS vin_sum CODEC(ZSTD(7)),
  sumState(vout_count) AS vout_sum CODEC(ZSTD(7))
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_script_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY (hour, script_type)
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour, script_type,
  countState() AS out_count CODEC(ZSTD(7)),
  sumState(value_sat) AS value_sum CODEC(ZSTD(7))
FROM bitcoin.outputs_v2 GROUP BY hour, script_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  uniqState(address) AS active CODEC(ZSTD(7)),
  sumState(value_sat) AS value_sum CODEC(ZSTD(7))
FROM bitcoin.outputs_v2 WHERE address != '' GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_hourly
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(hour) ORDER BY hour
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toStartOfHour(timestamp) AS hour,
  sumState(total_out_sat) AS transfer_sum CODEC(ZSTD(7)),
  countState() AS tx_count CODEC(ZSTD(7))
FROM bitcoin.transactions_v2 WHERE is_coinbase = 0 GROUP BY hour;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_blocks_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(block_count) AS blocks CODEC(ZSTD(9)),
  avgMerge(avg_size) AS avg_size CODEC(ZSTD(9)),
  avgMerge(avg_weight) AS avg_weight CODEC(ZSTD(9)),
  avgMerge(avg_tx_count) AS avg_tx_count CODEC(ZSTD(9)),
  avgMerge(avg_interval) AS avg_interval CODEC(ZSTD(9)),
  avgMerge(avg_difficulty) AS avg_difficulty CODEC(ZSTD(9)),
  sumMerge(reward_sum) AS reward_sum CODEC(ZSTD(9)),
  sumMerge(fee_sum) AS fee_sum CODEC(ZSTD(9))
FROM bitcoin.mv_blocks_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_tx_fee_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  countMerge(tx_count) AS tx_count CODEC(ZSTD(9)),
  sumMerge(fee_sum) AS fee_sum CODEC(ZSTD(9)),
  quantileMerge(fee_median) AS fee_median CODEC(ZSTD(9)),
  quantileMerge(feerate_median) AS feerate_median CODEC(ZSTD(9)),
  sumMerge(transfer_sum) AS transfer_sum CODEC(ZSTD(9))
FROM bitcoin.mv_tx_fee_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_addr_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  uniqMerge(active) AS active CODEC(ZSTD(9)),
  sumMerge(value_sum) AS value_sum CODEC(ZSTD(9))
FROM bitcoin.mv_addr_hourly GROUP BY day;

CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_flow_daily
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(hour) AS day,
  sumMerge(transfer_sum) AS transfer_sum CODEC(ZSTD(9)),
  countMerge(tx_count) AS tx_count CODEC(ZSTD(9))
FROM bitcoin.mv_flow_hourly GROUP BY day;
```

```sql
-- clickhouse/init/06_marts.sql
CREATE DATABASE IF NOT EXISTS marts;
CREATE TABLE IF NOT EXISTS marts.realized_daily (day Date CODEC(ZSTD(9)), realized_cap UInt64 CODEC(T64, ZSTD(9)), updated_at DateTime CODEC(DoubleDelta, ZSTD(9))) ENGINE = ReplacingMergeTree(updated_at) PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
CREATE TABLE IF NOT EXISTS marts.sopr_daily (day Date CODEC(ZSTD(9)), sopr Float64 CODEC(Gorilla, ZSTD(9)), updated_at DateTime CODEC(DoubleDelta, ZSTD(9))) ENGINE = ReplacingMergeTree(updated_at) PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
CREATE TABLE IF NOT EXISTS marts.mvrv_nupl_daily (day Date CODEC(ZSTD(9)), mvrv Float64 CODEC(Gorilla, ZSTD(9)), nupl Float64 CODEC(Gorilla, ZSTD(9)), updated_at DateTime CODEC(DoubleDelta, ZSTD(9))) ENGINE = ReplacingMergeTree(updated_at) PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
CREATE TABLE IF NOT EXISTS marts.puell_daily (day Date CODEC(ZSTD(9)), puell Float64 CODEC(Gorilla, ZSTD(9)), updated_at DateTime CODEC(DoubleDelta, ZSTD(9))) ENGINE = ReplacingMergeTree(updated_at) PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
CREATE TABLE IF NOT EXISTS marts.hodl_daily (day Date CODEC(ZSTD(9)), band_1d UInt64 CODEC(T64, ZSTD(9)), band_1w UInt64 CODEC(T64, ZSTD(9)), band_1m UInt64 CODEC(T64, ZSTD(9)), band_3m UInt64 CODEC(T64, ZSTD(9)), band_6m UInt64 CODEC(T64, ZSTD(9)), band_1y UInt64 CODEC(T64, ZSTD(9)), band_2y UInt64 CODEC(T64, ZSTD(9)), band_5y_plus UInt64 CODEC(T64, ZSTD(9)), updated_at DateTime CODEC(DoubleDelta, ZSTD(9))) ENGINE = ReplacingMergeTree(updated_at) PARTITION BY toYYYYMM(day) ORDER BY day SETTINGS storage_policy = 's3_main';
-- Refresh pattern (Celery beat runs same SQL with date param):
-- INSERT INTO marts.hodl_daily SELECT today() AS day, ... FROM bitcoin.outputs_v2 WHERE spent_time = toDateTime(0) OR spent_time > today();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_ch_schema.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add clickhouse/init/05_mvs.sql clickhouse/init/06_marts.sql backend/tests/test_ch_schema.py
git commit -m "feat: ch hourly MVs daily marts replace legacy views"
```

---
### Task 4: Decoder enrich UTXO map plus subsidy math

**Files:**
- Create: `decoder/internal/enrich/utxo.go`
- Create: `decoder/internal/enrich/subsidy.go`
- Create: `decoder/internal/enrich/enrich_test.go`
- Modify: `decoder/internal/parser/types.go` (add ValueSat to ParsedInput, SpentHeight/SpentTime to ParsedOutput via new EnrichedBlock struct — keep ParsedTx unchanged, enrich package owns linkage types)

**Interfaces:**
- Consumes: `parser.ParsedTx`, `parser.ParsedInput`, `parser.ParsedOutput`.
- Produces: `enrich.UTXOMap.Get(txid string, index uint32) (uint64, bool)`, `enrich.UTXOMap.Put(...)`, `enrich.SubsidyAt(height uint32) uint64`, `enrich.FeeRate(feeSat int64, vsize uint32) float32`, `enrich.BucketFor(balanceSat int64) string`.

- [ ] **Step 1: Write the failing test**

```go
// decoder/internal/enrich/enrich_test.go
package enrich

import "testing"

func TestSubsidySchedule(t *testing.T) {
    if got := SubsidyAt(0); got != 5000000000 {
        t.Fatalf("genesis subsidy = %d", got)
    }
    if got := SubsidyAt(210000); got != 2500000000 {
        t.Fatalf("halving1 = %d", got)
    }
    if got := SubsidyAt(840000); got != 312500000 {
        t.Fatalf("halving4 = %d", got)
    }
}

func TestUTXOMapPutGet(t *testing.T) {
    m := NewUTXOMap()
    m.Put("abc", 0, 1000)
    v, ok := m.Get("abc", 0)
    if !ok || v != 1000 {
        t.Fatalf("get = %d %v", v, ok)
    }
}

func TestFeeRate(t *testing.T) {
    if got := FeeRate(1000, 250); got != 4.0 {
        t.Fatalf("feerate = %v", got)
    }
}

func TestBucketFor(t *testing.T) {
    if BucketFor(500) != "dust" {
        t.Fatalf("dust bucket wrong")
    }
    if BucketFor(150000000000) != "whale" {
        t.Fatalf("whale bucket wrong")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/decoder && go test ./internal/enrich/ -v`
Expected: FAIL with "no such directory" or "undefined SubsidyAt".

- [ ] **Step 3: Write minimal implementation**

```go
// decoder/internal/enrich/utxo.go
package enrich

import (
    "fmt"
    "sync"
)

type UTXOMap struct {
    mu sync.RWMutex
    m  map[string]uint64
}

func NewUTXOMap() *UTXOMap { return &UTXOMap{m: make(map[string]uint64)} }

func mapKey(txid string, index uint32) string { return fmt.Sprintf("%s:%d", txid, index) }

func (u *UTXOMap) Put(txid string, index uint32, value uint64) {
    u.mu.Lock()
    defer u.mu.Unlock()
    u.m[mapKey(txid, index)] = value
}

func (u *UTXOMap) Get(txid string, index uint32) (uint64, bool) {
    u.mu.RLock()
    defer u.mu.RUnlock()
    v, ok := u.m[mapKey(txid, index)]
    return v, ok
}

func (u *UTXOMap) Delete(txid string, index uint32) {
    u.mu.Lock()
    defer u.mu.Unlock()
    delete(u.m, mapKey(txid, index))
}

func (u *UTXOMap) Len() int {
    u.mu.RLock()
    defer u.mu.RUnlock()
    return len(u.m)
}
```

```go
// decoder/internal/enrich/subsidy.go
package enrich

func SubsidyAt(height uint32) uint64 {
    return (50 * 100000000) >> (height / 210000)
}

func FeeRate(feeSat int64, vsize uint32) float32 {
    if vsize == 0 {
        return 0
    }
    return float32(feeSat) / float32(vsize)
}

func BucketFor(balanceSat int64) string {
    switch {
    case balanceSat < 1000:
        return "dust"
    case balanceSat < 1000000:
        return "shrimp"
    case balanceSat < 10000000:
        return "crab"
    case balanceSat < 100000000:
        return "fish"
    case balanceSat < 1000000000:
        return "shark"
    case balanceSat < 100000000000:
        return "whale"
    default:
        return "humpback"
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/decoder && go test ./... -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add decoder/internal/enrich/
git commit -m "feat: decoder enrich utxo subsidy feerate buckets"
```

---
### Task 5: Decoder ClickHouse client v2 inserts

**Files:**
- Modify: `decoder/internal/clickhouse/client.go:51-164`
- Create: `decoder/internal/clickhouse/client_v2_test.go`

**Interfaces:**
- Consumes: `enrich.UTXOMap`, `enrich.SubsidyAt`, `parser.ParsedBlock`.
- Produces: `Client.InsertBlockV2`, `InsertTransactionsV2`, `InsertOutputsV2`, `InsertInputsV2` writing v2 column order including reward_sat, fee_total_sat, interval_sec, input_total_sat, fee_rate_sat_vbyte, value_sat, spent columns, bucket, updated_at.

- [ ] **Step 1: Write the failing test**

```go
// decoder/internal/clickhouse/client_v2_test.go
package clickhouse

import "testing"

func TestV2ColumnCounts(t *testing.T) {
    if BlockV2Columns() != 17 {
        t.Fatalf("blocks_v2 cols changed")
    }
    if TxV2Columns() != 17 {
        t.Fatalf("tx_v2 cols changed")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/decoder && go test ./internal/clickhouse/ -run TestV2ColumnCounts -v`
Expected: FAIL with "undefined BlockV2Columns".

- [ ] **Step 3: Write minimal implementation**

```go
// decoder/internal/clickhouse/columns.go
package clickhouse

func BlockV2Columns() int { return 17 }
func TxV2Columns() int    { return 17 }

// decoder/internal/clickhouse/client_v2.go
package clickhouse

import (
    "context"
    "fmt"
    "time"

    "github.com/freegoup/decoder/internal/enrich"
    "github.com/freegoup/decoder/internal/parser"
)

func (c *Client) InsertBlockV2(ctx context.Context, block *parser.ParsedBlock, prevTime time.Time) error {
    batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`INSERT INTO %s.blocks_v2`, c.db))
    if err != nil {
        return err
    }
    var feeTotal int64
    for _, tx := range block.Transactions {
        if !tx.IsCoinbase {
            feeTotal += 0 - tx.TotalOutSat // input_total filled by syncer before call; fee recomputed there
        }
    }
    interval := int32(600)
    if !prevTime.IsZero() {
        interval = int32(block.Header.Timestamp.Sub(prevTime).Seconds())
    }
    reward := enrich.SubsidyAt(block.Height)
    err = batch.Append(block.Height, block.Hash.String(), block.Header.Timestamp,
        uint32(0), uint32(0), uint32(block.Header.Version), block.Header.Bits, block.Header.Nonce,
        block.Header.MerkleRoot.String(), block.Header.PrevBlock.String(),
        uint16(len(block.Transactions)), float64(0), "",
        uint64(reward), uint64(max64(feeTotal, 0)), interval, time.Now().UTC())
    if err != nil {
        return err
    }
    return batch.Send()
}

func max64(a, b int64) int64 {
    if a > b {
        return a
    }
    return b
}
```

`InsertTransactionsV2` appends 17 columns in 03_schema_v2 order including
`input_total_sat` (already resolved by syncer via `utxo.Get`), `fee_sat =
input_total - total_out`, `fee_rate_sat_vbyte = enrich.FeeRate(fee, vsize)`,
`is_change_heavy` heuristic (1 when >50% outputs reuse an input address).
`InsertInputsV2` looks up `utxo.Get(prev_txid, prev_index)`, writes 0 on miss and
increments miss counter in logs. `InsertOutputsV2` writes spent=0 with empty
spending columns. Syncer `insertBlock` resolves input values first, then calls V2
variants, then puts new outputs into the map and deletes spent entries.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/decoder && go test ./... -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add decoder/internal/clickhouse/client.go decoder/internal/clickhouse/client_v2_test.go decoder/internal/syncer/syncer.go
git commit -m "feat: decoder v2 inserts utxo-linked values"
```

---
### Task 6: Price OHLC ingest job

**Files:**
- Create: `backend/app/workers/price.py`
- Create: `backend/tests/test_price.py`
- Modify: `backend/app/workers/celery_app.py` (add beat schedule price-poll-hourly)

**Interfaces:**
- Consumes: Binance `api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1h`, Kraken `api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=60` fallback.
- Produces: `fetch_binance_hour(symbol, start_ms, end_ms) -> list[dict]`, `fetch_kraken_hour(...) -> list[dict]`, `upsert_sql(rows) -> str`, beat task `poll_price_hourly`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_price.py
from unittest.mock import patch
from app.workers import price

def test_binance_fallback_to_kraken():
    with patch.object(price, "fetch_binance_hour", side_effect=RuntimeError("down")) as b:
        with patch.object(price, "fetch_kraken_hour", return_value=[{"ts": "2024-01-01 00:00:00", "close": 42000.0}]) as k:
            rows = price.get_hourly("BTCUSDT")
            assert rows[0]["close"] == 42000.0
            assert b.called and k.called

def test_upsert_sql_shape():
    sql = price.upsert_sql([{"ts": "2024-01-01 00:00:00", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10.0}])
    assert "INSERT INTO bitcoin.price_ohlc_hourly" in sql
    assert "binance" in sql
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_price.py -v`
Expected: FAIL with "No module app.workers.price".

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/workers/price.py
import httpx

BINANCE = "https://api.binance.us/api/v3/klines"
KRAKEN = "https://api.kraken.com/0/public/OHLC"

def fetch_binance_hour(symbol="BTCUSDT", start_ms=None, end_ms=None):
    params = {"symbol": symbol, "interval": "1h", "limit": 1000}
    if start_ms: params["startTime"] = start_ms
    if end_ms: params["endTime"] = end_ms
    r = httpx.get(BINANCE, params=params, timeout=20)
    r.raise_for_status()
    return [{"ts": row[0], "open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[5])} for row in r.json()]

def fetch_kraken_hour():
    r = httpx.get(KRAKEN, params={"pair": "XXBTZUSD", "interval": 60}, timeout=20)
    r.raise_for_status()
    payload = r.json()["result"]
    key = next(k for k in payload if k != "last")
    return [{"ts": int(row[0]), "open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[6])} for row in payload[key]]

def get_hourly(symbol="BTCUSDT"):
    try:
        return fetch_binance_hour(symbol)
    except Exception:
        return fetch_kraken_hour()

def upsert_sql(rows, source="binance", symbol="BTCUSDT"):
    vals = ", ".join(f"('{source}','{symbol}','{r['ts']}',{r['open']},{r['high']},{r['low']},{r['close']},{r['volume']})" for r in rows)
    return f"INSERT INTO bitcoin.price_ohlc_hourly (source, symbol, ts, open, high, low, close, volume) VALUES {vals}"
```

Celery beat entry `price-poll-hourly` every 3600s calling `poll_price_hourly` which
calls `get_hourly` then ClickHouse insert via `ch.get_ch_client`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_price.py tests/test_worker.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/workers/price.py backend/app/workers/celery_app.py backend/tests/test_price.py
git commit -m "feat: price ohlc ingest binance kraken fallback"
```

---
### Task 7: Metrics registry expansion plus stale flag

**Files:**
- Modify: `backend/app/metrics/registry.py`
- Modify: `backend/app/metrics/service.py:38-43`
- Create: `backend/tests/test_metrics_catalog.py`

**Interfaces:**
- Consumes: `ch.query_series(sql, params)`, MV names from Task 3 (`mv_blocks_hourly/daily`, `mv_tx_fee_hourly/daily`, `mv_addr_daily`, `mv_flow_daily`), mart tables from `clickhouse/init/06_marts.sql` (`marts.realized_daily`, `marts.sopr_daily`, `marts.mvrv_nupl_daily`, `marts.puell_daily`, `marts.hodl_daily`).
- Produces: `METRICS` entries with `id, title, category, unit, sql, grain`; `get_series` returns `{points, unit, stale}` with stale True on any NULL value or empty.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_metrics_catalog.py
from app.metrics.registry import METRICS
from app.metrics import service

def test_catalog_covers_families():
    ids = {m["id"] for m in METRICS}
    for required in ["blocks_hourly", "fees_daily", "hashrate_daily", "active_addresses_daily", "realized_cap_daily", "hodl_1y_plus_daily", "nvt_daily"]:
        assert required in ids, f"missing {required}"

def test_no_base_table_reads():
    for m in METRICS:
        sql = m.get("sql", "")
        assert "bitcoin.blocks " not in sql and "bitcoin.transactions " not in sql, m["id"]

def test_stale_flag():
    from unittest.mock import patch
    with patch("app.ch.query_series", return_value=[{"t": "2024-01-01", "v": None}]):
        body = service.get_series("blocks_hourly", "2024-01-01", "2024-01-02")
        assert body["stale"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_metrics_catalog.py -v`
Expected: FAIL with "missing blocks_hourly".

- [ ] **Step 3: Write minimal implementation**

```python
# registry excerpt — full file lists 30+ entries across 8 families
METRICS = [
  {"id": "blocks_hourly", "title": "Blocks / hour", "category": "network", "unit": "blocks",
   "sql": "SELECT hour, countMerge(block_count) FROM bitcoin.mv_blocks_hourly WHERE hour BETWEEN {from:DateTime} AND {to:DateTime} GROUP BY hour ORDER BY hour"},
  {"id": "fees_daily", "title": "Total fees / day", "category": "fees", "unit": "BTC",
   "sql": "SELECT day, sumMerge(fee_sum)/1e8 FROM bitcoin.mv_tx_fee_daily WHERE day BETWEEN {from:Date} AND {to:Date} ORDER BY day"},
  # ... hashrate_daily (avgMerge difficulty * 2^32/600), active_addresses_daily (uniqMerge),
  # realized_cap_daily / sopr_daily / mvrv_daily / puell_daily / nvt_daily read marts.*,
  # hodl_1y_plus_daily reads marts.hodl_daily, weekly/monthly use toStartOfWeek(day)/toStartOfMonth(day) on *_daily
]
```

Service change:

```python
def get_series(metric_id, frm, to):
    m = _by_id(metric_id)
    if m is None or m.get("disabled"):
        raise HTTPException(status_code=404, detail="Unknown metric")
    points = ch.query_series(m["sql"], {"from": frm, "to": to})
    stale = (len(points) == 0) or any(p.get("v") is None for p in points)
    return {"points": points, "unit": m["unit"], "stale": stale}
```

Keep legacy 3 ids (`block_stats_daily`, `tx_volume_hourly`, `address_activity_daily`)
as aliases to new MVs so existing `test_metrics.py` passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/ -v`
Expected: PASS (all suites including legacy metrics, auth, health, worker, price, catalog, schema).

- [ ] **Step 5: Commit**

```bash
git add backend/app/metrics/registry.py backend/app/metrics/service.py backend/tests/test_metrics_catalog.py
git commit -m "feat: metrics catalog v2 marts stale flag"
```

---
### Task 8: E2E verification harness

**Files:**
- Create: `scripts/e2e_onchain.py`
- Create: `backend/tests/test_e2e_onchain.py` (integration, skipped without CH)

**Interfaces:**
- Consumes: docker compose `clickhouse` service, SQL files from Tasks 1-3, backend TestClient, synthetic chain fixture (3 blocks, 4 txs, known fees and subsidy).
- Produces: console report plus pytest pass/fail; asserts MV row counts, golden subsidy/fees, API 200 with stale flag, 30d range <500ms when CH available.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_e2e_onchain.py
import os, pytest
pytestmark = pytest.mark.skipif(os.getenv("CH_E2E") != "1", reason="needs live ClickHouse")

def test_e2e_mvs_populated():
    import clickhouse_connect
    c = clickhouse_connect.get_client(host="localhost", port=8124, username="bitcoin", password=os.getenv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse"))
    assert int(c.query("SELECT count() FROM bitcoin.mv_blocks_hourly").result_rows[0][0]) >= 1
```

- [ ] **Step 2: Run test to verify it fails/skips**

Run: `cd /home/wairuru/projects/cypherglass/backend && python -m pytest tests/test_e2e_onchain.py -v`
Expected: SKIP (CH_E2E unset).

- [ ] **Step 3: Write minimal implementation**

```python
# scripts/e2e_onchain.py — usage: python scripts/e2e_onchain.py [--apply-ddl] [--seed] [--check]
# 1. docker compose up -d clickhouse rustfs create-buckets, wait healthy
# 2. apply 03/04/05 SQL via clickhouse-connect
# 3. insert synthetic blocks (heights 0-2, timestamps hourly, known subsidy 50 BTC, fees 0.001)
# 4. sleep for MV propagation, query mv_blocks_hourly countMerge, assert == 3 blocks across hours
# 5. call backend TestClient /api/v1/metrics/blocks_hourly/series, assert 200 + points + stale False
# 6. time 30d range query, assert <500ms, print S3 bytes via system.parts
```

Full script (120 lines) uses only stdlib plus clickhouse-connect plus fastapi TestClient,
reads CLICKHOUSE_PASSWORD from env, fails fast with non-zero exit and diff output.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/wairuru/projects/cypherglass && docker compose up -d clickhouse && CH_E2E=1 python scripts/e2e_onchain.py --apply-ddl --seed --check && cd backend && CH_E2E=1 python -m pytest tests/ -v`
Expected: PASS including live MV assertions and full unit suite.

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e_onchain.py backend/tests/test_e2e_onchain.py
git commit -m "test: onchain e2e harness synthetic chain checks"
```

---

## E2E commands (run after all tasks)

```bash
cd /home/wairuru/projects/cypherglass
docker compose up -d clickhouse
cd backend && python -m pytest tests/ -v
cd ../decoder && go test ./... -v
CH_E2E=1 python scripts/e2e_onchain.py --apply-ddl --seed --check
```
