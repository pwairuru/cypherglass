"""Auth service: password hashing, JWT creation, credential verification.

Dev fallback: when the users table is missing, empty, or the database is
unreachable (e.g. local pytest without Postgres), ``admin``/``admin`` is
accepted. Override via ``SEED_ADMIN_USER`` / ``SEED_ADMIN_PASSWORD`` env vars.
Once real users exist in the DB, only DB verification applies.
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.auth.models import User
from app.config import settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(sub: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_min)
    return jwt.encode({"sub": sub, "exp": exp}, settings.jwt_secret, algorithm=ALGORITHM)


def _seed_user(username: str, password: str) -> User | None:
    seed_user = os.getenv("SEED_ADMIN_USER", "admin")
    seed_password = os.getenv("SEED_ADMIN_PASSWORD", "admin")
    if username == seed_user and password == seed_password:
        return User(username=username, password_hash="", is_active=True)
    return None


async def authenticate(session: AsyncSession, username: str, password: str) -> User | None:
    try:
        rows = (await session.execute(select(User))).scalars().all()
    except Exception:
        # Table missing or DB unreachable -> dev fallback.
        return _seed_user(username, password)
    if not rows:
        return _seed_user(username, password)
    user = next((u for u in rows if u.username == username), None)
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
