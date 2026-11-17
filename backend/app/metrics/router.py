import anyio.to_thread
from fastapi import APIRouter, Depends, Query

from app.auth.deps import get_current_user
from app.metrics import service

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


@router.get("")
async def list_all(_user: str = Depends(get_current_user)):
    return await anyio.to_thread.run_sync(service.list_metrics)


@router.get("/coverage")
async def coverage(_user: str = Depends(get_current_user)):
    return await anyio.to_thread.run_sync(service.get_coverage)


@router.get("/{metric_id}/series")
async def series(
    metric_id: str,
    frm: str = Query(..., alias="from"),
    to: str = Query(...),
    _user: str = Depends(get_current_user),
):
    return await anyio.to_thread.run_sync(service.get_series, metric_id, frm, to)


@router.get("/price_ohlc_{grain}/ohlc")
async def ohlc(
    grain: str,
    frm: str = Query(..., alias="from"),
    to: str = Query(...),
    _user: str = Depends(get_current_user),
):
    return await anyio.to_thread.run_sync(service.get_ohlc, grain, frm, to)
