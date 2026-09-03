def test_metrics_list_and_series(client, token):
    r = client.get("/api/v1/metrics", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()]
    assert "block_stats_daily" in ids
    r2 = client.get("/api/v1/metrics/block_stats_daily/series?from=2024-01-01&to=2024-01-08", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "points" in r2.json()


def test_metrics_series_shape_and_disabled(client, token):
    r = client.get(
        "/api/v1/metrics/block_stats_daily/series?from=2024-01-01&to=2024-01-08",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "points" in body and "unit" in body
    assert body["points"] == [
        {"t": "2024-01-01", "v": 1.0},
        {"t": "2024-01-02", "v": 2.0},
    ]
    assert body["unit"] == "blocks"

    r2 = client.get(
        "/api/v1/metrics/price_btc_usd/series?from=2024-01-01&to=2024-01-08",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 404

    r3 = client.get(
        "/api/v1/metrics/nope/series?from=2024-01-01&to=2024-01-08",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r3.status_code == 404


def test_metrics_requires_auth(client):
    assert client.get("/api/v1/metrics").status_code == 401
