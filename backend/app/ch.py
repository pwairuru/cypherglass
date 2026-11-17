import logging

from clickhouse_connect import get_client

from app.config import settings

log = logging.getLogger(__name__)

_client = None


def get_ch_client():
    global _client
    if _client is not None:
        return _client
    _client = get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        connect_timeout=5,
        send_receive_timeout=15,
    )
    return _client


def query_series(sql, params):
    try:
        client = get_ch_client()
        res = client.query(sql, parameters=params)
        return [{"t": r[0].isoformat(), "v": float(r[1]) if r[1] is not None else None} for r in res.result_rows]
    except Exception as exc:
        log.exception("clickhouse query failed")
        raise RuntimeError(f"clickhouse unavailable: {type(exc).__name__}") from exc
