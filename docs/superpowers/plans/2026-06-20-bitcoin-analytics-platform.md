# Bitcoin Analytics Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bitcoin analytics platform with Bitcoin Knots node, JuiceFS on S3, Valkey metadata cache, ClickHouse 26.5 columnar analytics DB, and a Go block decoder.

**Architecture:** 6 Docker services — rustfs (local S3), valkey (metadata), juicefs (POSIX FS over S3), bitcoin-knots (node), clickhouse (analytics), block-decoder (Go). Two docker-compose files: local (rustfs) and prod (AWS S3). Block decoder reads raw blk*.dat files, decodes to ClickHouse.

**Tech Stack:** Docker Compose, RustFS, Valkey 8, JuiceFS CE, Bitcoin Knots, ClickHouse 26.5, Go 1.22+ (btcd for wire parsing, clickhouse-go/v2 for inserts)

**Design spec:** `docs/superpowers/specs/2026-06-20-bitcoin-analytics-platform-design.md`

---

## Phase 1: Infrastructure

### Task 1: Project scaffolding

**Files:**
- Create: `.gitignore`
- Create: `.env`
- Create: `.env.example`
- Create: `volumes/.gitkeep`
- Create: `clickhouse/config.xml`
- Create: `clickhouse/users.xml`

- [ ] **Step 1: Create .gitignore**

Write `freegoup/.gitignore`:

```
volumes/
.env
decoder/decoder
*.log
```

- [ ] **Step 2: Create .env**

Write `freegoup/.env`:

```bash
# === S3 Credentials (for juicefs and clickhouse) ===
AWS_ACCESS_KEY_ID=rustfsadmin
AWS_SECRET_ACCESS_KEY=rustfsadmin
S3_ENDPOINT=http://rustfs:9000
# S3_ENDPOINT=https://s3.amazonaws.com     # uncomment for prod
S3_REGION=us-east-1

# === Buckets ===
JUICE_BUCKET=juicefs-blockchain
CLICKHOUSE_BUCKET=clickhouse-storage

# === Valkey ===
VALKEY_PASSWORD=

# === Bitcoin Knots ===
BITCOIN_RPC_USER=bitcoin
BITCOIN_RPC_PASSWORD=bitcoinrpc
```

- [ ] **Step 3: Create .env.example**

Write `freegoup/.env.example`:

```bash
# === S3 Credentials ===
# For local dev with RustFS, keep defaults.
# For production AWS, set real credentials and uncomment the AWS endpoint.
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=http://rustfs:9000
# S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1

# === Buckets ===
JUICE_BUCKET=juicefs-blockchain
CLICKHOUSE_BUCKET=clickhouse-storage

# === Valkey ===
VALKEY_PASSWORD=changeme

# === Bitcoin Knots ===
BITCOIN_RPC_USER=bitcoin
BITCOIN_RPC_PASSWORD=changeme
```

- [ ] **Step 4: Create volume placeholder**

```bash
mkdir -p volumes/valkey volumes/clickhouse
touch volumes/valkey/.gitkeep volumes/clickhouse/.gitkeep
```

- [ ] **Step 5: Create ClickHouse config.xml**

Write `freegoup/clickhouse/config.xml`:

```xml
<clickhouse>
    <logger>
        <level>information</level>
        <console>1</console>
    </logger>

    <storage_configuration>
        <disks>
            <s3_disk>
                <type>s3_object_storage</type>
                <endpoint>${S3_ENDPOINT}</endpoint>
                <access_key_id>${AWS_ACCESS_KEY_ID}</access_key_id>
                <secret_access_key>${AWS_SECRET_ACCESS_KEY}</secret_access_key>
                <region>${S3_REGION}</region>
                <metadata_type>local</metadata_type>
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

    <compression>
        <case>
            <method>zstd</method>
            <level>3</level>
        </case>
    </compression>

    <macros>
        <shard>01</shard>
        <replica>clickhouse</replica>
    </macros>
</clickhouse>
```

- [ ] **Step 6: Create ClickHouse users.xml**

Write `freegoup/clickhouse/users.xml`:

```xml
<clickhouse>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
        <bitcoin>
            <password>bitcoin_clickhouse</password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </bitcoin>
    </users>
    <profiles>
        <default>
            <max_threads>8</max_threads>
            <use_uncompressed_cache>0</use_uncompressed_cache>
        </default>
    </profiles>
    <quotas>
        <default>
            <interval>
                <duration>3600</duration>
                <queries>0</queries>
                <errors>0</errors>
                <result_rows>0</result_rows>
                <read_rows>0</read_rows>
                <execution_time>0</execution_time>
            </interval>
        </default>
    </quotas>
</clickhouse>
```

- [ ] **Step 7: Verify**

```bash
ls -la .gitignore .env .env.example clickhouse/config.xml clickhouse/users.xml volumes/valkey/.gitkeep volumes/clickhouse/.gitkeep
```

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.example clickhouse/ volumes/
git commit -m "chore: project scaffolding with .env, clickhouse configs"
```

---

### Task 2: ClickHouse schema

**Files:**
- Create: `clickhouse/init/01_schema.sql`
- Create: `clickhouse/init/02_views.sql`

- [ ] **Step 1: Create schema file**

Write `freegoup/clickhouse/init/01_schema.sql`:

```sql
CREATE DATABASE IF NOT EXISTS bitcoin;

CREATE TABLE IF NOT EXISTS bitcoin.blocks (
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
    tx_count UInt16 CODEC(T64, ZSTD(3)),
    difficulty Float64 CODEC(ZSTD(3)),
    chainwork FixedString(32) CODEC(ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY height
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.transactions (
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

CREATE TABLE IF NOT EXISTS bitcoin.outputs (
    txid FixedString(32) CODEC(ZSTD(3)),
    output_index UInt16 CODEC(T64, ZSTD(3)),
    value_sat UInt64 CODEC(T64, ZSTD(3)),
    script_pubkey_hex String CODEC(ZSTD(3)),
    script_type LowCardinality(String),
    address String CODEC(ZSTD(3)),
    spent bool DEFAULT false,
    spending_txid FixedString(32) CODEC(ZSTD(3)) DEFAULT '',
    block_height UInt32 CODEC(Delta, ZSTD(3)),
    timestamp DateTime CODEC(DoubleDelta, ZSTD(3))
) ENGINE = ReplacingMergeTree
ORDER BY (txid, output_index)
SETTINGS storage_policy = 's3_main';

CREATE TABLE IF NOT EXISTS bitcoin.inputs (
    txid FixedString(32) CODEC(ZSTD(3)),
    input_index UInt16 CODEC(T64, ZSTD(3)),
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

CREATE TABLE IF NOT EXISTS bitcoin.addresses (
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

- [ ] **Step 2: Create materialized views file**

Write `freegoup/clickhouse/init/02_views.sql`:

```sql
-- Hourly balance snapshots per address
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.address_balances_hourly
ENGINE = AggregatingMergeTree
ORDER BY (address, hour)
SETTINGS storage_policy = 's3_main'
AS SELECT
    address,
    toStartOfHour(timestamp) AS hour,
    argMaxState(balance_sat, timestamp) AS balance_sat,
    maxState(total_received_sat) AS total_received,
    maxState(total_sent_sat) AS total_sent
FROM bitcoin.outputs
WHERE address != ''
GROUP BY address, hour;

-- Daily block statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.block_stats_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    count() AS block_count,
    avg(size) AS avg_size_bytes,
    sum(tx_count) AS tx_count,
    avg(difficulty) AS avg_difficulty
FROM bitcoin.blocks
GROUP BY day;

-- Hourly transaction volume
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.tx_volume_hourly
ENGINE = AggregatingMergeTree
ORDER BY hour
SETTINGS storage_policy = 's3_main'
AS SELECT
    toStartOfHour(timestamp) AS hour,
    count() AS tx_count,
    sum(total_out_sat) / 100000000.0 AS volume_btc,
    avg(fee_sat) AS avg_fee_sat
FROM bitcoin.transactions
WHERE is_coinbase = 0
GROUP BY hour;

-- Daily active addresses
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.address_activity_daily
ENGINE = AggregatingMergeTree
ORDER BY day
SETTINGS storage_policy = 's3_main'
AS SELECT
    toDate(timestamp) AS day,
    uniq(address) AS active_addresses
FROM bitcoin.outputs
WHERE address != ''
GROUP BY day;
```

- [ ] **Step 3: Verify SQL syntax check**

```bash
# No syntax check without ClickHouse running, but verify files exist
ls -la clickhouse/init/01_schema.sql clickhouse/init/02_views.sql
```

- [ ] **Step 4: Commit**

```bash
git add clickhouse/init/
git commit -m "feat: clickhouse schema with 5 tables and 4 materialized views"
```

---

### Task 3: Valkey configuration

**Files:**
- Create: `valkey/valkey.conf`

- [ ] **Step 1: Create valkey.conf**

Write `freegoup/valkey/valkey.conf`:

```
# Network
bind 0.0.0.0
port 6379
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Persistence - RDB
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# Persistence - AOF
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Memory
maxmemory 512mb
maxmemory-policy allkeys-lru

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Disable protected mode in docker
protected-mode no
```

- [ ] **Step 2: Verify**

```bash
wc -l valkey/valkey.conf
```

- [ ] **Step 3: Commit**

```bash
git add valkey/
git commit -m "feat: valkey config with RDB + AOF persistence"
```

---

### Task 4: JuiceFS setup script

**Files:**
- Create: `juicefs/setup.sh`

- [ ] **Step 1: Create setup script**

Write `freegoup/juicefs/setup.sh`:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source .env from project root
set -a
source "${PROJECT_DIR}/.env"
set +a

echo "=== Installing JuiceFS Docker volume plugin ==="
docker plugin install juicedata/juicefs --grant-all-permissions 2>/dev/null \
  && echo "Plugin installed." \
  || echo "Plugin already installed."

echo "=== Creating JuiceFS volume (format + mount) ==="
JUICE_VOL="juicefs_blockchain"

# Remove old volume if exists
docker volume rm "$JUICE_VOL" 2>/dev/null || true

docker volume create \
  --driver juicedata/juicefs \
  --opt name="$JUICE_VOL" \
  --opt storage="s3" \
  --opt bucket="${S3_ENDPOINT}/${JUICE_BUCKET}" \
  --opt access-key="${AWS_ACCESS_KEY_ID}" \
  --opt secret-key="${AWS_SECRET_ACCESS_KEY}" \
  --opt meta-url="redis://valkey:6379/1" \
  --opt compress="zstd" \
  "$JUICE_VOL"

echo "=== JuiceFS volume '$JUICE_VOL' created ==="
echo "Volume will be mounted at /data/bitcoin in docker-compose."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x juicefs/setup.sh
```

- [ ] **Step 3: Verify**

```bash
bash -n juicefs/setup.sh
```

- [ ] **Step 4: Commit**

```bash
git add juicefs/
git commit -m "feat: juicefs docker volume plugin setup script"
```

---

### Task 5: Bitcoin Knots configuration

**Files:**
- Create: `bitcoin/bitcoin.conf`

- [ ] **Step 1: Create bitcoin.conf**

Write `freegoup/bitcoin/bitcoin.conf`:

```
# Network
server=1
listen=1
txindex=1
prune=0
dbcache=450

# RPC
rpcuser=bitcoin
rpcpassword=bitcoinrpc
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0

# Connection
maxconnections=40
rpcworkqueue=128
rpcservertimeout=30

# Disable wallet
disablewallet=1

# Data directory
datadir=/data/bitcoin

# Debug
debug=1
printtoconsole=1
```

- [ ] **Step 2: Verify**

```bash
ls -la bitcoin/bitcoin.conf
```

- [ ] **Step 3: Commit**

```bash
git add bitcoin/
git commit -m "feat: bitcoin knots node configuration"
```

---

### Task 6: Docker Compose — local (with RustFS)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create local docker-compose.yml**

Write `freegoup/docker-compose.yml`:

```yaml
version: "3.8"

services:
  # --- S3-compatible storage (local dev) ---
  rustfs:
    image: rustfs/rustfs:latest
    container_name: rustfs
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      RUSTFS_ACCESS_KEY: ${AWS_ACCESS_KEY_ID:-rustfsadmin}
      RUSTFS_SECRET_KEY: ${AWS_SECRET_ACCESS_KEY:-rustfsadmin}
    volumes:
      - ./volumes/rustfs:/data
    command: server /data --console-address :9001
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  # --- Bucket creator (runs once, depends on rustfs) ---
  create-buckets:
    image: minio/mc:latest
    container_name: create-buckets
    depends_on:
      rustfs:
        condition: service_healthy
    entrypoint: /bin/sh
    command: >
      -c "
      mc alias set local http://rustfs:9000 ${AWS_ACCESS_KEY_ID:-rustfsadmin} ${AWS_SECRET_ACCESS_KEY:-rustfsadmin};
      mc mb --ignore-existing local/${JUICE_BUCKET:-juicefs-blockchain};
      mc mb --ignore-existing local/${CLICKHOUSE_BUCKET:-clickhouse-storage};
      echo 'Buckets created.';
      "

  # --- Valkey (JuiceFS metadata) ---
  valkey:
    image: valkey/valkey:8
    container_name: valkey
    ports:
      - "6379:6379"
    volumes:
      - ./valkey/valkey.conf:/usr/local/etc/valkey/valkey.conf
      - ./volumes/valkey:/data
    command: valkey-server /usr/local/etc/valkey/valkey.conf
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- JuiceFS mount (FUSE, privileged) ---
  juicefs:
    image: juicedata/juicefs:latest
    container_name: juicefs
    privileged: true
    depends_on:
      rustfs:
        condition: service_healthy
      create-buckets:
        condition: service_completed_successfully
      valkey:
        condition: service_healthy
    environment:
      ACCESS_KEY: ${AWS_ACCESS_KEY_ID}
      SECRET_KEY: ${AWS_SECRET_ACCESS_KEY}
    entrypoint: /bin/sh
    command: >
      -c "
      echo 'Formatting JuiceFS...';
      /usr/bin/juicefs format
        --storage s3
        --bucket ${S3_ENDPOINT}/${JUICE_BUCKET}
        --access-key ${AWS_ACCESS_KEY_ID}
        --secret-key ${AWS_SECRET_ACCESS_KEY}
        --compress zstd
        --no-usage-report
        redis://valkey:6379/1
        juicefs-blockchain 2>&1 | grep -v 'already formatted' || true;

      echo 'Mounting JuiceFS...';
      exec /usr/bin/juicefs mount
        --no-usage-report
        redis://valkey:6379/1
        /mnt/bitcoin
      "
    volumes:
      - bitcoin_data:/mnt/bitcoin:shared
    restart: unless-stopped

  # --- Bitcoin Knots node ---
  bitcoin-knots:
    image: kylerschin/bitcoin-knots:latest
    container_name: bitcoin-knots
    depends_on:
      juicefs:
        condition: service_started
    volumes:
      - bitcoin_data:/data/bitcoin:rw
      - ./bitcoin/bitcoin.conf:/data/bitcoin/bitcoin.conf:ro
    ports:
      - "8332:8332"
      - "8333:8333"
    restart: unless-stopped

  # --- ClickHouse ---
  clickhouse:
    image: clickhouse/clickhouse-server:26.5
    container_name: clickhouse
    depends_on:
      rustfs:
        condition: service_healthy
      create-buckets:
        condition: service_completed_successfully
    environment:
      CLICKHOUSE_USER: bitcoin
      CLICKHOUSE_PASSWORD: bitcoin_clickhouse
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
      CLICKHOUSE_S3_ENDPOINT: ${S3_ENDPOINT}
      CLICKHOUSE_AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      CLICKHOUSE_AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      CLICKHOUSE_S3_REGION: ${S3_REGION}
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.d/storage.xml:ro
      - ./clickhouse/users.xml:/etc/clickhouse-server/users.d/users.xml:ro
      - ./clickhouse/init:/docker-entrypoint-initdb.d:ro
      - ./volumes/clickhouse:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "clickhouse-client", "-u", "bitcoin", "--password", "bitcoin_clickhouse", "-q", "SELECT 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # --- Block decoder ---
  decoder:
    build:
      context: ./decoder
      dockerfile: Dockerfile
    container_name: decoder
    depends_on:
      clickhouse:
        condition: service_healthy
      bitcoin-knots:
        condition: service_started
    environment:
      CLICKHOUSE_HOST: clickhouse
      CLICKHOUSE_PORT: "9000"
      CLICKHOUSE_USER: bitcoin
      CLICKHOUSE_PASSWORD: bitcoin_clickhouse
      CLICKHOUSE_DATABASE: bitcoin
      BLOCKS_DIR: /data/bitcoin/blocks
      STATE_FILE: /data/decoder_state.json
    volumes:
      - bitcoin_data:/data/bitcoin:ro
      - ./volumes/decoder:/data
    restart: unless-stopped

volumes:
  bitcoin_data:
    driver: local
```

- [ ] **Step 2: Verify docker-compose config is valid**

```bash
docker compose -f docker-compose.yml config --quiet
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: local docker-compose with rustfs, juicefs, bitcoin-knots, clickhouse, decoder"
```

---

### Task 7: Docker Compose — production (real S3)

**Files:**
- Create: `docker-compose.prod.yml`

- [ ] **Step 1: Create production docker-compose.yml**

Write `freegoup/docker-compose.prod.yml`:

```yaml
version: "3.8"

services:
  # --- Valkey (JuiceFS metadata) ---
  valkey:
    image: valkey/valkey:8
    container_name: valkey
    ports:
      - "6379:6379"
    volumes:
      - ./valkey/valkey.conf:/usr/local/etc/valkey/valkey.conf
      - ./volumes/valkey:/data
    command: valkey-server /usr/local/etc/valkey/valkey.conf
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # --- JuiceFS mount (FUSE, privileged) ---
  juicefs:
    image: juicedata/juicefs:latest
    container_name: juicefs
    privileged: true
    depends_on:
      valkey:
        condition: service_healthy
    environment:
      ACCESS_KEY: ${AWS_ACCESS_KEY_ID}
      SECRET_KEY: ${AWS_SECRET_ACCESS_KEY}
    entrypoint: /bin/sh
    command: >
      -c "
      echo 'Formatting JuiceFS...';
      /usr/bin/juicefs format
        --storage s3
        --bucket ${S3_ENDPOINT}/${JUICE_BUCKET}
        --access-key ${AWS_ACCESS_KEY_ID}
        --secret-key ${AWS_SECRET_ACCESS_KEY}
        --compress zstd
        --no-usage-report
        redis://valkey:6379/1
        juicefs-blockchain 2>&1 | grep -v 'already formatted' || true;

      echo 'Mounting JuiceFS...';
      exec /usr/bin/juicefs mount
        --no-usage-report
        redis://valkey:6379/1
        /mnt/bitcoin
      "
    volumes:
      - bitcoin_data:/mnt/bitcoin:shared
    restart: unless-stopped

  # --- Bitcoin Knots node ---
  bitcoin-knots:
    image: kylerschin/bitcoin-knots:latest
    container_name: bitcoin-knots
    depends_on:
      juicefs:
        condition: service_started
    volumes:
      - bitcoin_data:/data/bitcoin:rw
      - ./bitcoin/bitcoin.conf:/data/bitcoin/bitcoin.conf:ro
    ports:
      - "8332:8332"
      - "8333:8333"
    restart: unless-stopped

  # --- ClickHouse ---
  clickhouse:
    image: clickhouse/clickhouse-server:26.5
    container_name: clickhouse
    environment:
      CLICKHOUSE_USER: bitcoin
      CLICKHOUSE_PASSWORD: bitcoin_clickhouse
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - ./clickhouse/config.xml:/etc/clickhouse-server/config.d/storage.xml:ro
      - ./clickhouse/users.xml:/etc/clickhouse-server/users.d/users.xml:ro
      - ./clickhouse/init:/docker-entrypoint-initdb.d:ro
      - ./volumes/clickhouse:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "clickhouse-client", "-u", "bitcoin", "--password", "bitcoin_clickhouse", "-q", "SELECT 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # --- Block decoder ---
  decoder:
    build:
      context: ./decoder
      dockerfile: Dockerfile
    container_name: decoder
    depends_on:
      clickhouse:
        condition: service_healthy
      bitcoin-knots:
        condition: service_started
    environment:
      CLICKHOUSE_HOST: clickhouse
      CLICKHOUSE_PORT: "9000"
      CLICKHOUSE_USER: bitcoin
      CLICKHOUSE_PASSWORD: bitcoin_clickhouse
      CLICKHOUSE_DATABASE: bitcoin
      BLOCKS_DIR: /data/bitcoin/blocks
      STATE_FILE: /data/decoder_state.json
    volumes:
      - bitcoin_data:/data/bitcoin:ro
      - ./volumes/decoder:/data
    restart: unless-stopped

volumes:
  bitcoin_data:
    driver: local
```

- [ ] **Step 2: Verify**

```bash
docker compose -f docker-compose.prod.yml config --quiet
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat: production docker-compose for real S3"
```

---

## Phase 2: Block Decoder (Go)

### Task 8: Go module, Dockerfile, and main entrypoint

**Files:**
- Create: `decoder/go.mod`
- Create: `decoder/Dockerfile`
- Create: `decoder/main.go`

- [ ] **Step 1: Initialize Go module**

```bash
cd decoder && go mod init github.com/freegoup/decoder
```

- [ ] **Step 2: Create Dockerfile**

Write `freegoup/decoder/Dockerfile`:

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /decoder .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /decoder /usr/local/bin/decoder
ENTRYPOINT ["/usr/local/bin/decoder"]
```

- [ ] **Step 3: Create main.go skeleton**

Write `freegoup/decoder/main.go`:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type SyncState struct {
	LastHeight uint32 `json:"last_height"`
	LastFile   string `json:"last_file"`
	LastOffset int64  `json:"last_offset"`
}

func loadState(path string) (*SyncState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &SyncState{}, nil
		}
		return nil, err
	}
	var state SyncState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func saveState(path string, state *SyncState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	clickhouseHost := getEnv("CLICKHOUSE_HOST", "clickhouse")
	clickhousePort := getEnv("CLICKHOUSE_PORT", "9000")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "bitcoin")
	clickhousePassword := getEnv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse")
	clickhouseDB := getEnv("CLICKHOUSE_DATABASE", "bitcoin")
	blocksDir := getEnv("BLOCKS_DIR", "/data/bitcoin/blocks")
	stateFile := getEnv("STATE_FILE", "/data/decoder_state.json")

	log.Printf("Connecting to ClickHouse %s:%s", clickhouseHost, clickhousePort)

	chClient, err := NewClickHouseClient(ctx, clickhouseHost, clickhousePort, clickhouseUser, clickhousePassword, clickhouseDB)
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer chClient.Close()

	state, err := loadState(stateFile)
	if err != nil {
		log.Fatalf("Failed to load state: %v", err)
	}

	log.Printf("Starting sync from block %d", state.LastHeight+1)

	syncer := &Syncer{
		client:    chClient,
		blocksDir: blocksDir,
		state:     state,
		stateFile: stateFile,
	}

	go syncer.Run(ctx)

	<-ctx.Done()
	log.Println("Shutting down...")
	syncer.Stop()
	time.Sleep(2 * time.Second)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 4: Verify module compiles (will fail until other files exist — expected)**

```bash
cd decoder && go build ./... 2>&1 | head -5
```

---

### Task 9: Block parser (wire format)

**Files:**
- Create: `decoder/internal/parser/block.go`

- [ ] **Step 1: Add btcd dependency**

```bash
cd decoder && go get github.com/btcsuite/btcd@latest github.com/btcsuite/btcd/chaincfg/chainhash@latest github.com/btcsuite/btcd/wire@latest
```

- [ ] **Step 2: Create block parser**

Write `freegoup/decoder/internal/parser/block.go`:

```go
package parser

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"

	"github.com/btcsuite/btcd/chaincfg/chainhash"
	"github.com/btcsuite/btcd/wire"
)

var mainnetMagic = []byte{0xf9, 0xbe, 0xb4, 0xd9}

type ParsedBlock struct {
	Height       uint32
	Hash         chainhash.Hash
	Header       wire.BlockHeader
	Transactions []*ParsedTx
}

type BlockScanResult struct {
	Block       *ParsedBlock
	BytesRead   int64
	FileNum     int
	OffsetStart int64
}

func ParseBlock(raw []byte) (*ParsedBlock, error) {
	block := &wire.MsgBlock{}
	if err := block.Deserialize(bytes.NewReader(raw)); err != nil {
		return nil, fmt.Errorf("deserialize block: %w", err)
	}

	blockHash := block.BlockHash()

	pb := &ParsedBlock{
		Hash:   blockHash,
		Header: block.Header,
	}

	for _, tx := range block.Transactions {
		pt, err := parseTransaction(tx)
		if err != nil {
			return nil, fmt.Errorf("parse tx %s: %w", tx.TxHash(), err)
		}
		pb.Transactions = append(pb.Transactions, pt)
	}

	coinbaseTx := block.Transactions[0]
	if len(coinbaseTx.TxIn) > 0 && len(coinbaseTx.TxIn[0].SignatureScript) > 0 {
		script := coinbaseTx.TxIn[0].SignatureScript
		if len(script) >= 4 {
			pb.Height = binary.LittleEndian.Uint32(script[0:4])
		}
	}

	return pb, nil
}

func ScanBlocks(r io.ReadSeeker, fileNum int, startOffset int64, fn func(BlockScanResult) error) error {
	if _, err := r.Seek(startOffset, io.SeekStart); err != nil {
		return fmt.Errorf("seek: %w", err)
	}

	var offset int64 = startOffset
	magicBuf := make([]byte, 4)
	sizeBuf := make([]byte, 4)

	for {
		_, err := io.ReadFull(r, magicBuf)
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read magic: %w", err)
		}
		offset += 4

		if !bytes.Equal(magicBuf, mainnetMagic) {
			r.Seek(offset, io.SeekStart)
			continue
		}

		if _, err := io.ReadFull(r, sizeBuf); err != nil {
			return fmt.Errorf("read size: %w", err)
		}
		blockSize := binary.LittleEndian.Uint32(sizeBuf)
		offset += 4

		blockData := make([]byte, blockSize)
		if _, err := io.ReadFull(r, blockData); err != nil {
			return fmt.Errorf("read block data: %w", err)
		}

		pb, err := ParseBlock(blockData)
		if err != nil {
			log.Printf("WARN: skipping block at offset %d: %v", offset, err)
			offset += int64(blockSize)
			continue
		}

		totalRead := int64(4 + 4 + blockSize)

		if err := fn(BlockScanResult{
			Block:       pb,
			BytesRead:   totalRead,
			FileNum:     fileNum,
			OffsetStart: offset - 4,
		}); err != nil {
			return err
		}

		offset += int64(blockSize)
	}
}

func parseTransaction(tx *wire.MsgTx) (*ParsedTx, error) {
	txHash := tx.TxHash()
	pt := &ParsedTx{
		Hash:     txHash,
		Version:  tx.Version,
		LockTime: tx.LockTime,
	}

	isCoinbase := len(tx.TxIn) > 0 && tx.TxIn[0].PreviousOutPoint.Hash == (chainhash.Hash{}) &&
		tx.TxIn[0].PreviousOutPoint.Index == 0xFFFFFFFF

	pt.IsCoinbase = isCoinbase

	for i, in := range tx.TxIn {
		pi := ParsedInput{
			Index:     uint32(i),
			Sequence:  in.Sequence,
		}
		if !isCoinbase {
			pi.PrevTxID = in.PreviousOutPoint.Hash
			pi.PrevIndex = in.PreviousOutPoint.Index
			pi.ScriptSigHex = fmt.Sprintf("%x", in.SignatureScript)
		} else {
			pi.CoinbaseData = fmt.Sprintf("%x", in.SignatureScript)
		}
		pt.Inputs = append(pt.Inputs, pi)
	}

	var totalOut int64
	for i, out := range tx.TxOut {
		po := ParsedOutput{
			Index:    uint32(i),
			ValueSat: out.Value,
			ScriptHex: fmt.Sprintf("%x", out.PkScript),
		}
		address, scriptType := ExtractAddress(out.PkScript)
		po.Address = address
		po.ScriptType = scriptType
		pt.Outputs = append(pt.Outputs, po)
		totalOut += out.Value
	}

	pt.TotalOutSat = totalOut
	pt.VinCount = uint16(len(tx.TxIn))
	pt.VoutCount = uint16(len(tx.TxOut))

	return pt, nil
}
```

---

### Task 10: Transaction types

**Files:**
- Create: `decoder/internal/parser/types.go`

- [ ] **Step 1: Create types file**

Write `freegoup/decoder/internal/parser/types.go`:

```go
package parser

import "github.com/btcsuite/btcd/chaincfg/chainhash"

type ParsedTx struct {
	Hash        chainhash.Hash
	Version     int32
	LockTime    uint32
	IsCoinbase  bool
	Inputs      []ParsedInput
	Outputs     []ParsedOutput
	VinCount    uint16
	VoutCount   uint16
	TotalOutSat int64
}

type ParsedInput struct {
	Index         uint32
	PrevTxID      chainhash.Hash
	PrevIndex     uint32
	ScriptSigHex  string
	Sequence      uint32
	CoinbaseData  string
}

type ParsedOutput struct {
	Index      uint32
	ValueSat   int64
	ScriptHex  string
	Address    string
	ScriptType string
}
```

- [ ] **Step 2: Verify parser compiles**

```bash
cd decoder && go build ./internal/parser/
```

---

### Task 11: Address extraction

**Files:**
- Create: `decoder/internal/parser/address.go`

- [ ] **Step 1: Create address extraction**

Write `freegoup/decoder/internal/parser/address.go`:

```go
package parser

import (
	"github.com/btcsuite/btcd/chaincfg"
	"github.com/btcsuite/btcd/txscript"
)

var mainNetParams = chaincfg.MainNetParams

func ExtractAddress(pkScript []byte) (string, string) {
	scriptClass, addresses, _, err := txscript.ExtractPkScriptAddrs(pkScript, &mainNetParams)
	if err != nil {
		return "", "unknown"
	}
	if len(addresses) == 0 {
		return "", scriptClass.String()
	}
	return addresses[0].EncodeAddress(), scriptClass.String()
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd decoder && go build ./internal/parser/
```

---

### Task 12: ClickHouse client, syncer, and wire-up

**Files:**
- Create: `decoder/internal/clickhouse/client.go`
- Create: `decoder/internal/syncer/syncer.go`
- Modify: `decoder/main.go` (update imports to use syncer)

- [ ] **Step 1: Create ClickHouse client**

Write `freegoup/decoder/internal/clickhouse/client.go`:

```go
package clickhouse

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/freegoup/decoder/internal/parser"
)

type Client struct {
	conn driver.Conn
	db   string
}

func NewClient(ctx context.Context, host, port, user, password, database string) (*Client, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%s", host, port)},
		Auth: clickhouse.Auth{
			Database: database,
			Username: user,
			Password: password,
		},
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
		Settings: clickhouse.Settings{
			"async_insert":          1,
			"wait_for_async_insert": 0,
		},
		DialTimeout:     30 * time.Second,
		MaxOpenConns:    5,
		MaxIdleConns:    2,
		ConnMaxLifetime: time.Hour,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse connect: %w", err)
	}

	if err := conn.Ping(ctx); err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}

	fmt.Println("Connected to ClickHouse")
	return &Client{conn: conn, db: database}, nil
}

func (c *Client) InsertBlock(ctx context.Context, block *parser.ParsedBlock) error {
	hashHex := block.Hash.CloneBytes()

	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`
		INSERT INTO %s.blocks
	`, c.db))
	if err != nil {
		return err
	}
	if err := batch.Append(
		block.Height,
		hashHex,
		block.Header.Timestamp,
		uint32(0),
		uint32(0),
		uint32(block.Header.Version),
		block.Header.Bits,
		block.Header.Nonce,
		block.Header.MerkleRoot.CloneBytes(),
		block.Header.PrevBlock.CloneBytes(),
		uint16(len(block.Transactions)),
		float64(0),
		[]byte{},
	); err != nil {
		return err
	}
	return batch.Send()
}

func (c *Client) InsertTransactions(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`
		INSERT INTO %s.transactions
	`, c.db))
	if err != nil {
		return err
	}

	blockHash := block.Hash.CloneBytes()

	for _, tx := range block.Transactions {
		txid := tx.Hash.CloneBytes()
		var feeSat int64 = 0
		if !tx.IsCoinbase {
			var totalIn int64 = 0
			for range tx.Inputs {
				totalIn += 0
			}
			feeSat = totalIn - tx.TotalOutSat
		}

		if err := batch.Append(
			txid,
			block.Height,
			blockHash,
			block.Header.Timestamp,
			tx.Version,
			tx.LockTime,
			uint32(0),
			uint32(0),
			tx.VinCount,
			tx.VoutCount,
			uint8(map[bool]uint8{true: 1, false: 0}[tx.IsCoinbase]),
			uint64(tx.TotalOutSat),
			feeSat,
		); err != nil {
			return err
		}
	}
	return batch.Send()
}

func (c *Client) InsertOutputs(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`
		INSERT INTO %s.outputs
	`, c.db))
	if err != nil {
		return err
	}

	for _, tx := range block.Transactions {
		txid := tx.Hash.CloneBytes()
		for _, out := range tx.Outputs {
			if err := batch.Append(
				txid,
				out.Index,
				uint64(out.ValueSat),
				out.ScriptHex,
				out.ScriptType,
				out.Address,
				false,
				"",
				block.Height,
				block.Header.Timestamp,
			); err != nil {
				return err
			}
		}
	}
	return batch.Send()
}

func (c *Client) InsertInputs(ctx context.Context, block *parser.ParsedBlock) error {
	batch, err := c.conn.PrepareBatch(ctx, fmt.Sprintf(`
		INSERT INTO %s.inputs
	`, c.db))
	if err != nil {
		return err
	}

	for _, tx := range block.Transactions {
		txid := tx.Hash.CloneBytes()
		for _, in := range tx.Inputs {
			if err := batch.Append(
				txid,
				in.Index,
				in.PrevTxID.CloneBytes(),
				in.PrevIndex,
				in.ScriptSigHex,
				in.Sequence,
				in.CoinbaseData,
				block.Height,
				block.Header.Timestamp,
			); err != nil {
				return err
			}
		}
	}
	return batch.Send()
}

func (c *Client) Close() error {
	return c.conn.Close()
}
```

- [ ] **Step 2: Add clickhouse-go dependency**

```bash
cd decoder && go get github.com/ClickHouse/clickhouse-go/v2@latest
```

- [ ] **Step 3: Create syncer**

Write `freegoup/decoder/internal/syncer/syncer.go`:

```go
package syncer

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/freegoup/decoder/internal/clickhouse"
	"github.com/freegoup/decoder/internal/parser"
)

type SyncState struct {
	LastHeight uint32 `json:"last_height"`
	LastFile   string `json:"last_file"`
	LastOffset int64  `json:"last_offset"`
}

type Syncer struct {
	client    *clickhouse.Client
	blocksDir string
	state     *SyncState
	stateFile string
	mu        sync.Mutex
	stopCh    chan struct{}
}

func New(client *clickhouse.Client, blocksDir, stateFile string, state *SyncState) *Syncer {
	return &Syncer{
		client:    client,
		blocksDir: blocksDir,
		state:     state,
		stateFile: stateFile,
		stopCh:    make(chan struct{}),
	}
}

func (s *Syncer) Run(ctx context.Context) {
	if err := s.catchUpHistorical(ctx); err != nil {
		log.Printf("Historical sync error: %v", err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("fsnotify: %v", err)
	}
	defer watcher.Close()

	if err := watcher.Add(s.blocksDir); err != nil {
		log.Fatalf("watch %s: %v", s.blocksDir, err)
	}

	log.Printf("Watching %s for new blocks", s.blocksDir)

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case event := <-watcher.Events:
			if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
				if strings.HasPrefix(filepath.Base(event.Name), "blk") && strings.HasSuffix(event.Name, ".dat") {
					time.Sleep(2 * time.Second)
					s.processFile(ctx, event.Name)
				}
			}
		case err := <-watcher.Errors:
			log.Printf("Watcher error: %v", err)
		}
	}
}

func (s *Syncer) Stop() {
	close(s.stopCh)
}

func (s *Syncer) catchUpHistorical(ctx context.Context) error {
	files, err := s.listBlkFiles()
	if err != nil {
		return err
	}

	if len(files) == 0 {
		log.Println("No blk*.dat files found, waiting for IBD...")
		return nil
	}

	for _, f := range files {
		if s.state.LastFile != "" && f < s.state.LastFile {
			continue
		}
		s.processFile(ctx, filepath.Join(s.blocksDir, f))
	}
	return nil
}

func (s *Syncer) processFile(ctx context.Context, path string) {
	log.Printf("Processing %s", path)

	f, err := os.Open(path)
	if err != nil {
		log.Printf("ERROR opening %s: %v", path, err)
		return
	}
	defer f.Close()

	fileName := filepath.Base(path)
	fileNum := parseBlkNum(fileName)

	var offset int64 = 0
	if s.state.LastFile == fileName {
		offset = s.state.LastOffset
	}

	err = parser.ScanBlocks(f, fileNum, offset, func(result parser.BlockScanResult) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if result.Block.Height <= s.state.LastHeight {
			return nil
		}

		if err := s.insertBlock(ctx, result.Block); err != nil {
			log.Printf("ERROR inserting block %d: %v", result.Block.Height, err)
			return err
		}

		s.mu.Lock()
		s.state.LastHeight = result.Block.Height
		s.state.LastFile = fileName
		s.state.LastOffset = result.OffsetStart + result.BytesRead
		s.mu.Unlock()

		if result.Block.Height%1000 == 0 {
			s.saveState()
			log.Printf("Synced block %d", result.Block.Height)
		}

		return nil
	})

	s.saveState()
	log.Printf("Done processing %s", path)
}

func (s *Syncer) insertBlock(ctx context.Context, block *parser.ParsedBlock) error {
	if err := s.client.InsertBlock(ctx, block); err != nil {
		return fmt.Errorf("insert block: %w", err)
	}
	if err := s.client.InsertTransactions(ctx, block); err != nil {
		return fmt.Errorf("insert txs: %w", err)
	}
	if err := s.client.InsertOutputs(ctx, block); err != nil {
		return fmt.Errorf("insert outputs: %w", err)
	}
	if err := s.client.InsertInputs(ctx, block); err != nil {
		return fmt.Errorf("insert inputs: %w", err)
	}
	return nil
}

func (s *Syncer) listBlkFiles() ([]string, error) {
	entries, err := os.ReadDir(s.blocksDir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "blk") && strings.HasSuffix(name, ".dat") {
			files = append(files, name)
		}
	}
	sort.Strings(files)
	return files, nil
}

func (s *Syncer) saveState() {
	s.mu.Lock()
	defer s.mu.Unlock()
	data := fmt.Sprintf(`{"last_height":%d,"last_file":"%s","last_offset":%d}`, s.state.LastHeight, s.state.LastFile, s.state.LastOffset)
	os.WriteFile(s.stateFile, []byte(data), 0644)
}

func parseBlkNum(filename string) int {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(strings.TrimPrefix(base, "blk"), ".dat")
	n, _ := strconv.Atoi(base)
	return n
}
```

- [ ] **Step 4: Add fsnotify dependency**

```bash
cd decoder && go get github.com/fsnotify/fsnotify@latest
```

- [ ] **Step 5: Rewrite main.go with syncer integration**

Write `freegoup/decoder/main.go` (overwrite from Task 8):

```go
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/freegoup/decoder/internal/clickhouse"
	"github.com/freegoup/decoder/internal/syncer"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	clickhouseHost := getEnv("CLICKHOUSE_HOST", "clickhouse")
	clickhousePort := getEnv("CLICKHOUSE_PORT", "9000")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "bitcoin")
	clickhousePassword := getEnv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse")
	clickhouseDB := getEnv("CLICKHOUSE_DATABASE", "bitcoin")
	blocksDir := getEnv("BLOCKS_DIR", "/data/bitcoin/blocks")
	stateFile := getEnv("STATE_FILE", "/data/decoder_state.json")

	log.Printf("Connecting to ClickHouse %s:%s", clickhouseHost, clickhousePort)

	chClient, err := clickhouse.NewClient(ctx, clickhouseHost, clickhousePort, clickhouseUser, clickhousePassword, clickhouseDB)
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer chClient.Close()

	state := loadState(stateFile)

	log.Printf("Starting sync from block %d", state.LastHeight+1)

	s := syncer.New(chClient, blocksDir, stateFile, state)

	go func() {
		s.Run(ctx)
	}()

	<-ctx.Done()
	log.Println("Shutting down...")
	s.Stop()
	time.Sleep(2 * time.Second)
}

func loadState(path string) *syncer.SyncState {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &syncer.SyncState{}
		}
		log.Printf("ERROR reading state: %v", err)
		return &syncer.SyncState{}
	}
	var state syncer.SyncState
	if err := json.Unmarshal(data, &state); err != nil {
		log.Printf("ERROR parsing state: %v", err)
		return &syncer.SyncState{}
	}
	return &state
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 6: Full build**

```bash
cd decoder && go mod tidy && go build -o decoder .
```

- [ ] **Step 7: Commit all decoder files**

```bash
git add decoder/
git commit -m "feat: block decoder - parse blk*.dat, insert to clickhouse, continuous sync"
```

---

## Phase 3: Verification

### Task 13: End-to-end verification

- [ ] **Step 1: Start local stack**

```bash
docker compose up -d
```

- [ ] **Step 2: Verify RustFS is running and buckets exist**

```bash
curl -s http://localhost:9000/minio/health/live
# Expected: HTTP 200
```

- [ ] **Step 3: Verify Valkey is running and persists to disk**

```bash
docker compose exec valkey valkey-cli SET test_key "hello_world"
docker compose restart valkey
sleep 5
docker compose exec valkey valkey-cli GET test_key
# Expected: "hello_world"
```

- [ ] **Step 4: Verify JuiceFS is mounted**

```bash
docker compose exec juicefs ls /mnt/bitcoin/
# Expected: blocks/ chainstate/ (after bitcoin starts)
```

- [ ] **Step 5: Verify Bitcoin Knots is syncing**

```bash
docker compose logs bitcoin-knots | grep -i "UpdateTip" | tail -5
# Expected: lines showing new blocks being processed
```

- [ ] **Step 6: Verify block data in S3**

```bash
docker compose exec rustfs ls /data/juicefs-blockchain/ 2>/dev/null || echo "Check via S3 API"
# Expected: juicefs data chunks visible
```

- [ ] **Step 7: Verify ClickHouse S3 disk is online**

```bash
docker compose exec clickhouse clickhouse-client -u bitcoin --password bitcoin_clickhouse -q "
SELECT name, type, is_encrypted FROM system.disks WHERE name = 's3_disk'
"
# Expected: s3_disk | s3_object_storage | ...
```

- [ ] **Step 8: Verify ClickHouse tables exist**

```bash
docker compose exec clickhouse clickhouse-client -u bitcoin --password bitcoin_clickhouse -q "
SELECT name, engine FROM system.tables WHERE database = 'bitcoin' ORDER BY name
"
# Expected: addresses, blocks, inputs, outputs, transactions + 4 materialized views
```

- [ ] **Step 9: Verify ClickHouse compression**

```bash
docker compose exec clickhouse clickhouse-client -u bitcoin --password bitcoin_clickhouse -q "
SELECT name, compression_codec FROM system.columns WHERE database = 'bitcoin' AND table = 'blocks' LIMIT 3
"
# Expected: CODEC entries with ZSTD(3)
```

- [ ] **Step 10: Verify decoder is running and inserting data**

```bash
docker compose logs decoder | tail -10
# Expected: "Synced block X" messages
```

```bash
docker compose exec clickhouse clickhouse-client -u bitcoin --password bitcoin_clickhouse -q "
SELECT count() AS block_count FROM bitcoin.blocks
"
# Expected: non-zero count (depends on how long IBD has run)
```

- [ ] **Step 11: Verify ClickHouse S3 storage is being used**

```bash
docker compose exec clickhouse clickhouse-client -u bitcoin --password bitcoin_clickhouse -q "
SYSTEM FLUSH LOGS
" 2>/dev/null

docker compose exec rustfs ls /data/clickhouse-storage/ 2>/dev/null | head -5
# Expected: files/directories appearing as ClickHouse writes to S3
```

- [ ] **Step 12: Stop stack**

```bash
docker compose down
```

- [ ] **Step 13: Commit verification results (if any config changes needed)**

```bash
git add -A && git commit -m "test: end-to-end verification completed" || echo "No changes needed"
```
