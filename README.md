# CypherGlass

Bitcoin blockchain analytics platform: full node → block decoder → ClickHouse analytics store.

Pipeline: **Bitcoin Knots** (block data) → **JuiceFS** (S3-backed FUSE) → **decoder** (Go, parses `blk*.dat`) → **ClickHouse** (blocks, transactions, inputs, outputs, addresses). **Valkey** holds JuiceFS metadata. **RustFS** provides local S3-compatible storage for dev.

## Architecture

```
                ┌──────────┐  blk*.dat   ┌─────────┐  batches   ┌────────────┐
                │ bitcoin  ├────────────►│ decoder ├───────────►│ clickhouse │
                │ knots    │             │  (Go)   │            │  (S3 disk) │
                └────▲─────┘             └────▲────┘            └────▲───────┘
                     │ FUSE                   │ watches                │ S3
                ┌────┴─────┐             ┌────┴────┐            ┌──────┴──────┐
                │ juicefs  │◄────────────┤ valkey  │            │ rustfs (dev)│
                │ (S3+meta)│  metadata   │ (meta)  │            │ or AWS (prod)│
                └──────────┘             └─────────┘            └─────────────┘
```

Services (local `docker-compose.yml`):

| Service | Image | Purpose | Ports (host) |
|---|---|---|---|
| `rustfs` | `rustfs/rustfs` | Local S3 (`juicefs-blockchain`, `clickhouse-storage`) | 9010→9000, 9011→9001 |
| `create-buckets` | `minio/mc` | One-shot bucket creation | – |
| `valkey` | `valkey/valkey:8` | JuiceFS metadata store | 6381→6379 |
| `bitcoin-knots` | `freegoup-allinone` | Node + JuiceFS mount + decoder, all-in-one | 8332, 8333 |
| `clickhouse` | `clickhouse/clickhouse-server:26.7` | Analytics DB, S3-backed storage policy | 8124→8123, 9002→9000 |

Production (`docker-compose.prod.yml`) splits `juicefs`, `bitcoin-knots`, and `decoder` into separate containers, uses real S3 (`S3_ENDPOINT`), requires `CLICKHOUSE_PASSWORD` and `AWS_*` from the environment, and stores chain data in a named `bitcoin_data` volume.

## Repository layout

```
bitcoin/bitcoin.conf          node config (dev defaults, no txindex, no wallet)
clickhouse/config.xml         S3 storage policy (s3_main)
clickhouse/users.xml          users, from_env password w/ dev fallback
clickhouse/init/01_schema.sql 5 tables: blocks, transactions, outputs, inputs, addresses
clickhouse/init/02_views.sql  materialized views / aggregations
decoder/                      Go source: parser (btcd wire), clickhouse client, syncer
decoder/main.go               entrypoint, env config, retry ClickHouse, resume from state
decoder/internal/parser/      block/tx/input/output types, address extraction
decoder/internal/clickhouse/  batched inserts per block
decoder/internal/syncer/      historical catch-up + fsnotify watch + poll fallback (FUSE)
valkey/valkey.conf            RDB + AOF persistence
juicefs/                      Dockerfiles + entrypoints (all-in-one vs split)
docs/                         design plans/specs
```

## Prerequisites

- Docker + Docker Compose v2
- 100+ GB free disk for a growing chain (or prune/mount remote S3 in prod)
- Copy env template before first run

## Quickstart (local)

```bash
cp .env.example .env
# edit .env: set strong VALKEY_PASSWORD / BITCOIN_RPC_PASSWORD / CLICKHOUSE_PASSWORD for anything beyond localhost
docker compose up -d --build
docker compose logs -f bitcoin-knots decoder clickhouse
```

Check progress:

```bash
# decoder resume state ($DATA_ROOT, default ./volumes)
cat ${DATA_ROOT:-./volumes}/decoder/decoder_state.json
# ClickHouse row counts (HTTP interface, host port 8124)
curl 'http://localhost:8124/?query=SELECT%20count()%20FROM%20bitcoin.blocks'
curl 'http://localhost:8124/?query=SELECT%20max(height)%20FROM%20bitcoin.blocks'
```

Stop:

```bash
docker compose down
# full reset (deletes local chain + DB):
# docker compose down -v && rm -rf ${DATA_ROOT:-./volumes}/*
```

## Configuration

All tuning via environment (see `.env.example`). Never commit `.env`.

| Var | Default (dev) | Used by |
|---|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `rustfsadmin` (local only) | rustfs, juicefs, clickhouse S3 disk |
| `S3_ENDPOINT` | `http://rustfs:9000` | juicefs, clickhouse |
| `S3_REGION` | `us-east-1` | S3 clients |
| `JUICE_BUCKET` / `CLICKHOUSE_BUCKET` | `juicefs-blockchain` / `clickhouse-storage` | bucket creator |
| `VALKEY_PASSWORD` | empty (set in prod) | valkey |
| `BITCOIN_RPC_USER` / `BITCOIN_RPC_PASSWORD` | `bitcoin` / dev default | node |
| `CLICKHOUSE_HOST` / `CLICKHOUSE_PORT` / `CLICKHOUSE_DATABASE` | `clickhouse` / `9000` / `bitcoin` | decoder |
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` | `bitcoin` / dev default, **required in prod compose** | clickhouse, decoder |
| `BLOCKS_DIR` / `STATE_FILE` | `/home/bitcoin/.bitcoin/blocks` (all-in-one) or `/data/bitcoin/blocks` (split) / `/data/decoder_state.json` | decoder |
| `DATA_ROOT` | `./volumes` (set to `/run/media/wairuru/filos/cypherglass-volumes` to keep bulk data off root disk) | all bind mounts |

Prod requires `CLICKHOUSE_PASSWORD` and real `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (`docker-compose.prod.yml` fails fast with `?set ... in .env` if missing).

## Decoder

Parses raw `blk*.dat` files (handles Bitcoin Core obfuscation via `xor.dat`), extracts blocks/transactions/inputs/outputs/addresses with `btcsuite/btcd`, and inserts per-block batches into ClickHouse.

- Historical catch-up on start from `STATE_FILE` (`last_height`, `last_file`, `last_offset`), then watches `BLOCKS_DIR` with `fsnotify` plus a poll fallback (events are unreliable on FUSE/JuiceFS mounts).
- Retries ClickHouse forever at 5 s intervals on boot (long outages must not crash-loop).
- Prefers parser (BIP34 coinbase) height; sequential fallback only for pre-BIP34 zero-height blocks. Logs REORG suspects via `prev_hash` linkage (fork rows kept; backfill TODO).
- State saved incrementally on success only; failure returns without checkpointing past bad block. State file `0600`, lives in `$DATA_ROOT/decoder/decoder_state.json` (host mounted, survives restarts).
- UTXO map bounded at 5M entries (log + value 0 on overflow, no OOM). Restart needs ClickHouse backfill (TODO).

Build locally:

```bash
cd decoder && go build -o /tmp/decoder .
```

## ClickHouse schema

All tables are `ReplacingMergeTree` on S3 (`storage_policy = 's3_main'`), ZSTD:

- v1 legacy: `bitcoin.blocks`, `transactions`, `outputs`, `inputs`, `addresses` (dual-written; cut v1 when ready).
- v2: `blocks_v2`, `transactions_v2`, `outputs_v2`, `inputs_v2` (+ `addresses_v2` unwritten — sweeper TODO; `outputs_v2.spent` always 0 until sweeper lands).
- Projections in `04_projections.sql`, MVs in `05_mvs.sql`, marts in `06_marts.sql`, bloom indexes in `07_indexes.sql`,
  extended MVs in `08_extended_mvs.sql` (script/fee/size/value/outputs daily+hourly),
  derived marts in `09_derived_marts.sql` (supply, price_tech, risk, bands, issuance),
  extra indexes in `10_extra_indexes.sql` (fresh volumes only; existing volumes apply manually via `scripts/e2e_onchain.py --apply-ddl` or `scripts/seed_dev.py`).
- Queries must use `FINAL` / `-Merge` combinators; `ReplacingMergeTree` returns duplicates otherwise. NVT supply window bounded to `<= to`.
- Query via native port `9005` or HTTP `8124` on the host (dev compose maps `9005:9000`, `8124:8123`).

## Analytics platform (210 charts)

- Backend catalog `backend/app/metrics/registry.py`: 210 metrics, all reading ONLY `bitcoin.mv_*`, `marts.*`, `bitcoin.price_ohlc_*` (enforced by `test_no_base_table_reads`). Families: network, fees, mining, addresses, flow, supply/hodl, valuation (MVRV/Z, NUPL, realized), profitability (SOPR, Puell), script (P2PKH/P2SH/P2WPKH/P2WSH/P2TR + pubkey), price/tech (SMA/EMA/Mayer/drawdown/RSI/vol), cycle bands (200W, 2Y, Pi, CVDD), risk composite 0-100, issuance/S2F.
- Frontend `Dashboard`: Single (existing hero + onchain with drawings) + Overview (risk header + 9-chart grid) + Compare (pin up to 4). `MetricList` adds category filter with counts. 233 vitest pass.
- Dev seed without full chain: `backend/.venv/bin/python scripts/seed_dev.py` populates 422d price + 10 marts from existing `mv_blocks_daily` (2009-2010 era). No `bitcoin-knots` download required for dev.
- S3 speed: AggregatingMergeTree `-State` MVs, monthly partitions, ZSTD(7/9), `FINAL`/`-Merge` reads, weekly rollups via `toStartOfWeek`, SMA via window functions, marts via `argMax(..., updated_at)`.

## Security notes

- Dev defaults (`rustfsadmin`, `bitcoinrpc`, `bitcoin_clickhouse`) are localhost-only conveniences. Prod must override via `.env`; `docker-compose.prod.yml` enforces this for ClickHouse and S3.
- ClickHouse `bitcoin` user reads `CLICKHOUSE_PASSWORD` from env (no fallback); `default` user locked to `127.0.0.1`. Valkey metadata uses `noeviction` (never evict JuiceFS keys).
- FUSE containers use `cap_add: SYS_ADMIN` + `/dev/fuse`, not `privileged`. RPC binds `127.0.0.1` by default.
- Seed admin fallback requires explicit `ALLOW_SEED_FALLBACK=1` + `SEED_ADMIN_USER/PASSWORD`; no implicit `admin/admin`.
- `.gitignore` covers `.env`, `volumes/`, build artifacts (`decoder/decoder`, `frontend/dist`, `node_modules`, `.venv`, `egg-info`), and `*.bak`. Commit `.env.example` with placeholders only.
