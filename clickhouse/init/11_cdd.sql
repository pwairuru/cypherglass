-- clickhouse/init/11_cdd.sql
-- WARNING: DROP VIEW below makes re-applying DESTRUCTIVE on populated
-- systems (fresh MV starts empty). See 05_mvs.sql header.
-- Coin-days-destroyed pre-aggregation (LookIntoBitcoin CDD / VDDM / whale shadows).
-- Reads ONLY base v2 (never MVs — no cascade), emits -State columns queried
-- with -Merge. Metrics must read bitcoin.mv_cdd_daily, never base tables.
-- CDD per spent output = value_btc * age_days(spent_time - timestamp).

-- NOTE: no DROP VIEW statements in this file (removed 2026-11-23).
-- MV re-definition is intentionally NOT automatic: DROP+CREATE on a
-- populated system wipes aggregates irreversibly (proven live). To change
-- an MV definition, drop it manually during maintenance, then apply.
CREATE MATERIALIZED VIEW IF NOT EXISTS bitcoin.mv_cdd_daily
(day Date CODEC(ZSTD(9)),
  cdd_sum AggregateFunction(sum, Float64) CODEC(ZSTD(9)),
  spent_sum AggregateFunction(sum, UInt64) CODEC(ZSTD(9)),
  spent_count AggregateFunction(count) CODEC(ZSTD(9)))
ENGINE = AggregatingMergeTree PARTITION BY toYYYYMM(day) ORDER BY day
SETTINGS storage_policy = 's3_main', index_granularity = 8192
AS SELECT toDate(spent_time) AS day,
  sumState(value_sat / 1e8 * dateDiff('second', timestamp, spent_time) / 86400.0) AS cdd_sum,
  sumState(value_sat) AS spent_sum,
  countState() AS spent_count
FROM bitcoin.outputs_v2 WHERE spent = 1 AND spent_time > timestamp GROUP BY day;
