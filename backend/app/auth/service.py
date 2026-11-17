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


def _pwd_ver(password_hash: str) -> str:
    """Token version bound to password: password change revokes old JWTs."""
    import hashlib

    return hashlib.sha256((password_hash or "").encode()).hexdigest()[:16]


def create_token(sub: str, uid: str | None = None, pwd_ver: str | None = None) -> str:
    import uuid as _uuid

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_expire_min)
    payload = {"sub": sub, "exp": exp, "iat": now, "iss": "cypherglass", "jti": str(_uuid.uuid4())}
    if uid is not None:
        payload["uid"] = uid
    if pwd_ver is not None:
        payload["ver"] = pwd_ver
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    # Strict: HS256 only (no alg confusion), iss + exp required, no leeway.
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        issuer="cypherglass",
        leeway=0,
        options={"require": ["exp", "iss", "sub"]},
    )


def _seed_allowed() -> bool:
    # Explicit opt-in only: ALLOW_SEED_FALLBACK=1. No implicit dev bypass.
    # Prevents prod misconfig (ENV unset) from opening admin/admin.
    return os.getenv("ALLOW_SEED_FALLBACK", "") == "1"


def _seed_user(username: str, password: str) -> User | None:
    if not _seed_allowed():
        return None
    seed_user = os.getenv("SEED_ADMIN_USER", "")
    seed_password = os.getenv("SEED_ADMIN_PASSWORD", "")
    if not seed_user or not seed_password:
        return None
    if username == seed_user and password == seed_password:
        return User(username=username, password_hash="", is_active=True)
    return None


async def authenticate(session: AsyncSession, identifier: str, password: str) -> User | None:
    """Verify credentials. ``identifier`` is a username, or an email address
    (matched case-insensitively) when it contains '@'."""
    try:
        user = (
            await session.execute(select(User).where(User.username == identifier))
        ).scalars().first()
        if user is None and "@" in identifier:
            email = identifier.lower()
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalars().first()
    except _SETUP_ERRORS:
        # Table missing or DB unreachable during setup -> gated dev fallback.
        return _seed_user(identifier, password)
    except Exception:
        # Unexpected query error -> fail-closed (no seed fallback). Logged so
        # intermittent login 401s leave evidence instead of silent None.
        import logging as _logging

        _logging.getLogger(__name__).exception("authenticate query failed (fail-closed)")
        return None
    if user is not None:
        if not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
    # Identifier not found: seed fallback only when table is empty/unreachable;
    # fail-closed once any real user exists.
    try:
        any_id = (await session.execute(select(User.id).limit(1))).scalars().first()
    except _SETUP_ERRORS:
        return _seed_user(identifier, password)
    except Exception:
        import logging as _logging

        _logging.getLogger(__name__).exception("authenticate existence-check failed (fail-closed)")
        return None
    if any_id is None:
        return _seed_user(identifier, password)
    return None
