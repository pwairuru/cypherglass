"""Task 4: OAuth start/callback + Nostr social-core backend (TDD)."""

import asyncio

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel
from unittest.mock import AsyncMock, patch

from app.auth.models import SocialAuth, User
from app.config import settings
from app.db import get_session
from app.main import app


def _run(coro):
    return asyncio.run(coro)


test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
TestSession = async_sessionmaker(test_engine, expire_on_commit=False)


async def _override_get_session():
    async with TestSession() as s:
        yield s


async def _create_tables():
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def _wipe():
    async with test_engine.begin() as conn:
        await conn.execute(delete(SocialAuth))
        await conn.execute(delete(User))


@pytest.fixture(scope="module", autouse=True)
def _tables():
    _run(_create_tables())
    app.dependency_overrides[get_session] = _override_get_session
    yield
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture(autouse=True)
def _clean():
    _run(_wipe())
    from app.auth import oauth_state_store as oss

    oss.clear_all()
    yield
    _run(_wipe())
    oss.clear_all()


def test_oauth_start_google(client):
    from app.config import settings

    settings.google_client_id = "test-id"
    settings.google_client_secret = "test-secret"
    r = client.get("/api/v1/auth/oauth/google/start")
    assert r.status_code == 200
    assert "accounts.google.com" in r.json()["auth_url"]


def test_oauth_callback_mocked(client):
    from app.config import settings

    settings.google_client_id = "test-id"
    settings.google_client_secret = "test-secret"
    state = client.get("/api/v1/auth/oauth/google/start").json()["state"]
    with patch(
        "app.auth.psa.complete_oauth",
        new=AsyncMock(
            return_value={"provider": "google", "uid": "g123", "email": "g@x.io"}
        ),
    ):
        r = client.get(f"/api/v1/auth/oauth/google/callback?code=abc&state={state}")
        assert r.status_code == 200
        assert "access_token" in r.json()


def test_nostr_backend_class():
    from app.auth.backends.nostr import NostrAuth

    assert NostrAuth.name == "nostr"
