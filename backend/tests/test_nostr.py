"""Task 3: Nostr challenge/verify (TDD).

Module-level `_signed(kind=27235, content="hello")` is the shared helper
Task 5 imports — keep its exact name/signature.
"""

import asyncio
import time

import pytest
from coincurve import PrivateKey
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from app.auth.models import SocialAuth, User
from app.auth.nostr_crypto import nostr_event_id, verify_nostr_event
from app.config import settings
from app.db import get_session
from app.main import app


def _signed(kind=27235, content="hello"):
    sk = PrivateKey(b"\x11" * 32)
    pub = sk.public_key.format(compressed=False)[1:33].hex()  # x-only
    ev = {
        "pubkey": pub,
        "created_at": int(time.time()),
        "kind": kind,
        "tags": [["u", "http://test/"], ["method", "GET"]],
        "content": content,
    }
    ev["id"] = nostr_event_id(ev)
    sig = sk.sign_schnorr(bytes.fromhex(ev["id"])).hex()
    ev["sig"] = sig
    return ev


def test_verify_valid():
    assert verify_nostr_event(_signed()) is True


def test_verify_tampered_content_fails():
    ev = _signed()
    ev["content"] = "evil"
    assert verify_nostr_event(ev) is False


# ---- endpoint tests (hermetic Postgres like test_user_mgmt.py) ----


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
    from app.auth import challenge_store as cs

    cs.clear_all()
    yield
    _run(_wipe())
    from app.auth import challenge_store as cs

    cs.clear_all()


def test_challenge_single_use(client):
    pub = "ab" * 32
    r = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    assert r.status_code == 200
    chal = r.json()["challenge"]
    r2 = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    assert r2.status_code == 200  # re-issue allowed, old invalidated implicitly
    assert r2.json()["challenge"] != chal


def test_challenge_bad_pubkey_422(client):
    r = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": "zz"})
    assert r.status_code == 422


def test_verify_roundtrip_replay_401(client):
    from coincurve import PrivateKey as PK

    sk = PK(b"\x22" * 32)
    pub = sk.public_key.format(compressed=False)[1:33].hex()
    r = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    assert r.status_code == 200, r.text
    chal = r.json()["challenge"]
    ev = {
        "pubkey": pub,
        "created_at": int(time.time()),
        "kind": 27235,
        "tags": [],
        "content": chal,
    }
    ev["id"] = nostr_event_id(ev)
    ev["sig"] = sk.sign_schnorr(bytes.fromhex(ev["id"])).hex()
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]
    # replay: challenge single-use -> consumed -> 404 (spec: challenge
    # missing -> 404) or 401; both mean no second token.
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code in (401, 404)


def test_verify_unknown_challenge_404_or_401(client):
    ev = _signed(content="no-challenge-issued-for-this")
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code in (401, 404)


def test_verify_bad_sig_401(client):
    from coincurve import PrivateKey as PK

    sk = PK(b"\x33" * 32)
    pub = sk.public_key.format(compressed=False)[1:33].hex()
    r = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    chal = r.json()["challenge"]
    ev = _signed(content=chal)
    ev["pubkey"] = pub  # sig no longer matches pubkey
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code == 401
