import logging

import httpx

from app import ch
from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)

BINANCE = "https://api.binance.us/api/v3/klines"
KRAKEN = "https://api.kraken.com/0/public/OHLC"


def fetch_binance_hour(symbol="BTCUSDT", start_ms=None, end_ms=None):
    params = {"symbol": symbol, "interval": "1h", "limit": 1000}
    if start_ms:
        params["startTime"] = start_ms
    if end_ms:
        params["endTime"] = end_ms
    r = httpx.get(BINANCE, params=params, timeout=20)
    r.raise_for_status()
    return [{"ts": row[0], "open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[5])} for row in r.json()]


def fetch_kraken_hour(symbol="BTCUSDT", start_ms=None, end_ms=None):
    r = httpx.get(KRAKEN, params={"pair": "XXBTZUSD", "interval": 60}, timeout=20)
    r.raise_for_status()
    payload = r.json()["result"]
    key = next(k for k in payload if k != "last")
    return [{"ts": int(row[0]), "open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[6])} for row in payload[key]]


def get_hourly(symbol="BTCUSDT"):
    try:
        return fetch_binance_hour(symbol)
    except Exception:
        return fetch_kraken_hour()


def upsert_rows(rows, source="binance", symbol="BTCUSDT"):
    """Parameterized rows for INSERT. Callers must use client.command(sql, params)
    or insert() — never f-string values into SQL."""
    return [
        (source, symbol, int(r["ts"]), float(r["open"]), float(r["high"]),
         float(r["low"]), float(r["close"]), float(r["volume"]))
        for r in rows
    ]


def upsert_sql(rows, source="binance", symbol="BTCUSDT"):
    # Kept for backwards-compat tests: escapes single quotes but prefer
    # upsert_rows() + parameterized command in production paths.
    def _esc(v: object) -> str:
        return str(v).replace("'", "''")

    vals = ", ".join(
        f"('{_esc(source)}','{_esc(symbol)}','{_esc(r['ts'])}',{float(r['open'])},{float(r['high'])},{float(r['low'])},{float(r['close'])},{float(r['volume'])})"
        for r in rows
    )
    return f"INSERT INTO bitcoin.price_ohlc_hourly (source, symbol, ts, open, high, low, close, volume) VALUES {vals}"


@celery_app.task(name="app.workers.price.poll_price_hourly", max_retries=3, autoretry_for=(Exception,), retry_backoff=60)
def poll_price_hourly(symbol="BTCUSDT"):
    allowed = {"BTCUSDT", "BTCUSD"}
    if symbol not in allowed:
        symbol = "BTCUSDT"
    try:
        rows = fetch_binance_hour(symbol)
        source = "binance"
    except Exception:
        rows = fetch_kraken_hour()
        source = "kraken"
    if not rows:
        log.info("price poll empty")
        return {"ok": True, "inserted": 0}
    client = ch.get_ch_client()
    try:
        client.insert(
            "bitcoin.price_ohlc_hourly",
            upsert_rows(rows, source=source, symbol=symbol),
            column_names=["source", "symbol", "ts", "open", "high", "low", "close", "volume"],
        )
    except Exception:
        # Fallback for drivers without insert(): parameterized command.
        client.command(
            "INSERT INTO bitcoin.price_ohlc_hourly (source, symbol, ts, open, high, low, close, volume) VALUES",
            upsert_rows(rows, source=source, symbol=symbol),
        )
    log.info("price poll inserted %d rows from %s", len(rows), source)
    return {"ok": True, "inserted": len(rows), "source": source}
