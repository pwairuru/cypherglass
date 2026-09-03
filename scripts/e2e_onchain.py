#!/usr/bin/env python3
"""Onchain E2E verification harness (Task 8).

Usage:
    CH_E2E=1 CLICKHOUSE_PORT=8124 backend/.venv/bin/python scripts/e2e_onchain.py --apply-ddl --seed --check

Steps:
    --apply-ddl  apply clickhouse/init/03_schema_v2.sql, 04_projections.sql,
                 05_mvs.sql, 06_marts.sql via clickhouse-connect (reports per file).
    --seed       insert synthetic chain: 3 blocks (heights 0-2, 50 BTC subsidy),
                 1 non-coinbase tx per block with known fees (0.001 / 0.002 /
                 0.0005 BTC) and 1 BTC transfer each. Blocks 0-1 on day 1,
                 block 2 on day 2 (needed for the NVT genesis-baseline check).
    --check      assert MV row counts, golden subsidy/fees, NVT cumulative
                 supply vs genesis baseline, backend TestClient API 200 +
                 stale flag, 30d range latency <500ms, S3 bytes.

With no flags, all steps run. Exits non-zero on first failure.
Only depends on stdlib + clickhouse-connect + backend app (TestClient).
"""

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INIT_DIR = ROOT / "clickhouse" / "init"
DDL_FILES = ["03_schema_v2.sql", "04_projections.sql", "05_mvs.sql", "06_marts.sql"]

CH_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CH_PORT = int(os.getenv("CLICKHOUSE_PORT", "8124"))
CH_USER = os.getenv("CLICKHOUSE_USER", "bitcoin")
CH_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse")

SAT = 100_000_000
SUBSIDY_SAT = 50 * SAT
# (height, timestamp, fee_sat) — blocks 0,1 on day 1; block 2 on day 2.
# Timestamps are plain strings: naive datetimes get localized to the HOST tz
# by clickhouse-connect (measured 3h skew on an EAT host), strings parse as
# server-tz (UTC) exactly.
FIXTURE_BLOCKS = [
    (0, "2024-01-01 00:00:00", 100_000),   # 0.001 BTC fee
    (1, "2024-01-01 01:00:00", 200_000),   # 0.002 BTC fee
    (2, "2024-01-02 00:00:00", 50_000),    # 0.0005 BTC fee
]
# Stale keys from a run that seeded naive datetimes on a UTC+3 host.
SKEWED_HOURS = ["2023-12-31 21:00:00", "2023-12-31 22:00:00", "2024-01-01 21:00:00"]
SKEWED_DAYS = ["2023-12-31", "2024-01-01"]
EXPECT_SUBSIDY_BTC = 150.0
EXPECT_FEES_BTC = 0.0035


def get_client():
    import clickhouse_connect

    return clickhouse_connect.get_client(
        host=CH_HOST, port=CH_PORT, username=CH_USER, password=CH_PASSWORD
    )


def step_apply_ddl(client):
    print("== apply-ddl ==")
    for name in DDL_FILES:
        sql = (INIT_DIR / name).read_text()
        lines = [ln for ln in sql.splitlines() if not ln.strip().startswith("--")]
        stmts = [s.strip() for s in "\n".join(lines).split(";") if s.strip()]
        ok, fail = 0, 0
        t0 = time.perf_counter()
        for s in stmts:
            try:
                client.command(s)
                ok += 1
            except Exception as e:  # noqa: BLE001 — report per statement, fail at end
                fail += 1
                print(f"  [{name}] STATEMENT FAILED: {str(e)[:200]}\n  SQL: {s[:160]}")
        dt = (time.perf_counter() - t0) * 1000
        print(f"  [{name}] {ok} ok, {fail} failed ({len(stmts)} stmts, {dt:.0f}ms)")
        if fail:
            raise SystemExit(f"DDL failed for {name}: {fail} statement(s)")
    print("apply-ddl: PASS")


def step_seed(client):
    print("== seed ==")
    # Idempotent reruns: wipe fixture keys first (base rows + hourly states +
    # any prior daily backfill). ReplacingMergeTree keeps both versions until
    # a merge, so plain re-INSERT would double counts.
    hours = ["2024-01-01 00:00:00", "2024-01-01 01:00:00", "2024-01-02 00:00:00"] + SKEWED_HOURS
    days = ["2024-01-01", "2024-01-02"] + SKEWED_DAYS
    hour_list = ", ".join(f"'{h}'" for h in hours)
    day_list = ", ".join(f"'{d}'" for d in days)
    for stmt in [
        "ALTER TABLE bitcoin.blocks_v2 DELETE WHERE hash LIKE 'e2e%'",
        "ALTER TABLE bitcoin.transactions_v2 DELETE WHERE txid LIKE 'txe2e%'",
        f"ALTER TABLE bitcoin.mv_blocks_hourly DELETE WHERE hour IN ({hour_list})",
        f"ALTER TABLE bitcoin.mv_tx_fee_hourly DELETE WHERE hour IN ({hour_list})",
        f"ALTER TABLE bitcoin.mv_flow_hourly DELETE WHERE hour IN ({hour_list})",
        f"ALTER TABLE bitcoin.mv_blocks_daily DELETE WHERE day IN ({day_list})",
        f"ALTER TABLE bitcoin.mv_tx_fee_daily DELETE WHERE day IN ({day_list})",
        f"ALTER TABLE bitcoin.mv_flow_daily DELETE WHERE day IN ({day_list})",
    ]:
        try:
            client.command(stmt + " SETTINGS mutations_sync = 1")
        except Exception as e:  # noqa: BLE001 — first run has nothing to delete
            print(f"  [seed-cleanup] ignored: {str(e)[:120]}")
    for t in ["bitcoin.mv_blocks_hourly", "bitcoin.mv_tx_fee_hourly",
              "bitcoin.mv_flow_hourly", "bitcoin.mv_blocks_daily",
              "bitcoin.mv_tx_fee_daily", "bitcoin.mv_flow_daily"]:
        try:
            client.command(f"OPTIMIZE TABLE {t} FINAL")
        except Exception as e:  # noqa: BLE001 — best effort, counts use -Merge anyway
            print(f"  [optimize] ignored: {str(e)[:120]}")

    from datetime import timezone

    def ts(s):
        # tz-aware: clickhouse-connect writes int(x.timestamp()); naive would
        # use the HOST tz (measured 3h skew on a UTC+3 host).
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    blocks = [
        (
            h, f"e2e{h:064d}", ts(tstr),
            1000, 4000, 1, 0x1D00FFFF, 12345, "00" * 32,
            ("00" * 32) if h == 0 else f"e2e{h - 1:064d}",
            2, 1.0, "", SUBSIDY_SAT, fee, 600 if h == 0 else 3600, now,
        )
        for h, tstr, fee in FIXTURE_BLOCKS
    ]
    client.insert("bitcoin.blocks_v2", blocks, column_names=[
        "height", "hash", "timestamp", "size", "weight", "version", "bits",
        "nonce", "merkle_root", "prev_hash", "tx_count", "difficulty",
        "chainwork", "reward_sat", "fee_total_sat", "interval_sec", "updated_at",
    ])
    txs = [
        (
            f"txe2e{h}", h, f"e2e{h:064d}", ts(tstr),
            2, 0, 250, 1000, 1, 2, 0, SAT, SAT + fee, fee,
            round(fee / 250, 4), 0, now,
        )
        for h, tstr, fee in FIXTURE_BLOCKS
    ]
    client.insert("bitcoin.transactions_v2", txs, column_names=[
        "txid", "block_height", "block_hash", "timestamp", "version",
        "locktime", "size", "weight", "vin_count", "vout_count",
        "is_coinbase", "total_out_sat", "input_total_sat", "fee_sat",
        "fee_rate_sat_vbyte", "is_change_heavy", "updated_at",
    ])
    print(f"seed: PASS (3 blocks_v2 rows, 3 transactions_v2 rows)")

    # ClickHouse does NOT cascade MV triggers: inserts into blocks_v2 fire
    # mv_blocks_hourly, but rows landing in mv_blocks_hourly do NOT fire
    # mv_blocks_daily (measured: daily count stays 0). Production therefore
    # needs a scheduled backfill job (or daily MVs repointed at base tables).
    # The E2E performs that backfill explicitly so daily reads are verified
    # against measured data.
    for stmt in [
        "INSERT INTO bitcoin.mv_blocks_daily SELECT toDate(hour) AS day,"
        " countMerge(block_count) AS blocks, avgMerge(avg_size) AS avg_size,"
        " avgMerge(avg_weight) AS avg_weight, avgMerge(avg_tx_count) AS avg_tx_count,"
        " avgMerge(avg_interval) AS avg_interval, avgMerge(avg_difficulty) AS avg_difficulty,"
        " sumMerge(reward_sum) AS reward_sum, sumMerge(fee_sum) AS fee_sum"
        " FROM bitcoin.mv_blocks_hourly GROUP BY day",
        "INSERT INTO bitcoin.mv_tx_fee_daily SELECT toDate(hour) AS day,"
        " countMerge(tx_count) AS tx_count, sumMerge(fee_sum) AS fee_sum,"
        " quantileMerge(fee_median) AS fee_median, quantileMerge(feerate_median) AS feerate_median,"
        " sumMerge(transfer_sum) AS transfer_sum FROM bitcoin.mv_tx_fee_hourly GROUP BY day",
        "INSERT INTO bitcoin.mv_flow_daily SELECT toDate(hour) AS day,"
        " sumMerge(transfer_sum) AS transfer_sum, countMerge(tx_count) AS tx_count"
        " FROM bitcoin.mv_flow_hourly GROUP BY day",
    ]:
        client.command(stmt)
    print("seed: daily backfill PASS")
    time.sleep(1)  # let S3-backed parts settle before checks


def _one(client, sql, params=None):
    return client.query(sql, parameters=params or {}).result_rows[0][0]


def step_check(client):
    print("== check ==")
    failures = []

    def check(name, cond, detail=""):
        print(f"  [{'PASS' if cond else 'FAIL'}] {name} {detail}")
        if not cond:
            failures.append(name)

    n_hours = _one(client, "SELECT count() FROM bitcoin.mv_blocks_hourly")
    check("mv_blocks_hourly rows", n_hours == 3, f"(got {n_hours})")
    n_blocks = _one(client, "SELECT countMerge(block_count) FROM bitcoin.mv_blocks_hourly")
    check("mv_blocks_hourly countMerge == 3", int(n_blocks) == 3, f"(got {n_blocks})")
    n_tx = _one(client, "SELECT countMerge(tx_count) FROM bitcoin.mv_tx_fee_hourly")
    check("mv_tx_fee_hourly countMerge == 3", int(n_tx) == 3, f"(got {n_tx})")

    subsidy = float(_one(client, "SELECT sumMerge(reward_sum) / 1e8 FROM bitcoin.mv_blocks_hourly"))
    check("golden subsidy 150 BTC", abs(subsidy - EXPECT_SUBSIDY_BTC) < 1e-9, f"(got {subsidy})")
    fees = float(_one(client, "SELECT sumMerge(fee_sum) / 1e8 FROM bitcoin.mv_tx_fee_hourly"))
    check("golden fees 0.0035 BTC", abs(fees - EXPECT_FEES_BTC) < 1e-9, f"(got {fees})")

    day1 = _one(
        client, "SELECT blocks FROM bitcoin.mv_blocks_daily WHERE day = '2024-01-01'")
    day2 = _one(
        client, "SELECT blocks FROM bitcoin.mv_blocks_daily WHERE day = '2024-01-02'")
    check("daily rollup 2 blocks day1 / 1 block day2", day1 == 2 and day2 == 1,
          f"(got {day1}/{day2})")

    # NVT cumulative-supply semantics: registry query over a date-filtered
    # range must match the full-history (genesis) baseline, not just the
    # rewards inside the range (day2 range reward = 50, genesis supply = 150).
    sys.path.insert(0, str(ROOT / "backend"))
    from app.metrics.registry import METRICS

    nvt_sql = next(m["sql"] for m in METRICS if m["id"] == "nvt_daily")
    reg = client.query(nvt_sql, parameters={"from": "2024-01-02", "to": "2024-01-02"}).result_rows
    base = client.query(
        "SELECT sum(reward_sum) / 1e8 FROM bitcoin.mv_blocks_daily"
    ).result_rows[0][0]
    flow = client.query(
        "SELECT transfer_sum / 1e8 FROM bitcoin.mv_flow_daily WHERE day = '2024-01-02'"
    ).result_rows[0][0]
    expect_nvt = float(base) / float(flow)
    got_nvt = float(reg[0][1]) if reg else None
    check("nvt_daily supply from genesis baseline",
          got_nvt is not None and abs(got_nvt - expect_nvt) < 1e-9,
          f"(registry={got_nvt}, baseline={expect_nvt})")

    # Backend API via TestClient.
    os.environ.setdefault("CLICKHOUSE_PORT", str(CH_PORT))
    from fastapi.testclient import TestClient

    from app.main import app

    api = TestClient(app)
    r = api.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    check("api login 200", r.status_code == 200)
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = api.get(
        "/api/v1/metrics/blocks_hourly/series?from=2024-01-01T00:00:00&to=2024-01-02T05:00:00",
        headers=headers,
    )
    body = r.json() if r.status_code == 200 else {}
    check("api blocks_hourly 200 + points + stale False",
          r.status_code == 200 and len(body.get("points", [])) >= 3
          and body.get("stale") is False,
          f"(status={r.status_code}, body={str(body)[:160]})")

    t0 = time.perf_counter()
    r = api.get(
        "/api/v1/metrics/blocks_hourly/series?from=2023-12-03T00:00:00&to=2024-01-01T05:00:00",
        headers=headers,
    )
    dt_ms = (time.perf_counter() - t0) * 1000
    check("api 30d range <500ms", r.status_code == 200 and dt_ms < 500,
          f"(status={r.status_code}, {dt_ms:.1f}ms)")

    s3_bytes = _one(
        client, "SELECT sum(bytes_on_disk) FROM system.parts WHERE database = 'bitcoin'")
    print(f"  [info] S3 bytes_on_disk bitcoin db: {s3_bytes}")

    if failures:
        raise SystemExit(f"check FAILED: {failures}")
    print("check: ALL PASS")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--apply-ddl", action="store_true")
    p.add_argument("--seed", action="store_true")
    p.add_argument("--check", action="store_true")
    a = p.parse_args()
    run_all = not (a.apply_ddl or a.seed or a.check)
    client = get_client()
    client.query("SELECT 1")
    print(f"connected: {CH_USER}@{CH_HOST}:{CH_PORT}")
    if a.apply_ddl or run_all:
        step_apply_ddl(client)
    if a.seed or run_all:
        step_seed(client)
    if a.check or run_all:
        step_check(client)
    print("E2E: ALL PASS")


if __name__ == "__main__":
    sys.exit(main())
