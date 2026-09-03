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
