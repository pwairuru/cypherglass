"""Wipe auth tables for Playwright E2E. Run with the backend venv python:

    ../backend/.venv/bin/python e2e/wipe-db.py

DATABASE_URL env or the local docker pg default (host port 5433).
"""

from __future__ import annotations

import asyncio
import os

URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://cypher:cypher@localhost:5433/cypher"
)


async def main() -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM social_auth"))
            await conn.execute(text("DELETE FROM users"))
    finally:
        await engine.dispose()
    print("e2e tables wiped")


if __name__ == "__main__":
    asyncio.run(main())
