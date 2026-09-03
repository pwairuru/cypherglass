import os

import pytest

# Compose maps ClickHouse HTTP to host 8124; backend default is 8123.
os.environ.setdefault("CLICKHOUSE_PORT", "8124")

pytestmark = pytest.mark.skipif(os.getenv("CH_E2E") != "1", reason="needs live ClickHouse")


def _client():
    import clickhouse_connect

    return clickhouse_connect.get_client(
        host="localhost",
        port=8124,
        username="bitcoin",
        password=os.getenv("CLICKHOUSE_PASSWORD", "bitcoin_clickhouse"),
    )


def test_e2e_mvs_populated():
    c = _client()
    n = int(c.query("SELECT count() FROM bitcoin.mv_blocks_hourly").result_rows[0][0])
    assert n >= 1


def test_e2e_golden_subsidy_and_fees():
    c = _client()
    subsidy = float(
        c.query("SELECT sumMerge(reward_sum) / 1e8 FROM bitcoin.mv_blocks_hourly").result_rows[0][0]
    )
    fees = float(
        c.query("SELECT sumMerge(fee_sum) / 1e8 FROM bitcoin.mv_tx_fee_hourly").result_rows[0][0]
    )
    # Synthetic fixture: 3 blocks x 50 BTC subsidy, fees 0.001 + 0.002 + 0.0005 BTC.
    assert subsidy == pytest.approx(150.0)
    assert fees == pytest.approx(0.0035)


def test_e2e_api_series_and_30d_latency():
    import time
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from app import config
    from app.main import app

    # conftest imports app before this module sets CLICKHOUSE_PORT, so the
    # port default (8123) is frozen in settings — patch it live to the
    # compose-mapped host port 8124.
    with patch.object(config.settings, "clickhouse_port", 8124):
        client = TestClient(app)
        r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = client.get(
            "/api/v1/metrics/blocks_hourly/series?from=2024-01-01T00:00:00&to=2024-01-02T05:00:00",
            headers=headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["points"]) >= 3
        assert body["stale"] is False

        t0 = time.perf_counter()
        r = client.get(
            "/api/v1/metrics/blocks_hourly/series?from=2023-12-03T00:00:00&to=2024-01-01T05:00:00",
            headers=headers,
        )
        dt_ms = (time.perf_counter() - t0) * 1000
        assert r.status_code == 200
        assert dt_ms < 500, f"30d range took {dt_ms:.1f}ms"
