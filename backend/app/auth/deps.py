import os
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.auth.models import User
from app.auth.service import _SETUP_ERRORS, ALGORITHM, _pwd_ver, _seed_allowed
from app.config import settings
from app.db import get_session

security = HTTPBearer(auto_error=False)

# IDs of transient seed-fallback users (no DB row). GET /me is allowed;
# all writes are blocked by routers via is_transient_user().
_TRANSIENT_SEED_IDS: set[str] = set()


def is_transient_user(user: User) -> bool:
    """True when user has no DB row (seed fallback): id None or tracked."""
    if user.id is None:
        return True
    try:
        return str(user.id) in _TRANSIENT_SEED_IDS
    except Exception:
        return False


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    # Metrics router path: same strict validation as _decode_bearer.
    payload = _decode_bearer(credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return sub


def _decode_bearer(
    credentials: HTTPAuthorizationCredentials | None,
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    # Reject non-Bearer schemes explicitly (no alg confusion: HS256 only).
    try:
        scheme = (credentials.scheme or "").lower()
    except Exception:
        scheme = ""
    if scheme and scheme != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
            issuer="cypherglass",
            leeway=0,
            options={"require": ["exp", "iss", "sub"]},
        )
    except (ExpiredSignatureError, InvalidTokenError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None
    if not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return payload


async def get_current_userinfo(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Load the User row for the bearer token. Accepts old tokens without
    the ``uid`` claim (falls back to ``sub`` username lookup)."""
    payload = _decode_bearer(credentials)
    sub = payload["sub"]
    uid = payload.get("uid")
    user: User | None = None
    try:
        if uid is not None:
            try:
                key = uuid.UUID(str(uid))
            except ValueError:
                key = None
            if key is not None:
                user = (
                    await session.execute(select(User).where(User.id == key))
                ).scalars().first()
        if user is None:
            user = (
                await session.execute(select(User).where(User.username == sub))
            ).scalars().first()
    except _SETUP_ERRORS:
        user = None
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        # Password-change revocation: token bound to password hash version.
        # Old tokens without ver keep working (back-compat); new tokens enforce.
        try:
            tok_ver = payload.get("ver")
            if tok_ver is not None and tok_ver != _pwd_ver(user.password_hash or ""):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None
        return user
    # Dev seed fallback: token proves a prior successful seed login, so a
    # matching seed subject is trusted without a DB row. The user stays
    # transient (tracked): read-only, routers must block writes.
    # Explicit opt-in only (ALLOW_SEED_FALLBACK=1 + SEED_ADMIN_USER set).
    if _seed_allowed() and sub == os.getenv("SEED_ADMIN_USER", "") and sub:
        user = User(username=sub, is_active=True)
        _TRANSIENT_SEED_IDS.add(str(user.id))
        return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_admin(user: User = Depends(get_current_userinfo)) -> User:
    if is_transient_user(user) or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user
