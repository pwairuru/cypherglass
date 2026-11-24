from app.workers import external as ext


def test_parse_fng():
    payload = {
        "data": [
            {"value": "25", "timestamp": "1704067200"},  # 2024-01-01
            {"value": "bad", "timestamp": "x"},
            {"value": "70", "timestamp": "1704153600"},  # 2024-01-02
        ]
    }
    assert ext.parse_fng(payload) == [("2024-01-01", 25), ("2024-01-02", 70)]


def test_parse_funding_keeps_last_per_day():
    rows = [
        {"fundingTime": 1704067200000, "fundingRate": "0.0001"},  # 2024-01-01 00:00
        {"fundingTime": 1704096000000, "fundingRate": "0.0003"},  # 2024-01-01 08:00
        {"fundingTime": 1704153600000, "fundingRate": "-0.0002"},  # 2024-01-02
        {"fundingRate": "oops"},
    ]
    assert ext.parse_funding(rows) == {"2024-01-01": 0.0003, "2024-01-02": -0.0002}


def test_parse_kraken_ohlc():
    payload = {"result": {"ETHXBT": [[1704067200, "0", "0", "0", "0.052", "0", 0]], "last": 1}}
    assert ext.parse_kraken_ohlc(payload) == [("2024-01-01", 0.052)]
    assert ext.parse_kraken_ohlc({"result": {}}) == []


def test_parse_etf_csv():
    text = "day,flow_btc,flow_usd\n2024-01-11,100.5,4600000\nbad,row\n"
    assert ext.parse_etf_csv(text) == [("2024-01-11", 100.5, 4600000.0)]


def test_cohorts_sql_shape():
    assert "bitcoin.addresses_v2" in ext.COHORTS_SQL
    for t in ("100000000", "1000000000", "10000000000", "100000000000"):
        assert t in ext.COHORTS_SQL
    for c in ("new_addresses", "gt_1_btc", "gt_10_btc", "gt_100_btc", "gt_1000_btc"):
        assert c in ext.COHORTS_SQL


class _Rows:
    def __init__(self, rows):
        self.result_rows = rows


class _Client:
    def __init__(self):
        self.inserts = []

    def query(self, sql, parameters=None):
        if "count()" in sql:
            return _Rows([(0,)])
        return _Rows([("2024-01-02", 7, 5, 3, 1, 0)])

    def insert(self, table, rows, column_names=None):
        self.inserts.append((table, rows))
        return None


def test_cohorts_skip_when_sweeper_empty(monkeypatch):
    client = _Client()
    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: client)
    out = ext.poll_address_cohorts.run("2024-01-02")
    assert out["ok"] is True and "skipped" in out
    assert client.inserts == []


def test_cohorts_populate(monkeypatch):
    client = _Client()
    count_calls = {"n": 0}

    def fake_query(sql, parameters=None):
        if "count()" in sql:
            count_calls["n"] += 1
            return _Rows([(12,)])
        assert parameters == {"day": "2024-01-02"}
        return _Rows([("2024-01-02", 7, 5, 3, 1, 0)])

    monkeypatch.setattr(client, "query", fake_query)
    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: client)
    out = ext.poll_address_cohorts.run("2024-01-02")
    assert out == {"ok": True, "inserted": 1, "day": "2024-01-02"}
    assert count_calls["n"] == 1
    assert client.inserts and client.inserts[0][0] == "marts.address_cohorts_daily"


def test_sweeper_sql_shape():
    assert "bitcoin.addresses_v2" in ext.SWEEPER_SQL
    assert "bitcoin.outputs_v2" in ext.SWEEPER_SQL
    assert "argMax(value_sat, updated_at)" in ext.SWEEPER_SQL  # merge-safe dedup
    for b in ("dust", "shrimp", "crab", "fish", "shark", "whale", "humpback"):
        assert b in ext.SWEEPER_SQL
    assert "bitcoin.inputs_v2" in ext.SPENT_BACKFILL_SQL
    assert "argMax(spent, updated_at)" in ext.SPENT_BACKFILL_SQL
    assert "argMax(balance_sat, updated_at)" in ext.COHORTS_SQL
    assert "UNFLAGGED_COUNT_SQL" in dir(ext)


def test_sweeper_skip_when_no_outputs(monkeypatch):
    class C:
        def query(self, sql, parameters=None):
            return _Rows([(0,)])

        def command(self, sql):
            raise AssertionError("no writes expected")

    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: C())
    out = ext.poll_address_sweeper.run()
    assert out == {"ok": True, "skipped": "outputs_v2 empty"}


def test_sweeper_repairs_then_snapshots(monkeypatch):
    calls = {"commands": []}

    class C:
        def query(self, sql, parameters=None):
            if "count() FROM bitcoin.outputs_v2" in sql and "spent = 0" not in sql:
                return _Rows([(3,)])
            if "spent = 0" in sql:
                return _Rows([(1,)])
            if "bitcoin.addresses_v2" in sql:
                return _Rows([(3,)])
            raise AssertionError(sql)

        def command(self, sql):
            calls["commands"].append(sql)

    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: C())
    out = ext.poll_address_sweeper.run()
    assert out == {"ok": True, "addresses": 3, "repaired": 1}
    assert len(calls["commands"]) == 2  # backfill + snapshot


def test_fred_parse_and_cpi_yoy(monkeypatch):
    payload = {"observations": [
        {"date": "2023-01-01", "value": "100.0"},
        {"date": "2023-02-01", "value": "."},
        {"date": "2024-01-01", "value": "103.0"},
    ]}

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(ext.httpx, "get", lambda *a, **k: R())
    assert ext.fetch_fred("CPIAUCSL", "k") == [("2023-01-01", 100.0), ("2024-01-01", 103.0)]
    monthly = [(f"2023-{m:02d}-01", 100.0 + m) for m in range(1, 13)] + [("2024-01-01", 115.0)]
    yoy = ext.cpi_yoy(monthly)
    assert yoy == [("2024-01-01", (115.0 / 101.0 - 1) * 100)]


def test_merge_macro_forward_fills():
    series = {
        "dxy": [("2024-01-01", 103.0), ("2024-01-02", 104.0)],
        "m2_global_t": [("2024-01-01", 21000.0)],
        "fed_funds": [("2024-01-01", 4.33)],
        "cpi_yoy": [("2024-01-01", 3.4)],
    }
    rows = ext.merge_macro(series)
    assert rows == [
        ("2024-01-01", 103.0, 21.0, 4.33, 3.4),
        ("2024-01-02", 104.0, 21.0, 4.33, 3.4),
    ]


def test_etf_loader_from_file(tmp_path):
    f = tmp_path / "flows.csv"
    f.write_text("day,flow_btc,flow_usd\n2024-01-11,100.5,4600000\nbad,row\n")
    assert ext.load_etf_csv(str(f)) == [("2024-01-11", 100.5, 4600000.0)]


def test_coingecko_parsers():
    payload = {"data": {"market_cap_percentage": {"btc": 58.5},
                        "total_market_cap": {"usd": 3_400_000_000_000.0}}}
    assert ext.parse_dominance(payload) == 58.5
    assert ext.parse_total_mcap_t(payload) == 3.4


def test_1ml_parse_defensive():
    assert ext.parse_1ml({"data": {"total_capacity": "5000000000", "node_count": "15000"}}) == {
        "capacity_btc": 50.0, "nodes": 15000}
    assert ext.parse_1ml({"weird": 1}) is None
    assert ext.parse_1ml(None) is None


def test_usd_cohorts_sql_shape():
    assert "marts.address_usd_daily" in ext.USD_COHORTS_SQL
    assert "argMax(value_sat, updated_at)" in ext.USD_COHORTS_SQL
    assert "avg_cost" in ext.USD_COHORTS_SQL and "pct_in_profit" in ext.USD_COHORTS_SQL
    assert "bal_btc > 0" in ext.USD_COHORTS_SQL  # dust/emptied addresses don't vote
    for t in ("1000", "10000", "100000", "1000000"):
        assert t in ext.USD_COHORTS_SQL


def test_usd_cohorts_skip_paths(monkeypatch):
    class Empty:
        def query(self, sql, parameters=None):
            return _Rows([(0,)])

        def command(self, sql, parameters=None):
            raise AssertionError("no writes expected")

    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: Empty())
    assert ext.poll_address_usd.run("2024-01-01") == {"ok": True, "skipped": "outputs_v2 empty"}

    class NoPrice:
        def query(self, sql, parameters=None):
            if "outputs_v2" in sql:
                return _Rows([(3,)])
            return _Rows([])

        def command(self, sql, parameters=None):
            raise AssertionError("no writes expected")

    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: NoPrice())
    out = ext.poll_address_usd.run("2024-01-01")
    assert out == {"ok": True, "skipped": "no BTCUSDT close for 2024-01-01"}


def test_usd_cohorts_populate(monkeypatch):
    calls = {}

    class C:
        def query(self, sql, parameters=None):
            if "outputs_v2" in sql:
                return _Rows([(3,)])
            return _Rows([(50000.0,)])

        def command(self, sql, parameters=None):
            calls["sql"] = sql
            calls["params"] = parameters

    monkeypatch.setattr(ext.ch, "get_ch_client", lambda: C())
    out = ext.poll_address_usd.run("2024-01-02")
    assert out == {"ok": True, "day": "2024-01-02"}
    assert "marts.address_usd_daily" in calls["sql"]
    assert calls["params"] == {"day": "2024-01-02"}


def test_keyed_sources_noop_without_keys(monkeypatch):
    for k in ("FRED_API_KEY", "ETF_FLOW_CSV", "ONE_ML_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    out = ext.poll_keyed_sources.run() if hasattr(ext.poll_keyed_sources, "run") else None
    assert out is None or out["ok"] is True
