from unittest.mock import patch


def test_series_accepts_full_iso_datetime(client, token):
    """Frontend sends Date.toISOString() (full datetime) even for daily
    metrics; service must normalize to Date, not 500 (CH code 457)."""
    with patch("app.ch.query_series", return_value=[]) as q:
        r = client.get(
            "/api/v1/metrics/blocks_daily/series"
            "?from=2009-01-01T00:00:00.000Z&to=2010-06-01T00:00:00.000Z",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        _, kwargs = q.call_args
        params = kwargs.get("params", kwargs.get("parameters", q.call_args[0][1]))
        assert params == {"from": "2009-01-01", "to": "2010-06-01"}


def test_series_hourly_keeps_datetime(client, token):
    with patch("app.ch.query_series", return_value=[]) as q:
        r = client.get(
            "/api/v1/metrics/blocks_hourly/series"
            "?from=2009-06-01T00:00:00.000Z&to=2009-06-08T00:00:00.000Z",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        _, kwargs = q.call_args
        params = kwargs.get("params", kwargs.get("parameters", q.call_args[0][1]))
        assert params == {"from": "2009-06-01 00:00:00", "to": "2009-06-08 00:00:00"}


def test_coverage_endpoint(client, token):
    from datetime import date

    class _Res:
        result_rows = [(date(2009, 1, 3), date(2010, 3, 5))]

    class _Client:
        def query(self, sql):
            assert "mv_blocks_daily" in sql
            return _Res()

    with patch("app.ch.get_ch_client", return_value=_Client()):
        r = client.get("/api/v1/metrics/coverage", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body == {"min_day": "2009-01-03", "max_day": "2010-03-05"}
