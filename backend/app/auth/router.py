import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import or_, select

from app.auth.deps import get_current_userinfo, require_admin
from app.auth.models import SocialAuth, User
from app.auth.schemas import (
    AdminUserUpdate,
    ChangePasswordIn,
    LoginIn,
    MeOut,
    MeUpdate,
    RegisterIn,
    TokenOut,
    UserOut,
)
from app.auth.service import authenticate, create_token, hash_password, verify_password
from app.db import get_session

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _now() -> datetime:
    # Naive UTC: Task 1 models use TIMESTAMP WITHOUT TIME ZONE and asyncpg
    # rejects tz-aware datetimes on insert.
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _providers_for(session: AsyncSession, user: User) -> list[str]:
    try:
        rows = (
            await session.execute(select(SocialAuth.provider).where(SocialAuth.user_id == user.id))
        ).scalars().all()
        return list(rows)
    except Exception:
        return []


def _me_out(user: User, providers: list[str]) -> MeOut:
    return MeOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        npub=user.npub,
        avatar_url=user.avatar_url,
        is_admin=user.is_admin,
        providers=providers,
    )


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        npub=user.npub,
        is_active=user.is_active,
        is_admin=user.is_admin,
    )


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, session: AsyncSession = Depends(get_session)):
    user = await authenticate(session, data.username, data.password)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenOut(access_token=create_token(user.username, str(user.id)))


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(data: RegisterIn, session: AsyncSession = Depends(get_session)):
    existing = (
        await session.execute(select(User).where(User.username == data.username))
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username taken")
    email = data.email.lower() if data.email else None
    if email:
        dup = (await session.execute(select(User).where(User.email == email))).scalars().first()
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email taken")
    user = User(
        username=data.username,
        email=email,
        password_hash=hash_password(data.password),
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username taken") from None
    await session.refresh(user)
    return TokenOut(access_token=create_token(user.username, str(user.id)))


@router.get("/me", response_model=MeOut)
async def me(
    user: User = Depends(get_current_userinfo),
    session: AsyncSession = Depends(get_session),
):
    return _me_out(user, await _providers_for(session, user))


@router.patch("/me", response_model=MeOut)
async def update_me(
    data: MeUpdate,
    user: User = Depends(get_current_userinfo),
    session: AsyncSession = Depends(get_session),
):
    if data.email is not None:
        email = data.email.lower()
        dup = (await session.execute(select(User).where(User.email == email))).scalars().first()
        if dup is not None and dup.id != user.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email taken")
        user.email = email
    if data.display_name is not None:
        user.display_name = data.display_name
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url
    user.updated_at = _now()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _me_out(user, await _providers_for(session, user))


@router.post("/change-password")
async def change_password(
    data: ChangePasswordIn,
    user: User = Depends(get_current_userinfo),
    session: AsyncSession = Depends(get_session),
):
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="password change unavailable"
        )
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="incorrect password")
    user.password_hash = hash_password(data.new_password)
    user.updated_at = _now()
    session.add(user)
    await session.commit()
    return {"ok": True}


@router.get("/users", response_model=list[UserOut])
async def list_users(
    q: str | None = Query(default=None, max_length=64),
    active: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.email.ilike(like)))
    if active is not None:
        stmt = stmt.where(User.is_active == active)
    stmt = stmt.order_by(User.created_at).offset(offset).limit(limit)
    users = (await session.execute(stmt)).scalars().all()
    return [_user_out(u) for u in users]


@router.patch("/users/{user_id}", response_model=UserOut)
async def admin_update_user(
    user_id: str,
    data: AdminUserUpdate,
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    try:
        key = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found") from None
    user = (await session.execute(select(User).where(User.id == key))).scalars().first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    if data.display_name is not None:
        user.display_name = data.display_name
    user.updated_at = _now()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _user_out(user)
