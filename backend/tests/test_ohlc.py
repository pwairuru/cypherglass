class FakeCH:
    def __init__(self, rows):
        self._rows = rows

    def query(self, sql, params=None, parameters=None, **kwargs):
        class R:
            def __init__(self, rows):
                self.result_rows = rows

        return R(self._rows)


def test_ohlc_daily_shape(client, token, monkeypatch):
    import app.metrics.service as svc
    monkeypatch.setattr(svc.ch, "get_ch_client", lambda: FakeCH([
        ("2024-01-01", 100.0, 110.0, 90.0, 105.0, 12.5),
    ]))
    r = client.get(
        "/api/v1/metrics/price_ohlc_daily/ohlc?from=2024-01-01&to=2024-01-02",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["bars"][0]["close"] == 105.0
