#!/usr/bin/env python3
"""Backfill blocks_v2.difficulty from compact `bits` on historical rows.

The legacy + early-Rust decoder wrote difficulty 0.0 (fixed at the source in
decoder/src/enrich.rs::difficulty_from_bits). This script recomputes it for
existing rows WITHOUT corrupting MV state:

  1. snapshot invariants (block count, reward sums, MV row counts)
  2. DELETE the affected MV day/hour rows (mv_blocks_daily/hourly carry
     avg_difficulty states; AggregatingMergeTree cannot be patched in place)
  3. re-INSERT base rows with difficulty computed from bits
     (ReplacingMergeTree dedups to the corrected version; MVs re-fire once)
  4. verify invariants (counts, reward sums) + difficulty sane (> 0)

Usage:
  backend/.venv/bin/python scripts/backfill_difficulty.py          # dry run
  backend/.venv/bin/python scripts/backfill_difficulty.py --execute

Env: CLICKHOUSE_HOST/PORT/USER/PASSWORD (defaults localhost:8124/bitcoin/*).
"""

import argparse
import os
import sys
import time

DIFF_SQL = (
    "65535 * pow(2, 208) / nullIf(bitAnd(bits, 16777215) "
    "* pow(256, toInt32(bitShiftRight(bits, 24)) - 3), 0)"
)


def get_client():
    import clickhouse_connect

    return clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "localhost"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8124")),
        username=os.getenv("CLICKHOUSE_USER", "bitcoin"),
        password=os.getenv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse"),
    )


def q(client, sql):
    return client.query(sql).result_rows


def snapshot(client, label):
    base_distinct = q(client, "SELECT uniqExact((height, hash)) FROM bitcoin.blocks_v2")[0][0]
    base_n = q(client, "SELECT count() FROM bitcoin.blocks_v2")[0][0]
    base_reward = q(client, "SELECT sum(reward_sat) FROM bitcoin.blocks_v2 FINAL")[0][0]
    mv_d = q(client, "SELECT count() FROM bitcoin.mv_blocks_daily")[0][0]
    mv_h = q(client, "SELECT countMerge(block_count) FROM bitcoin.mv_blocks_hourly")[0][0]
    print(f"[{label}] base_distinct={base_distinct} base_rows={base_n} base_reward_sat={base_reward} mv_daily={mv_d} mv_hourly_count={mv_h}")
    return base_distinct, base_n, base_reward, mv_d, mv_h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    args = ap.parse_args()
    client = get_client()

    before = snapshot(client, "before")
    zero_d = q(client, "SELECT count() FROM bitcoin.blocks_v2 WHERE difficulty = 0")[0][0]
    print(f"rows with difficulty 0: {zero_d}")
    max_h = q(client, "SELECT max(height) FROM bitcoin.blocks_v2")[0][0]
    print(f"max height: {max_h}")

    # NOTE: clickhouse_connect's command() has been observed to raise on the
    # INSERT...SELECT below even though ClickHouse applies it. Treat the
    # INSERT as fire-and-verify: the invariant checks below fail loudly if
    # rows were not actually written.
    if not args.execute:
        print("dry run: re-run with --execute to apply")
        return 0

    day_min = q(client, "SELECT min(day) FROM bitcoin.mv_blocks_daily")[0][0]
    day_max = q(client, "SELECT max(day) FROM bitcoin.mv_blocks_daily")[0][0]
    print(f"wiping MV day/hour rows {day_min}..{day_max}")
    client.command(
        f"ALTER TABLE bitcoin.mv_blocks_daily DELETE WHERE day BETWEEN '{day_min}' AND '{day_max}' SETTINGS mutations_sync = 1"
    )
    client.command(
        f"ALTER TABLE bitcoin.mv_blocks_hourly DELETE WHERE hour BETWEEN '{day_min} 00:00:00' AND '{day_max} 23:00:00' SETTINGS mutations_sync = 1"
    )
    assert q(client, "SELECT count() FROM bitcoin.mv_blocks_daily")[0][0] == 0
    assert q(client, "SELECT count() FROM bitcoin.mv_blocks_hourly")[0][0] == 0
    print("MV rows wiped, verified 0")

    try:
        client.command(
            "INSERT INTO bitcoin.blocks_v2 "
            "SELECT height, hash, timestamp, size, weight, version, bits, nonce, "
            f"merkle_root, prev_hash, tx_count, {DIFF_SQL} AS difficulty, chainwork, "
            "reward_sat, fee_total_sat, interval_sec, now() AS updated_at "
            "FROM bitcoin.blocks_v2 FINAL"
        )
    except Exception as exc:  # noqa: BLE001 - verified by invariants below
        print(f"INSERT raised {type(exc).__name__}; verifying state anyway")
    print("base re-insert attempted; verifying")

    for _ in range(60):
        n = q(client, "SELECT count() FROM bitcoin.mv_blocks_daily")[0][0]
        if int(n) >= int(before[3]):
            break
        time.sleep(2)
    after = snapshot(client, "after")
    # Re-insert adds one corrected version per distinct key (ReplacingMergeTree
    # keeps all versions; FINAL reads resolve to the latest). Invariants: same
    # distinct keys, MVs refired exactly once per block, rewards unchanged.
    assert after[0] == before[0], (after[0], before[0])
    assert after[1] == after[0] + before[1], (after[1], before[1])
    assert after[2] == before[2], (after[2], before[2])
    assert after[3] == before[3], (after[3], before[3])
    assert after[4] == before[4], (after[4], before[4])
    zero_left = q(client, "SELECT count() FROM bitcoin.blocks_v2 FINAL WHERE difficulty = 0")[0][0]
    assert zero_left == 0, zero_left
    sample = q(
        client,
        "SELECT day, avgMerge(avg_difficulty) FROM bitcoin.mv_blocks_daily "
        "GROUP BY day ORDER BY day DESC LIMIT 3",
    )
    print("latest avg_difficulty:", sample)
    assert all(r[1] is not None and r[1] > 0 for r in sample)
    print("BACKFILL OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
