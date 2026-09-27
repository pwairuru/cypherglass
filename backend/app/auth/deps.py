import os
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.auth.models import User
from app.auth.service import _SETUP_ERRORS, ALGORITHM, _seed_allowed
from app.config import settings
from app.db import get_session

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
        sub = payload.get("sub")
    except (ExpiredSignatureError, InvalidTokenError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from None
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return sub


def _decode_bearer(
    credentials: HTTPAuthorizationCredentials | None,
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
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
        return user
    # Dev seed fallback: token proves a prior successful seed login, so a
    # matching seed subject is trusted without a DB row.
    if _seed_allowed() and sub == os.getenv("SEED_ADMIN_USER", "admin"):
        return User(username=sub, is_active=True)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_admin(user: User = Depends(get_current_userinfo)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user
