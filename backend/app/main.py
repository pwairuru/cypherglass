from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


try:
    from app.metrics.router import router as metrics_router

    app.include_router(metrics_router)
except ImportError as exc:
    import logging

    logging.getLogger(__name__).warning("metrics router not loaded: %s", exc)
