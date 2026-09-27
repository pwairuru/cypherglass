import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import or_, select

from app.auth import challenge_store
from app.auth import oauth_state_store
from app.auth import psa
from app.auth.challenge_store import ChallengeStoreError
from app.auth.deps import get_current_userinfo, require_admin
from app.auth.models import SocialAuth, User
from app.auth.nostr_crypto import verify_nostr_event
from app.auth.psa import OAuthError
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


class NostrChallengeIn(BaseModel):
    pubkey: str = Field(pattern=r"^[0-9a-fA-F]{64}$")


class NostrChallengeOut(BaseModel):
    challenge: str
    expires_in: int


class NostrEvent(BaseModel):
    id: str
    pubkey: str
    created_at: int
    kind: int
    tags: list = []
    content: str = ""
    sig: str


class NostrVerifyIn(BaseModel):
    event: NostrEvent


_HEX64 = set("0123456789abcdefABCDEF")


def _is_hex64(v: object) -> bool:
    return isinstance(v, str) and len(v) == 64 and all(c in _HEX64 for c in v)


@router.post("/nostr/challenge", response_model=NostrChallengeOut)
async def nostr_challenge(data: NostrChallengeIn):
    challenge = secrets.token_hex(32)
    try:
        challenge_store.issue_challenge(data.pubkey.lower(), challenge)
    except ChallengeStoreError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="challenge store unavailable",
        ) from None
    return NostrChallengeOut(
        challenge=challenge, expires_in=challenge_store.CHALLENGE_TTL
    )


@router.post("/nostr/verify", response_model=TokenOut)
async def nostr_verify(
    data: NostrVerifyIn, session: AsyncSession = Depends(get_session)
):
    ev = data.event.model_dump()
    pubkey = ev.get("pubkey", "")
    if not _is_hex64(pubkey) or not verify_nostr_event(ev):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        )
    now = int(time.time())
    try:
        created_at = int(ev.get("created_at", 0))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        ) from None
    if abs(now - created_at) > 300:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        )
    try:
        pending = challenge_store.get_challenge(pubkey.lower())
    except ChallengeStoreError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="challenge store unavailable",
        ) from None
    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="unknown_challenge"
        )
    if not isinstance(ev.get("content"), str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        )
    try:
        ok = challenge_store.consume_challenge(pubkey.lower(), ev["content"])
    except ChallengeStoreError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="challenge store unavailable",
        ) from None
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        )
    # Link-or-create: SocialAuth(nostr, pubkey) -> User, else User(npub) link,
    # else fresh User(username nostr_<8>) + SocialAuth row. Fail-closed: any
    # unexpected DB error -> 401, never issue a token without verification.
    try:
        link = (
            await session.execute(
                select(SocialAuth).where(
                    SocialAuth.provider == "nostr", SocialAuth.uid == pubkey.lower()
                )
            )
        ).scalars().first()
        user: User | None = None
        if link is not None:
            user = (
                await session.execute(select(User).where(User.id == link.user_id))
            ).scalars().first()
        if user is None:
            user = (
                await session.execute(select(User).where(User.npub == pubkey.lower()))
            ).scalars().first()
        if user is None:
            base = f"nostr_{pubkey[:8].lower()}"
            username = base
            suffix = 1
            while (
                await session.execute(select(User).where(User.username == username))
            ).scalars().first() is not None:
                suffix += 1
                username = f"{base}_{suffix}"
            user = User(
                username=username,
                npub=pubkey.lower(),
                password_hash="",
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(user)
            await session.flush()
        if link is None:
            session.add(
                SocialAuth(
                    user_id=user.id,
                    provider="nostr",
                    uid=pubkey.lower(),
                    # Naive UTC: models default is tz-aware but columns are
                    # TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects tz-aware).
                    created_at=_now(),
                )
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
            )
        await session.commit()
        await session.refresh(user)
    except HTTPException:
        raise
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_nostr_event"
        ) from None
    return TokenOut(access_token=create_token(user.username, str(user.id)))


class OAuthStartOut(BaseModel):
    auth_url: str
    state: str


@router.get("/oauth/{provider}/start", response_model=OAuthStartOut)
async def oauth_start(provider: str):
    try:
        out = psa.get_oauth_url(provider)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown provider"
        ) from None
    except OAuthError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="provider_error"
        ) from None
    oauth_state_store.issue_state(out["state"])
    return out


@router.get("/oauth/{provider}/callback", response_model=TokenOut)
async def oauth_callback(
    provider: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    session: AsyncSession = Depends(get_session),
):
    if provider not in psa.PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown provider"
        )
    if not code or not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="missing code or state"
        )
    if not oauth_state_store.consume_state(state):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_state"
        )
    try:
        info = await psa.complete_oauth(provider, code, state)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown provider"
        ) from None
    except OAuthError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="provider_error"
        ) from None
    uid = str(info.get("uid", ""))
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="provider_error"
        )
    # Link-or-create (associate_by_email DISABLED: never merge into an
    # existing email row; SocialAuth link is the only join key). Fail-closed:
    # any unexpected DB error -> 401, never issue a token without a link.
    try:
        link = (
            await session.execute(
                select(SocialAuth).where(
                    SocialAuth.provider == provider, SocialAuth.uid == uid
                )
            )
        ).scalars().first()
        user: User | None = None
        if link is not None:
            user = (
                await session.execute(select(User).where(User.id == link.user_id))
            ).scalars().first()
        if user is None:
            email = info.get("email")
            email = email.lower() if email else None
            local = (email.split("@")[0] if email else "")
            base = psa.sanitize_username(local, f"{provider}_{uid[:8]}")
            username = base
            suffix = 1
            while (
                await session.execute(select(User).where(User.username == username))
            ).scalars().first() is not None:
                suffix += 1
                username = f"{base}_{suffix}"
            user = User(
                username=username,
                email=email,
                display_name=info.get("name"),
                avatar_url=info.get("avatar_url"),
                password_hash="",
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(user)
            await session.flush()
        if link is None:
            session.add(
                SocialAuth(
                    user_id=user.id,
                    provider=provider,
                    uid=uid,
                    # Naive UTC: models default is tz-aware but columns are
                    # TIMESTAMP WITHOUT TIME ZONE (asyncpg rejects tz-aware).
                    created_at=_now(),
                )
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_oauth_login"
            )
        await session.commit()
        await session.refresh(user)
    except HTTPException:
        raise
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_oauth_login"
        ) from None
    return TokenOut(access_token=create_token(user.username, str(user.id)))


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
