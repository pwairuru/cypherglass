from fastapi import HTTPException, status

from app import ch
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
            }
        )
    return out


def get_series(metric_id: str, frm: str, to: str):
    m = _by_id(metric_id)
    if m is None or m.get("disabled"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown metric")
    points = ch.query_series(m["sql"], {"from": frm, "to": to})
    return {"points": points, "unit": m["unit"]}
