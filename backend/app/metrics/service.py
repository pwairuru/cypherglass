from datetime import date, datetime, timezone

from fastapi import HTTPException, status

from app import ch
from app.metrics.descriptions import DESCRIPTIONS
from app.metrics.registry import METRICS


def _by_id(metric_id: str):
    for m in METRICS:
        if m["id"] == metric_id:
            return m
    return None


def _interval(metric_id: str) -> str:
    if metric_id.endswith("_daily"):
        return "daily"
    if metric_id.endswith("_hourly"):
        return "hourly"
    return "none"


def list_metrics():
    out = []
    for m in METRICS:
        out.append(
            {
                "id": m["id"],
                "title": m["title"],
                "category": m["category"],
                "unit": m["unit"],
                "interval": _interval(m["id"]),
                "disabled": bool(m.get("disabled", False)),
                "description": DESCRIPTIONS.get(m["id"], m["title"]),
            }
        )
    return out


def _norm(raw: str, kind: str) -> str:
    """Normalize frontend ISO strings to CH param type.

    Frontend sends Date.toISOString() (full datetime) for every grain;
    {from:Date} params reject that with code 457, so trim to date.
    DateTime params get 'YYYY-MM-DD HH:MM:SS'.
    """
    s = (raw or "").strip()
    try:
        if "T" in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.date().isoformat() if kind == "Date" else dt.strftime("%Y-%m-%d %H:%M:%S")
        if kind == "Date":
            return datetime.strptime(s, "%Y-%m-%d").date().isoformat()
        try:
            return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            return datetime.strptime(s, "%Y-%m-%d").strftime("%Y-%m-%d 00:00:00")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Bad date: {raw!r}")


def get_series(metric_id: str, frm: str, to: str):
    m = _by_id(metric_id)
    if m is None or m.get("disabled"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown metric")
    kind = "DateTime" if "{from:DateTime}" in m["sql"] else "Date"
    params = {"from": _norm(frm, kind), "to": _norm(to, kind)}
    points = ch.query_series(m["sql"], params)
    stale = (len(points) == 0) or any(p.get("v") is None for p in points)
    return {"points": points, "unit": m["unit"], "stale": stale}


def get_coverage():
    """Data era bounds from MVs (decoder still syncing; UI defaults here)."""
    res = ch.get_ch_client().query(
        "SELECT min(day), max(day) FROM bitcoin.mv_blocks_daily"
    )
    rows = res.result_rows
    if not rows or rows[0][0] is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No coverage yet")
    return {"min_day": rows[0][0].isoformat(), "max_day": rows[0][1].isoformat()}


def _to_ms(ts) -> int:
    """Convert CH Date/DateTime/str/int ts to epoch ms."""
    if isinstance(ts, str):
        s = ts.strip()
        try:
            if "T" in s:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            else:
                try:
                    dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    dt = datetime.strptime(s, "%Y-%m-%d")
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            try:
                return int(s)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Bad date: {ts!r}")
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return int(ts.timestamp() * 1000)
    if isinstance(ts, date):
        dt = datetime(ts.year, ts.month, ts.day, tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    if hasattr(ts, "timestamp"):
        return int(ts.timestamp() * 1000)
    return int(ts)


def get_ohlc(grain: str, frm: str, to: str):
    if grain == "hourly":
        sql = "SELECT ts, open, high, low, close, volume FROM bitcoin.price_ohlc_hourly WHERE symbol = 'BTCUSDT' AND ts BETWEEN {from:DateTime} AND {to:DateTime} ORDER BY ts"
        params = {"from": _norm(frm, "DateTime"), "to": _norm(to, "DateTime")}
    elif grain == "daily":
        sql = "SELECT day, open, high, low, close, volume FROM bitcoin.price_ohlc_daily WHERE symbol = 'BTCUSDT' AND day BETWEEN {from:Date} AND {to:Date} ORDER BY day"
        params = {"from": _norm(frm, "Date"), "to": _norm(to, "Date")}
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown grain")
    rows = ch.get_ch_client().query(sql, params).result_rows
    bars = []
    for ts, o, h, l, c, v in rows:
        bars.append({"time": _to_ms(ts), "open": o, "high": h, "low": l, "close": c, "volume": v})
    return {"bars": bars}
