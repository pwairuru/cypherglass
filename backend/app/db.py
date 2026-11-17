import os

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

# TestClient spins a fresh event loop per test while the engine (module-global)
# would otherwise pool asyncpg connections bound to a previous loop, causing
# intermittent "Future attached to a different loop" RuntimeErrors that
# surface as flaky 401s/errors. Opt-in NullPool (one connection per checkout
# on the current loop) via DB_POOLCLASS=nullpool, set by tests/conftest.py.
# Prod never sets it, so prod pooling is untouched.
_engine_kwargs: dict = {}
if os.getenv("DB_POOLCLASS") == "nullpool":
    _engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.database_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session():
    async with SessionLocal() as session:
        yield session
