from clickhouse_connect import get_client

from app.config import settings


def get_ch_client():
    return get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
    )


def query_series(sql, params):
    client = get_ch_client()
    res = client.query(sql, parameters=params)
    return [{"t": r[0].isoformat(), "v": float(r[1])} for r in res.result_rows]
