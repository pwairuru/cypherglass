"""External ingest for LookIntoBitcoin / IntoTheCryptoverse coverage.

Populates clickhouse/init/12_external_marts.sql tables. Sources without keys
run on beat; keyed sources (FRED, ETF provider, 1ML) no-op with a note until
their env keys are set, so deploys never serve fake data — metrics over empty
tables return stale=true.

  FRED_API_KEY      FRED macro series (DXY, M2, FEDFUNDS, CPIAUCSL)
  ETF_FLOW_CSV      path/URL to a day,flow_btc,flow_usd CSV (e.g. Farside export)
  ONE_ML_TOKEN      1ML.com API token for lightning capacity/nodes
"""

import csv
import io
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app import ch
from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)

FNG_URL = "https://api.alternative.me/fng/"
BINANCE_FAPI = "https://fapi.binance.com"
KRAKEN_URL = "https://api.kraken.com/0/public/OHLC"
COINGECKO_GLOBAL = "https://api.coingecko.com/api/v3/global"
FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
ONE_ML_STATS = "https://api.1ml.com/network/stats"

# FRED series -> marts.macro_daily column (values converted on load).
FRED_MAP = {
    "DTWEXBGS": "dxy",        # trade-weighted broad dollar index (proxy for DXY)
    "M2SL": "m2_global_t",    # M2 in $B -> converted to $T on load
    "DFF": "fed_funds",        # federal funds effective rate
    "CPIAUCSL": "cpi_yoy",     # CPI level -> converted to YoY % on load
}


def _now_utc():
    return datetime.now(timezone.utc)


# --- pure fetch/parse helpers (unit-tested, no DB) ---------------------------


def parse_fng(payload: dict) -> list:
    """Alternative.me /fng payload -> [(day_iso, value)]."""
    out = []
    for row in (payload.get("data") or []):
        try:
            ts = int(row["timestamp"])
            day = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            out.append((day, int(row["value"])))
        except (KeyError, TypeError, ValueError):
            continue
    return sorted(out)


def fetch_fear_greed(limit: int = 90) -> list:
    r = httpx.get(FNG_URL, params={"limit": limit, "format": "json"}, timeout=20)
    r.raise_for_status()
    return parse_fng(r.json())


def parse_funding(rows: list) -> dict:
    """Binance fundingRate rows -> {day_iso: last_rate_that_day}."""
    by_day: dict = {}
    for row in rows:
        try:
            ts = int(row["fundingTime"]) // 1000
            day = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            by_day[day] = float(row["fundingRate"])
        except (KeyError, TypeError, ValueError):
            continue
    return by_day


def fetch_funding(symbol: str = "BTCUSDT", limit: int = 100) -> dict:
    r = httpx.get(
        f"{BINANCE_FAPI}/fapi/v1/fundingRate",
        params={"symbol": symbol, "limit": limit},
        timeout=20,
    )
    r.raise_for_status()
    return parse_funding(r.json())


def fetch_open_interest(symbol: str = "BTCUSDT") -> float:
    r = httpx.get(
        f"{BINANCE_FAPI}/fapi/v1/openInterest", params={"symbol": symbol}, timeout=20
    )
    r.raise_for_status()
    return float(r.json()["openInterest"])


def parse_kraken_ohlc(payload: dict) -> list:
    """Kraken OHLC result -> [(day_iso, close)] for the single pair key."""
    rows = None
    for key, val in (payload.get("result") or {}).items():
        if key != "last":
            rows = val
            break
    out = []
    for row in rows or []:
        try:
            day = datetime.fromtimestamp(int(row[0]), tz=timezone.utc).date().isoformat()
            out.append((day, float(row[4])))
        except (TypeError, ValueError, IndexError):
            continue
    return sorted(out)


def fetch_ethbtc() -> list:
    r = httpx.get(KRAKEN_URL, params={"pair": "ETHXBT", "interval": 1440}, timeout=20)
    r.raise_for_status()
    return parse_kraken_ohlc(r.json())


def fetch_dominance() -> float:
    r = httpx.get(COINGECKO_GLOBAL, timeout=20)
    r.raise_for_status()
    return float(r.json()["data"]["market_cap_percentage"]["btc"])


def fetch_coingecko_global() -> dict:
    r = httpx.get(COINGECKO_GLOBAL, timeout=20)
    r.raise_for_status()
    return r.json()


def parse_dominance(payload: dict) -> float:
    return float(payload["data"]["market_cap_percentage"]["btc"])


def parse_total_mcap_t(payload: dict) -> float:
    return float(payload["data"]["total_market_cap"]["usd"]) / 1e12


def parse_etf_csv(text: str) -> list:
    """day,flow_btc,flow_usd CSV -> [(day_iso, flow_btc, flow_usd)]."""
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            out.append((row["day"].strip(), float(row["flow_btc"]), float(row["flow_usd"])))
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return sorted(out)


def fetch_fred(series_id: str, api_key: str, start: str = "2015-01-01") -> list:
    """FRED observations -> [(day_iso, value)]; '.' values skipped."""
    r = httpx.get(
        FRED_URL,
        params={"series_id": series_id, "api_key": api_key, "file_type": "json",
                "observation_start": start},
        timeout=30,
    )
    r.raise_for_status()
    out = []
    for row in r.json().get("observations", []):
        try:
            out.append((row["date"], float(row["value"])))
        except (KeyError, TypeError, ValueError):
            continue
    return sorted(out)


def cpi_yoy(monthly: list) -> list:
    """Monthly (day, cpi) -> [(day, yoy_pct)] using the 12th prior observation."""
    out = []
    for i in range(12, len(monthly)):
        prev = monthly[i - 12][1]
        if prev:
            out.append((monthly[i][0], (monthly[i][1] / prev - 1) * 100))
    return out


def merge_macro(series: dict) -> list:
    """{'dxy': [(day, v)], ...} -> rows with forward-fill, leading gaps dropped.
    M2 $B converted to $T here."""
    days: dict = {}
    for col, rows in series.items():
        for d, v in rows:
            days.setdefault(d, {})[col] = v
    out, last = [], {}
    for d in sorted(days):
        last = {**last, **days[d]}
        if all(c in last for c in ("dxy", "m2_global_t", "fed_funds", "cpi_yoy")):
            out.append((d, last["dxy"], last["m2_global_t"] / 1000.0,
                        last["fed_funds"], last["cpi_yoy"]))
    return out


def load_etf_csv(source: str) -> list:
    """ETF_FLOW_CSV may be a local path or http(s) URL."""
    if source.startswith("http://") or source.startswith("https://"):
        r = httpx.get(source, timeout=30)
        r.raise_for_status()
        text = r.text
    else:
        text = Path(source).read_text(encoding="utf-8")
    return parse_etf_csv(text)


def parse_1ml(payload: dict) -> dict | None:
    """Defensively extract {capacity_btc, nodes} from 1ML stats payload."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data", payload)
    if not isinstance(data, dict):
        return None
    cap = data.get("total_capacity") or data.get("capacity")
    nodes = data.get("node_count") or data.get("nodes")
    try:
        return {"capacity_btc": float(cap) / 1e8, "nodes": int(nodes)}
    except (TypeError, ValueError):
        return None


def _day(d: str):
    return datetime.fromisoformat(d).date()


def insert_marts(table: str, rows: list, columns: list) -> int:
    """Parameterized insert into a marts table. Returns row count."""
    if not rows:
        return 0
    client = ch.get_ch_client()
    try:
        client.insert(table, rows, column_names=columns)
    except Exception:
        client.command(
            f"INSERT INTO {table} ({', '.join(columns)}) VALUES",
            rows,
        )
    return len(rows)


# --- celery tasks -------------------------------------------------------------


@celery_app.task(name="app.workers.external.poll_fear_greed", max_retries=3,
                 autoretry_for=(Exception,), retry_backoff=300)
def poll_fear_greed(limit: int = 90):
    rows = fetch_fear_greed(limit)
    now = _now_utc().replace(tzinfo=None)
    n = insert_marts(
        "marts.fear_greed_daily",
        [(_day(d), v, now) for d, v in rows],
        ["day", "value", "updated_at"],
    )
    log.info("fear/greed poll inserted %d rows", n)
    return {"ok": True, "inserted": n}


@celery_app.task(name="app.workers.external.poll_funding", max_retries=3,
                 autoretry_for=(Exception,), retry_backoff=300)
def poll_funding(symbol: str = "BTCUSDT"):
    by_day = fetch_funding(symbol)
    try:
        oi = fetch_open_interest(symbol)
    except Exception:
        oi = None
    now = _now_utc().replace(tzinfo=None)
    today = _now_utc().date().isoformat()
    rows = [
        (_day(d), rate, (oi if d == today else 0.0), now) for d, rate in sorted(by_day.items())
    ]
    n = insert_marts(
        "marts.funding_daily", rows, ["day", "funding_rate", "open_interest_usd", "updated_at"]
    )
    log.info("funding poll inserted %d rows", n)
    return {"ok": True, "inserted": n}


@celery_app.task(name="app.workers.external.poll_cross_asset", max_retries=3,
                 autoretry_for=(Exception,), retry_backoff=300)
def poll_cross_asset():
    ethbtc = dict(fetch_ethbtc())
    try:
        g = fetch_coingecko_global()
        dom = parse_dominance(g)
        total_t = parse_total_mcap_t(g)
    except Exception:
        dom, total_t = None, None
    now = _now_utc().replace(tzinfo=None)
    today = _now_utc().date().isoformat()
    rows = []
    for d in sorted(ethbtc):
        rows.append((_day(d), ethbtc[d], (dom if d == today and dom is not None else 0.0),
                     (total_t if d == today and total_t is not None else 0.0), now))
    n = insert_marts(
        "marts.alt_prices_daily", rows, ["day", "ethbtc", "btc_dominance", "total_mcap_t", "updated_at"]
    )
    log.info("cross-asset poll inserted %d rows", n)
    return {"ok": True, "inserted": n}


# Version-aware: argMax dedup per address so re-runs count each address
# once even before background merges collapse ReplacingMergeTree versions.
COHORTS_SQL = """
SELECT {day:Date} AS day,
    countIf(toDate(first_seen_time) = {day:Date}) AS new_addresses,
    countIf(balance_sat > 100000000) AS gt_1_btc,
    countIf(balance_sat > 1000000000) AS gt_10_btc,
    countIf(balance_sat > 10000000000) AS gt_100_btc,
    countIf(balance_sat > 100000000000) AS gt_1000_btc
FROM (
    SELECT
        address,
        argMax(first_seen_time, updated_at) AS first_seen_time,
        argMax(balance_sat, updated_at) AS balance_sat
    FROM bitcoin.addresses_v2
    GROUP BY address
)
"""

# Repair spent flags from inputs before snapshotting (decoder UTXO-miss gaps).
# outputs_v2 is ReplacingMergeTree: re-inserting corrected rows with a fresh
# updated_at replaces the unflagged versions (same ORDER BY key). The join
# targets the latest version per key (argMax dedup) so a repair never
# re-fires after merges or before them.
SPENT_BACKFILL_SQL = """
INSERT INTO bitcoin.outputs_v2
SELECT
    o.txid, o.output_index, o.value_sat, o.script_pubkey_hex, o.script_type, o.address,
    toUInt8(1) AS spent, i.txid AS spending_txid,
    i.block_height AS spent_height, i.timestamp AS spent_time,
    o.block_height, o.timestamp, now() AS updated_at
FROM bitcoin.inputs_v2 AS i
JOIN (
    SELECT
        txid, output_index, timestamp, block_height,
        argMax(value_sat, updated_at) AS value_sat,
        argMax(script_pubkey_hex, updated_at) AS script_pubkey_hex,
        argMax(script_type, updated_at) AS script_type,
        argMax(address, updated_at) AS address,
        argMax(spent, updated_at) AS spent
    FROM bitcoin.outputs_v2
    GROUP BY txid, output_index, timestamp, block_height
) AS o
  ON o.txid = i.prev_txid AND o.output_index = i.prev_output_index
WHERE i.prev_txid != '' AND o.spent = 0
"""

UNFLAGGED_COUNT_SQL = """
SELECT count() FROM bitcoin.inputs_v2 AS i
JOIN (
    SELECT txid, output_index, argMax(spent, updated_at) AS spent
    FROM bitcoin.outputs_v2
    GROUP BY txid, output_index, timestamp, block_height
) AS o
  ON o.txid = i.prev_txid AND o.output_index = i.prev_output_index
WHERE i.prev_txid != '' AND o.spent = 0
"""

# Full-snapshot address index rebuild. Bounds mirror the decoder's
# bucket_for() (dust/shrimp/crab/fish/shark/whale/humpback). Rerunnable:
# ReplacingMergeTree keeps the latest updated_at per address.
#
# Merge-safe: the inner query dedups rows by full ORDER BY key with argMax,
# so a spent-flag repair re-insert (same key, newer updated_at) is counted
# once even before background merges run.
SWEEPER_SQL = """
INSERT INTO bitcoin.addresses_v2
SELECT
    address,
    multiIf(balance < 1000, 'dust', balance < 1000000, 'shrimp', balance < 10000000, 'crab',
            balance < 100000000, 'fish', balance < 1000000000, 'shark',
            balance < 1000000000000, 'whale', 'humpback') AS bucket,
    first_seen_block, first_seen_time, last_seen_block, last_seen_time,
    total_received_sat, total_sent_sat, balance,
    tx_count, now() AS updated_at
FROM (
    SELECT
        address,
        min(block_height) AS first_seen_block,
        min(timestamp) AS first_seen_time,
        greatest(max(block_height), max(spent_height)) AS last_seen_block,
        greatest(max(timestamp), max(spent_time)) AS last_seen_time,
        toUInt64(sum(value_sat)) AS total_received_sat,
        toUInt64(sumIf(value_sat, spent = 1)) AS total_sent_sat,
        toInt64(sum(value_sat) - sumIf(value_sat, spent = 1)) AS balance,
        toUInt32(count() + sum(spent)) AS tx_count
    FROM (
        SELECT
            txid, output_index, timestamp, block_height,
            argMax(value_sat, updated_at) AS value_sat,
            argMax(address, updated_at) AS address,
            argMax(spent, updated_at) AS spent,
            argMax(spent_height, updated_at) AS spent_height,
            argMax(spent_time, updated_at) AS spent_time
        FROM bitcoin.outputs_v2
        GROUP BY txid, output_index, timestamp, block_height
    )
    WHERE address != ''
    GROUP BY address
)
"""


USD_COHORTS_SQL = """
INSERT INTO marts.address_usd_daily
SELECT
  {day:Date} AS day,
  countIf(bal_usd > 1000) AS gt_1k_usd,
  countIf(bal_usd > 10000) AS gt_10k_usd,
  countIf(bal_usd > 100000) AS gt_100k_usd,
  countIf(bal_usd > 1000000) AS gt_1m_usd,
  countIf(avg_cost > 0 AND avg_cost < price_d AND bal_btc > 0) / nullIf(countIf(bal_btc > 0), 0) AS pct_in_profit,
  now() AS updated_at
FROM (
  SELECT
    r.address AS address,
    (r.btc_in - ifNull(s.btc_out, 0)) AS bal_btc,
    (r.btc_in - ifNull(s.btc_out, 0)) * r.price_d AS bal_usd,
    r.usd_in / nullIf(r.btc_in, 0) AS avg_cost,
    r.price_d AS price_d
  FROM (
    SELECT
      v.address AS address,
      sum(v.value_sat) / 1e8 AS btc_in,
      sum(v.value_sat / 1e8 * p.close) AS usd_in,
      (SELECT close FROM bitcoin.price_ohlc_daily WHERE day = {day:Date} AND symbol = 'BTCUSDT' LIMIT 1) AS price_d
    FROM (
      SELECT
        txid, output_index,
        argMax(value_sat, updated_at) AS value_sat,
        argMax(address, updated_at) AS address,
        argMax(toDate(timestamp), updated_at) AS rday
      FROM bitcoin.outputs_v2
      GROUP BY txid, output_index, timestamp, block_height
    ) AS v
    JOIN bitcoin.price_ohlc_daily AS p ON p.day = v.rday AND p.symbol = 'BTCUSDT'
    WHERE v.address != '' AND v.rday <= {day:Date}
    GROUP BY v.address
  ) AS r
  LEFT JOIN (
    SELECT address, sum(value_sat) / 1e8 AS btc_out
    FROM (
      SELECT
        txid, output_index,
        argMax(value_sat, updated_at) AS value_sat,
        argMax(address, updated_at) AS address,
        argMax(toDate(spent_time), updated_at) AS sday,
        argMax(spent, updated_at) AS spent
      FROM bitcoin.outputs_v2
      GROUP BY txid, output_index, timestamp, block_height
    )
    WHERE address != '' AND spent = 1 AND sday <= {day:Date}
    GROUP BY address
  ) AS s ON s.address = r.address
)
"""


@celery_app.task(name="app.workers.external.poll_address_usd")
def poll_address_usd(day: str | None = None):
    """USD cohorts + share of addresses in profit -> marts.address_usd_daily.

    Needs outputs_v2 (sweeper input) and a BTCUSDT close for the day.
    Receives on days without a close are skipped (documented in 13_address_usd.sql).
    """
    client = ch.get_ch_client()
    total = client.query("SELECT count() FROM bitcoin.outputs_v2").result_rows[0][0]
    if not total:
        return {"ok": True, "skipped": "outputs_v2 empty"}
    d = day or _now_utc().date().isoformat()
    px = client.query(
        "SELECT close FROM bitcoin.price_ohlc_daily WHERE day = {day:Date} AND symbol = 'BTCUSDT' LIMIT 1",
        parameters={"day": d},
    ).result_rows
    if not px or px[0][0] is None:
        return {"ok": True, "skipped": f"no BTCUSDT close for {d}"}
    client.command(USD_COHORTS_SQL, parameters={"day": d})
    return {"ok": True, "day": d}


@celery_app.task(name="app.workers.external.poll_address_sweeper")
def poll_address_sweeper():
    """Backfill bitcoin.addresses_v2 from outputs_v2 (+ spent repair from inputs_v2).

    Full snapshot per run (ReplacingMergeTree dedups by address, latest
    updated_at wins). Correct at dev scale; full-chain production wants an
    incremental follow-up keyed on max(updated_at) instead of a rescan.
    """
    client = ch.get_ch_client()
    total = client.query("SELECT count() FROM bitcoin.outputs_v2").result_rows[0][0]
    if not total:
        log.info("sweeper skipped: outputs_v2 empty")
        return {"ok": True, "skipped": "outputs_v2 empty"}
    unflagged = client.query(UNFLAGGED_COUNT_SQL).result_rows[0][0]
    repaired = 0
    if unflagged:
        client.command(SPENT_BACKFILL_SQL)
        repaired = int(unflagged)
    client.command(SWEEPER_SQL)
    addrs = client.query("SELECT uniqExact(address) FROM bitcoin.addresses_v2").result_rows[0][0]
    log.info("sweeper done: %d addresses indexed (%d spent flags repaired)", addrs, repaired)
    return {"ok": True, "addresses": int(addrs), "repaired": repaired}


@celery_app.task(name="app.workers.external.poll_address_cohorts")
def poll_address_cohorts(day: str | None = None):
    """Snapshot address cohorts into marts.address_cohorts_daily.

    Reads the decoder sweeper's bitcoin.addresses_v2 index (first-seen +
    balances with p_seen/p_balance projections). No-ops honestly while the
    sweeper has not populated it; cohort metrics then report stale.
    """
    client = ch.get_ch_client()
    total = client.query("SELECT count() FROM bitcoin.addresses_v2").result_rows[0][0]
    if not total:
        log.info("cohorts skipped: addresses_v2 empty (sweeper has not run)")
        return {"ok": True, "skipped": "addresses_v2 empty (sweeper has not run)"}
    d = day or (_now_utc().date().isoformat())
    now = _now_utc().replace(tzinfo=None)
    rows = client.query(COHORTS_SQL, parameters={"day": d}).result_rows
    out = [(_day(str(r[0])), int(r[1]), int(r[2]), int(r[3]), int(r[4]), int(r[5]), now) for r in rows]
    n = insert_marts(
        "marts.address_cohorts_daily",
        out,
        ["day", "new_addresses", "gt_1_btc", "gt_10_btc", "gt_100_btc", "gt_1000_btc", "updated_at"],
    )
    log.info("cohorts poll inserted %d rows for %s", n, d)
    return {"ok": True, "inserted": n, "day": d}


@celery_app.task(name="app.workers.external.poll_macro")
def poll_macro():
    """FRED macro series -> marts.macro_daily. No-op without FRED_API_KEY."""
    api_key = os.getenv("FRED_API_KEY", "")
    if not api_key:
        return {"ok": True, "skipped": "FRED_API_KEY unset"}
    raw = {col: fetch_fred(sid, api_key) for sid, col in FRED_MAP.items()}
    raw["cpi_yoy"] = cpi_yoy(raw["cpi_yoy"])
    rows = merge_macro(raw)
    now = _now_utc().replace(tzinfo=None)
    n = insert_marts(
        "marts.macro_daily",
        [(_day(d), dxy, m2, fed, cpi, now) for d, dxy, m2, fed, cpi in rows],
        ["day", "dxy", "m2_global_t", "fed_funds", "cpi_yoy", "updated_at"],
    )
    log.info("macro poll inserted %d rows", n)
    return {"ok": True, "inserted": n}


@celery_app.task(name="app.workers.external.poll_etf_flows")
def poll_etf_flows():
    """ETF_FLOW_CSV (local path or URL) -> marts.etf_flows_daily."""
    source = os.getenv("ETF_FLOW_CSV", "")
    if not source:
        return {"ok": True, "skipped": "ETF_FLOW_CSV unset"}
    rows = load_etf_csv(source)
    now = _now_utc().replace(tzinfo=None)
    n = insert_marts(
        "marts.etf_flows_daily",
        [(_day(d), b, u, now) for d, b, u in rows],
        ["day", "flow_btc", "flow_usd", "updated_at"],
    )
    log.info("etf poll inserted %d rows", n)
    return {"ok": True, "inserted": n}


@celery_app.task(name="app.workers.external.poll_lightning")
def poll_lightning():
    """1ML network stats -> marts.lightning_daily. No-op without ONE_ML_TOKEN."""
    token = os.getenv("ONE_ML_TOKEN", "")
    if not token:
        return {"ok": True, "skipped": "ONE_ML_TOKEN unset"}
    try:
        r = httpx.get(ONE_ML_STATS, params={"token": token}, timeout=30)
        r.raise_for_status()
        parsed = parse_1ml(r.json())
        if parsed is None:
            return {"ok": True, "skipped": "1ML response shape unrecognized"}
    except Exception as exc:
        return {"ok": True, "skipped": f"1ML unreachable: {type(exc).__name__}"}
    now = _now_utc().replace(tzinfo=None)
    n = insert_marts(
        "marts.lightning_daily",
        [(_now_utc().date(), parsed["capacity_btc"], parsed["nodes"], now)],
        ["day", "capacity_btc", "nodes", "updated_at"],
    )
    return {"ok": True, "inserted": n}


@celery_app.task(name="app.workers.external.poll_keyed_sources")
def poll_keyed_sources():
    """FRED macro, ETF CSV, 1ML lightning. No-op with a note when unconfigured."""
    notes = []
    if not os.getenv("FRED_API_KEY"):
        notes.append("FRED_API_KEY unset: macro_daily not populated")
    if not os.getenv("ETF_FLOW_CSV"):
        notes.append("ETF_FLOW_CSV unset: etf_flows_daily not populated")
    if not os.getenv("ONE_ML_TOKEN"):
        notes.append("ONE_ML_TOKEN unset: lightning_daily not populated")
    if notes:
        log.info("keyed sources skipped: %s", "; ".join(notes))
    return {"ok": True, "skipped": notes}
