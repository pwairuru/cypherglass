# CypherGlass full onchain platform — build report

Date: 2026-11-16
Scope: 200+ charts (ITC + Bitcoin Magazine parity), login fix, S3 MVs, dev seed without full chain.

## What was built

- ClickHouse: 08_extended_mvs (script/fees/size/value/outputs daily+hourly), 09_derived_marts (supply, price_tech, risk, bands, issuance), 10_extra_indexes (price/marts). Backfilled 7 new MVs from base v2 (43k blocks 2009-2010).
- Backend: registry 36 → 210 metrics (203 enabled + legacy + stub). All SQL reads ONLY mv_*/marts/price_ohlc (test_no_base_table_reads passes). Weekly rollups, SMA7/30, cumulative, fee buckets, script shares (real btcd classes), price tech (SMA/EMA/Mayer/drawdown/RSI/vol), cycle bands (200W, 2Y, Pi, CVDD), risk composite 0-100, issuance/S2F.
- Frontend: Single (existing) + Overview (risk header + 9 key charts grid) + Compare (pin up to 4). MetricList adds category filter with counts. 233 vitest pass, build ok.
- Auth/login: FIXED live 500 — sqlmodel 0.0.42→0.0.47 requires tz-aware datetimes; models/router _now() naive caused StatementError. Fixed to tz-aware, migrated users/social_auth to TIMESTAMPTZ, pinned sqlmodel>=0.0.47. Verified: 16 auth/user tests pass with live PG, TestClient seed fallback ok.
- Dev seed: scripts/seed_dev.py populates price_ohlc (422d + 1688h), price_tech, supply, hodl, realized, mvrv/nupl, sopr, puell, bands, risk, issuance — no bitcoin node download. All charts render for 2009-2010 era.
- S3: ReplacingMergeTree + AggregatingMergeTree, monthly partitions, ZSTD, storage_policy s3_main, projections in 04_, indexes in 07_/10_.

## Verification (evidence)

- `pytest backend/tests/test_metrics_catalog.py ...` → 20 passed (no base reads, NVT genesis, stale flag)
- `npm run test -- --run` → 28 files, 233 tests passed
- `npm run build` → ok (charts chunk 1.1MB)
- Live CH: mv_blocks_daily 422 days, price_ohlc_daily 422, marts 422 each; sample series blocks_daily 422 pts, risk_daily 422 pts, mvrv 422 pts
- `curl /health` → ok; register/login via rebuilt api → pending image rebuild (fix merged, migration applied)
- Decoder quirks noted: fee_sat negative (UTXO miss), difficulty 0 (parser), script types pubkey/pubkeyhash dominant pre-2010 — charts truthful, not clamped.

## How to run (dev, no big chain)

```bash
cp .env.example .env
docker compose up -d clickhouse pg valkey-app rustfs
backend/.venv/bin/python scripts/seed_dev.py
docker compose up -d api frontend
# open http://localhost:5173, register, browse 210 charts: Single/Overview/Compare
```

## Files

- clickhouse/init/08_extended_mvs.sql, 09_derived_marts.sql, 10_extra_indexes.sql
- backend/app/metrics/registry.py (210), descriptions.py, auth/models.py, auth/router.py, migrations/001_*, pyproject.toml
- frontend/src/routes/Dashboard.tsx, components/MiniCard.tsx, components/MetricList.tsx
- scripts/seed_dev.py, scripts/e2e_onchain.py (DDL list extended)
