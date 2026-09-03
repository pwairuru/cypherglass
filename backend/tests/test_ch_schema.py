from pathlib import Path

SQL = (Path(__file__).resolve().parents[2] / "clickhouse/init/03_schema_v2.sql").read_text()

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

def test_projections():
    sql = (Path(__file__).resolve().parents[2] / "clickhouse/init/04_projections.sql").read_text()
    for name in ["p_height", "p_addr_time", "p_prev", "p_seen", "p_txid", "p_value"]:
        assert name in sql
    assert "MATERIALIZE PROJECTION" in sql


def test_mvs_hierarchy():
    sql = (Path(__file__).resolve().parents[2] / "clickhouse/init/05_mvs.sql").read_text()
    marts = (Path(__file__).resolve().parents[2] / "clickhouse/init/06_marts.sql").read_text()
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
