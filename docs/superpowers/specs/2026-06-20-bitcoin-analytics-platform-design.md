# Bitcoin Analytics Platform — Design Spec

**Date:** 2026-06-20
**Status:** Draft

## Overview

A Bitcoin on-chain analytics platform. A Bitcoin Knots node syncs the blockchain; block data is decoded and inserted into ClickHouse for analytics. JuiceFS provides a POSIX filesystem backed by S3 for blockchain data. ClickHouse uses S3 as its primary storage. Valkey caches JuiceFS metadata to disk.

## Architecture

```
Bitcoin P2P → bitcoin-knots → blk*.dat on JuiceFS → block-decoder (Go) → ClickHouse
                  ↓                                                           ↓
           JuiceFS → S3 (bucket: juicefs-blockchain)              S3 (bucket: clickhouse-storage)
           Valkey (metadata cache, disk-persistent)
```

### Services (6 containers)

| Service | Role | Image/Source |
|---------|------|-------------|
| `rustfs` (local) / AWS S3 (prod) | S3-compatible object storage | `rustfs/rustfs` |
| `valkey` | JuiceFS metadata cache + store | `valkey/valkey:8` |
| `juicefs` | POSIX FS backed by S3 (Docker volume plugin) | `juicfs/juicefs:latest` |
| `bitcoin-knots` | Bitcoin full node | `knots/knots:latest` |
| `clickhouse` | Analytics DB, S3-backed, compression ZSTD(3) | `clickhouse/clickhouse-server:26.5` |
| `block-decoder` | Reads blk*.dat, decodes blocks, inserts to ClickHouse | Custom Go binary |

### Data flow

1. `bitcoin-knots` syncs blockchain, writes blocks/chainstate to JuiceFS mount `/data/bitcoin`
2. JuiceFS writes data to S3 bucket `juicefs-blockchain`, caches metadata via Valkey
3. Valkey persists to disk at `/data/valkey`
4. `block-decoder` watches `/data/bitcoin/blocks/blk*.dat`, parses raw blocks, extracts addresses from scripts, batch-inserts into ClickHouse via native protocol
5. ClickHouse stores data on S3 bucket `clickhouse-storage` (via `storage_configuration` disk)
6. `.env` file provides AWS-compatible credentials for both local (RustFS) and production (AWS)

## Docker Compose Setup

**Override pattern:** `docker-compose.yml` (base shared) + `docker-compose.local.yml` or `docker-compose.prod.yml`.

- **Local:** Uses `rustfs` as S3 endpoint. All services on a single host.
- **Prod:** Uses real AWS S3. `rustfs` service excluded.

### .env structure
```
# S3 credentials (used by juicefs and clickhouse)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://rustfs:9000        # local
# S3_ENDPOINT=https://s3.amazonaws.com  # prod
S3_REGION=us-east-1

# Buckets
JUICE_BUCKET=juicefs-blockchain
CLICKHOUSE_BUCKET=clickhouse-storage

# Valkey
VALKEY_PASSWORD=
```

## JuiceFS Configuration

- **Format:** `juicefs format --storage s3 --bucket $S3_ENDPOINT/$JUICE_BUCKET --compress zstd valkey://valkey:6379/1 juicefs-blockchain`
- **Mount:** JuiceFS Docker volume plugin mounts at `/data/bitcoin`
- **Compression:** ZSTD enabled at format time
- **Metadata:** Stored in Valkey (database 1), with `--persist /data` for disk persistence

## Valkey Configuration

- Image: `valkey/valkey:8`
- Persistence: RDB + AOF enabled, saved to `/data/valkey` volume
- Used exclusively for JuiceFS metadata (not general cache)
- No password by default; configurable via .env if needed

## ClickHouse Configuration (26.5)

### Storage Policy (S3-backed)
```xml
<storage_configuration>
  <disks>
    <s3_disk>
      <type>s3</type>
      <endpoint>${S3_ENDPOINT}</endpoint>
      <access_key_id>${AWS_ACCESS_KEY_ID}</access_key_id>
      <secret_access_key>${AWS_SECRET_ACCESS_KEY}</secret_access_key>
      <region>${S3_REGION}</region>
      <no_sign_request>false</no_sign_request>
    </s3_disk>
  </disks>
  <policies>
    <s3_main>
      <volumes>
        <main>
          <disk>s3_disk</disk>
        </main>
      </volumes>
    </s3_main>
  </policies>
</storage_configuration>
```

### Compression
```xml
<compression>
  <case>
    <method>zstd</method>
    <level>3</level>
  </case>
</compression>
```

### Table Encoding Strategy
- `height`, `block_height`: `Delta` (monotonically increasing integers)
- `timestamp`: `DoubleDelta` (timestamp deltas are roughly constant ~600s)
- `value_sat`, `fee_sat`: `T64` (large-range integers)
- `txid`, `hash`, `prev_hash`, `prev_txid`: `ZSTD(3)` (random hashes)
- `address`: `LowCardinality` (repeated values)
- `script_type`: `LowCardinality` (few distinct values: P2PKH, P2SH, etc.)

## ClickHouse Schema

### `blocks`
```sql
CREATE TABLE blocks (
    height UInt32 CODEC(Delta, ZSTD(3)),
    hash FixedString(32) CODEC(ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3)),
    size UInt32 CODEC(Delta, ZSTD(3)),
    weight UInt32 CODEC(Delta, ZSTD(3)),
    version UInt32 CODEC(T64, ZSTD(3)),
    bits UInt32 CODEC(T64, ZSTD(3)),
    nonce UInt32 CODEC(T64, ZSTD(3)),
    merkle_root FixedString(32) CODEC(ZSTD(3)),
    prev_hash FixedString(32) CODEC(ZSTD(3)),
    tx_count UInt32 CODEC(Delta, ZSTD(3)),
    difficulty Float64 CODEC(ZSTD(3)),
    chainwork FixedString(32) CODEC(ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY height
SETTINGS storage_policy = 's3_main';
```

### `transactions`
```sql
CREATE TABLE transactions (
    txid FixedString(32) CODEC(ZSTD(3)),
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    block_hash FixedString(32) CODEC(ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3)),
    version UInt32 CODEC(T64, ZSTD(3)),
    locktime UInt32 CODEC(T64, ZSTD(3)),
    size UInt32 CODEC(Delta, ZSTD(3)),
    weight UInt32 CODEC(Delta, ZSTD(3)),
    vin_count UInt16 CODEC(T64, ZSTD(3)),
    vout_count UInt16 CODEC(T64, ZSTD(3)),
    is_coinbase UInt8 CODEC(T64, ZSTD(3)),
    total_out_sat UInt64 CODEC(T64, ZSTD(3)),
    fee_sat Int64 CODEC(T64, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (block_height, txid)
SETTINGS storage_policy = 's3_main';
```

### `outputs`
```sql
CREATE TABLE outputs (
    txid FixedString(32) CODEC(ZSTD(3)),
    output_index UInt32 CODEC(T64, ZSTD(3)),
    value_sat UInt64 CODEC(T64, ZSTD(3)),
    script_pubkey_hex String CODEC(ZSTD(3)),
    script_type LowCardinality(String),
    address String CODEC(ZSTD(3)),
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (txid, output_index)
SETTINGS storage_policy = 's3_main';
```

### `inputs`
```sql
CREATE TABLE inputs (
    txid FixedString(32) CODEC(ZSTD(3)),
    input_index UInt32 CODEC(T64, ZSTD(3)),
    prev_txid FixedString(32) CODEC(ZSTD(3)),
    prev_output_index UInt32 CODEC(T64, ZSTD(3)),
    script_sig_hex String CODEC(ZSTD(3)),
    sequence UInt32 CODEC(T64, ZSTD(3)),
    coinbase_data String CODEC(ZSTD(3)),
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (txid, input_index)
SETTINGS storage_policy = 's3_main';
```

### `addresses`
```sql
CREATE TABLE addresses (
    address String CODEC(ZSTD(3)),
    first_seen_block UInt32 CODEC(Delta, ZSTD(3)),
    first_seen_time DateTime CODEC(DoubleDelta, ZSTD(3)),
    last_seen_block UInt32 CODEC(Delta, ZSTD(3)),
    last_seen_time DateTime CODEC(DoubleDelta, ZSTD(3)),
    total_received_sat UInt64 CODEC(T64, ZSTD(3)),
    total_sent_sat UInt64 CODEC(T64, ZSTD(3)),
    balance_sat Int64 CODEC(T64, ZSTD(3)),
    tx_count UInt32 CODEC(Delta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY address
SETTINGS storage_policy = 's3_main';
```

## Materialized Views

```sql
-- Hourly address balance snapshots
CREATE MATERIALIZED VIEW address_balances_hourly
ENGINE = AggregatingMergeTree
ORDER BY (address, hour)
SETTINGS storage_policy = 's3_main'
AS SELECT
    address,
    toStartOfHour(timestamp) AS hour,
    argMaxState(balance_sat, timestamp) AS balance_sat,
    maxState(total_received_sat) AS total_received,
    maxState(total_sent_sat) AS total_sent
FROM addresses
GROUP BY address, hour;

-- Daily block statistics
CREATE MATERIALIZED VIEW block_stats_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    count() AS block_count,
    avg(size) AS avg_size_bytes,
    sum(tx_count) AS tx_count,
    avg(difficulty) AS avg_difficulty
FROM blocks
GROUP BY day;

-- Hourly transaction volume
CREATE MATERIALIZED VIEW tx_volume_hourly
ENGINE = AggregatingMergeTree
ORDER BY hour
SETTINGS storage_policy = 's3_main'
AS SELECT
    toStartOfHour(timestamp) AS hour,
    count() AS tx_count,
    sum(total_out_sat) / 100000000.0 AS volume_btc,
    avg(fee_sat) AS avg_fee_sat
FROM transactions
WHERE is_coinbase = 0
GROUP BY hour;

-- Daily active addresses
CREATE MATERIALIZED VIEW address_activity_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    uniq(address) AS active_addresses
FROM outputs
WHERE address != ''
GROUP BY day;
```

## Block Decoder (Go)

### Design
- Watches `/data/bitcoin/blocks/` for new or modified `blk*.dat` files using fsnotify
- Parses Bitcoin block binary format directly (magic bytes → block size → block header → transactions)
- Extracts addresses from scriptPubKey types: P2PKH, P2SH, P2WPKH (v0), P2WSH (v0), P2TR (v1)
- Batch-inserts to ClickHouse using `clickhouse-go/v2` native protocol (1k-10k rows per batch)
- Tracks progress via state file (`decoder_state.json`) containing last synced block height
- On startup, resumes from last synced height; if state file missing, starts from genesis (height 0)
- For each new block detected, reads from the last byte position in the current blk file

### Key Libraries
- `github.com/ClickHouse/clickhouse-go/v2` — ClickHouse native protocol client
- `github.com/fsnotify/fsnotify` — File watcher for new blk files
- Standard library `encoding/binary` — Block binary parsing

### Address Extraction
- P2PKH: `OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG` → base58 encode
- P2SH: `OP_HASH160 <20 bytes> OP_EQUAL` → base58 encode with P2SH prefix
- P2WPKH: `OP_0 <20 bytes>` → bech32 encode
- P2WSH: `OP_0 <32 bytes>` → bech32 encode
- P2TR: `OP_1 <32 bytes>` → bech32m encode
- OP_RETURN: address = "" (no address)

## Verification Plan

After setup, verify:
1. **RustFS bucket exists**: `curl http://localhost:9000` — check both buckets created
2. **Valkey persistence**: Write key, restart container, confirm key survives
3. **JuiceFS mount**: `ls /data/bitcoin` shows `blocks/`, `chainstate/`, `indexes/`
4. **Bitcoin IBD started**: Check `bitcoin-knots` logs for "UpdateTip" 
5. **Block files visible in S3**: List objects in `juicefs-blockchain` bucket via RustFS API — should see block data chunks
6. **ClickHouse S3 storage**: `SELECT * FROM system.disks WHERE name = 's3_disk'` — disk is online. `SYSTEM FLUSH LOGS` then check S3 bucket for data
7. **ClickHouse compression**: `SELECT compression_codec FROM system.columns WHERE table = 'blocks' AND database = 'bitcoin'` — verify ZSTD
8. **Block decoder**: Check decoder logs for successful insertions. Query `SELECT count() FROM bitcoin.blocks` — should be non-zero after blocks are synced
9. **Materialized views**: `SELECT * FROM system.tables WHERE database = 'bitcoin' AND engine = 'MaterializedView'`

## Directory Structure

```
freegoup/
  .env                          # S3 credentials, endpoints
  .env.example                  # Template with placeholders
  docker-compose.yml            # Base shared services
  docker-compose.local.yml      # Local override (adds rustfs, overrides endpoints)
  docker-compose.prod.yml       # Prod override (real S3 endpoints, removes rustfs)
  clickhouse/
    config.xml                  # ClickHouse server config (S3 disk, compression)
    users.xml                   # ClickHouse users
    init/
      01_schema.sql             # CREATE TABLE statements
      02_views.sql              # Materialized views
  valkey/
    valkey.conf                 # Persistence config (RDB + AOF)
  juicefs/
    setup.sh                    # juicefs format + mount setup script
  decoder/
    Dockerfile
    go.mod
    go.sum
    main.go                     # Block decoder service
  volumes/                      # gitignored, local volume data
```

## Open Questions
- None — all decisions resolved during brainstorming
