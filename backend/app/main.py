from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import settings

app = FastAPI(title="CypherGlass Analytics API", docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def _security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS only when behind TLS (prod); harmless locally behind http.
    resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return resp


@app.middleware("http")
async def _audit_log(request, call_next):
    import logging as _logging
    import time as _time

    _audit = _logging.getLogger("cypherglass.audit")
    start = _time.monotonic()
    try:
        resp = await call_next(request)
        status = resp.status_code
    except Exception:
        status = 500
        raise
    finally:
        dur_ms = int((_time.monotonic() - start) * 1000)
    try:
        path = request.url.path or "/"
        # Audit auth + admin + failed requests only (no query/body secrets).
        if path.startswith("/api/v1/auth") or "/admin" in path or status >= 400:
            client = request.client.host if request.client else "-"
            _audit.info("%s %s -> %s (%dms) client=%s", request.method, path, status, dur_ms, client)
    except Exception:
        pass
    return resp


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    checks: dict[str, str] = {}
    try:
        from app.db import engine

        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"error: {type(exc).__name__}"
    try:
        from app import ch

        ch.get_ch_client().query("SELECT 1")
        checks["clickhouse"] = "ok"
    except Exception as exc:
        checks["clickhouse"] = f"error: {type(exc).__name__}"
    ok = all(v == "ok" for v in checks.values())
    return {"status": "ready" if ok else "degraded", "checks": checks}


from app.metrics.router import router as metrics_router

app.include_router(metrics_router)
