from datetime import datetime

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
