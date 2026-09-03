"""Auth service: password hashing, JWT creation, credential verification.

Dev fallback: when the users table is missing, empty, or the database is
unreachable (e.g. local pytest without Postgres), ``admin``/``admin`` is
accepted ONLY when seeding is allowed (non-prod ENV or
``ALLOW_SEED_FALLBACK=1``; never in prod by default). Override via
``SEED_ADMIN_USER`` / ``SEED_ADMIN_PASSWORD`` env vars.
Once real users exist in the DB, only DB verification applies (fail-closed).
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.auth.models import User
from app.config import settings

ALGORITHM = "HS256"

try:
    from asyncpg import exceptions as _pg_exc

    _PG_ERRORS: tuple[type[BaseException], ...] = (
        _pg_exc.PostgresError,
        _pg_exc.InterfaceError,
    )
except ImportError:  # pragma: no cover - asyncpg always installed in backend
    _PG_ERRORS = ()

# Table-missing / connection-setup failures -> gated seed fallback allowed.
_SETUP_ERRORS: tuple[type[BaseException], ...] = (
    (SQLAlchemyError, OSError, ConnectionError, TimeoutError) + _PG_ERRORS
)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(sub: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_min)
    return jwt.encode({"sub": sub, "exp": exp}, settings.jwt_secret, algorithm=ALGORITHM)


def _seed_allowed() -> bool:
    if os.getenv("ALLOW_SEED_FALLBACK", "") == "1":
        return True
    env = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    return env not in ("prod", "production")


def _seed_user(username: str, password: str) -> User | None:
    if not _seed_allowed():
        return None
    seed_user = os.getenv("SEED_ADMIN_USER", "admin")
    seed_password = os.getenv("SEED_ADMIN_PASSWORD", "admin")
    if username == seed_user and password == seed_password:
        return User(username=username, password_hash="", is_active=True)
    return None


async def authenticate(session: AsyncSession, username: str, password: str) -> User | None:
    try:
        user = (
            await session.execute(select(User).where(User.username == username))
        ).scalars().first()
    except _SETUP_ERRORS:
        # Table missing or DB unreachable during setup -> gated dev fallback.
        return _seed_user(username, password)
    except Exception:
        # Unexpected query error -> fail-closed (no seed fallback).
        return None
    if user is not None:
        if not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
    # Username not found: seed fallback only when table is empty/unreachable;
    # fail-closed once any real user exists.
    try:
        any_id = (await session.execute(select(User.id).limit(1))).scalars().first()
    except _SETUP_ERRORS:
        return _seed_user(username, password)
    except Exception:
        return None
    if any_id is None:
        return _seed_user(username, password)
    return None
