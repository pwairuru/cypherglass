from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.deps import get_current_user
from app.auth.router import router as auth_router

app = FastAPI(title="CypherGlass Analytics API")
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# TASK3-REPLACE: minimal guarded placeholder so auth guard is testable
# before the real metrics router lands. Task 3 MUST delete this route when
# adding app/metrics/router.py (duplicate paths: first registered wins).
@app.get("/api/v1/metrics")
def metrics_placeholder(_user: str = Depends(get_current_user)):
    return []


try:
    from app.metrics.router import router as metrics_router

    app.include_router(metrics_router)
except ImportError:
    pass
