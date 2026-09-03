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
