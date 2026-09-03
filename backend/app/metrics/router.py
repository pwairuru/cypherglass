from fastapi import APIRouter, Depends, Query

from app.auth.deps import get_current_user
from app.metrics import service

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


@router.get("")
def list_all(_user: str = Depends(get_current_user)):
    return service.list_metrics()


@router.get("/coverage")
def coverage(_user: str = Depends(get_current_user)):
    return service.get_coverage()


@router.get("/{metric_id}/series")
def series(
    metric_id: str,
    frm: str = Query(..., alias="from"),
    to: str = Query(...),
    _user: str = Depends(get_current_user),
):
    return service.get_series(metric_id, frm, to)
