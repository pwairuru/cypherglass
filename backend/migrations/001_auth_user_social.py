"""Migration 001: auth User columns + social_auth table.

Idempotent plain-SQL migration (no Alembic scaffold). Run once per
environment BEFORE deploying the auth branch:

    cd backend && DATABASE_URL=... .venv/bin/python migrations/001_auth_user_social.py

Uses ``IF NOT EXISTS`` throughout, so re-running is safe. Never runs on
app import or startup (tests must stay green without a live database);
prod deploy gate must invoke it explicitly.
"""

from __future__ import annotations

import asyncio
import os
import sys

STATEMENTS: tuple[str, ...] = (
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS npub TEXT""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ""",
    """ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ""",
    """CREATE TABLE IF NOT EXISTS social_auth (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        uid TEXT NOT NULL,
        extra_data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ,
        CONSTRAINT uq_provider_uid UNIQUE (provider, uid)
    )""",
    """ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'""",
    """ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'""",
    """ALTER TABLE social_auth ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'""",
    """CREATE INDEX IF NOT EXISTS ix_social_auth_user_id ON social_auth (user_id)""",
    """CREATE INDEX IF NOT EXISTS ix_social_auth_provider ON social_auth (provider)""",
    """CREATE UNIQUE INDEX IF NOT EXISTS ix_users_npub ON users (npub)""",
    """CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)""",
)


async def upgrade(database_url: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as conn:
            for stmt in STATEMENTS:
                await conn.execute(text(stmt))
    finally:
        await engine.dispose()


def main() -> int:
    url = os.getenv("DATABASE_URL")
    if not url:
        try:
            from app.config import settings  # lazy: no import-time side effects

            url = settings.database_url
        except Exception as exc:
            print(f"no DATABASE_URL and settings unavailable: {exc}", file=sys.stderr)
            return 2
    asyncio.run(upgrade(url))
    print(f"001_auth_user_social applied ({len(STATEMENTS)} statements)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
