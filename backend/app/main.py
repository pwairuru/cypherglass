from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CypherGlass Analytics API")

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
    from app.auth.router import router as auth_router

    app.include_router(auth_router)
except ImportError:
    pass

try:
    from app.metrics.router import router as metrics_router

    app.include_router(metrics_router)
except ImportError:
    pass
