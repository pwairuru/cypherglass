"""Task 2: register / me / password / admin endpoints (TDD).

Uses the app's Postgres (docker pg is on host port 5433; run pytest with
DATABASE_URL pointed at a reachable DB). Tables are created if missing and
rows are wiped before/after every test so the suite is order-independent
and leaves no residue for other modules (e.g. test_auth seed fallback).
"""

import asyncio
import uuid

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from app.auth.models import SocialAuth, User
from app.config import settings
from app.db import get_session
from app.main import app

REGISTER = "/api/v1/auth/register"


def _run(coro):
    return asyncio.run(coro)


# NullPool: the app-global engine pins pooled connections to the first
# TestClient portal loop; a pooled test engine would hit the same
# cross-loop error, so every session here gets a fresh connection.
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


async def _make_admin(username: str):
    from sqlmodel import select

    async with TestSession() as s:
        u = (await s.execute(select(User).where(User.username == username))).scalars().first()
        assert u is not None
        u.is_admin = True
        s.add(u)
        await s.commit()


@pytest.fixture(scope="module", autouse=True)
def _tables():
    _run(_create_tables())
    app.dependency_overrides[get_session] = _override_get_session
    yield
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture(autouse=True)
def _clean():
    _run(_wipe())
    yield
    _run(_wipe())


def _register(client, username="bob", password="s3cretpass", email="bob@x.io"):
    body = {"username": username, "password": password}
    if email is not None:
        body["email"] = email
    return client.post(REGISTER, json=body)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---- brief verbatim tests ----


def test_register_me_flow(client):
    r = client.post(REGISTER, json={"username": "bob", "email": "bob@x.io", "password": "s3cretpass"})
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers=_auth(tok))
    assert me.status_code == 200
    assert me.json()["username"] == "bob"


def test_register_duplicate_409(client):
    client.post(REGISTER, json={"username": "bob", "password": "s3cretpass"})
    r = client.post(REGISTER, json={"username": "bob", "password": "otherpass1"})
    assert r.status_code == 409


def test_admin_guard(client, token):
    r = client.get("/api/v1/auth/users", headers=_auth(token))
    assert r.status_code in (200, 403)


# ---- carried rulings + spec section 5 ----


def test_register_duplicate_email_409(client):
    _register(client, username="bob", email="bob@x.io")
    r = _register(client, username="alice", email="BOB@x.io")
    assert r.status_code == 409


def test_register_bad_email_422(client):
    r = _register(client, username="bob", email="not-an-email")
    assert r.status_code == 422


def test_login_with_email(client):
    _register(client, username="bob", email="bob@x.io", password="s3cretpass")
    r = client.post("/api/v1/auth/login", json={"username": "bob@x.io", "password": "s3cretpass"})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


def test_me_patch_and_displayname_limit(client):
    tok = _register(client).json()["access_token"]
    r = client.patch(
        "/api/v1/auth/me", json={"display_name": "x" * 65}, headers=_auth(tok)
    )
    assert r.status_code == 422
    r = client.patch(
        "/api/v1/auth/me",
        json={"display_name": "Bobby", "avatar_url": "https://x.io/a.png"},
        headers=_auth(tok),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "Bobby"
    assert body["providers"] == []


def test_change_password(client):
    tok = _register(client, password="s3cretpass").json()["access_token"]
    r = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "wrongpass1", "new_password": "n3wsecretpass"},
        headers=_auth(tok),
    )
    assert r.status_code == 400
    r = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "s3cretpass", "new_password": "n3wsecretpass"},
        headers=_auth(tok),
    )
    assert r.status_code == 200, r.text
    assert (
        client.post("/api/v1/auth/login", json={"username": "bob", "password": "s3cretpass"}).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "bob", "password": "n3wsecretpass"}
        ).status_code
        == 200
    )


def test_nonadmin_users_403(client):
    tok = _register(client).json()["access_token"]
    r = client.get("/api/v1/auth/users", headers=_auth(tok))
    assert r.status_code == 403


def test_admin_list_patch_and_disable(client):
    _register(client, username="root", email="root@x.io")
    _run(_make_admin("root"))
    r = client.post("/api/v1/auth/login", json={"username": "root", "password": "s3cretpass"})
    assert r.status_code == 200, r.text
    admin_tok = r.json()["access_token"]

    _register(client, username="bob", email="bob@x.io")
    r = client.get("/api/v1/auth/users", headers=_auth(admin_tok))
    assert r.status_code == 200, r.text
    users = r.json()
    assert {u["username"] for u in users} >= {"root", "bob"}

    r = client.get("/api/v1/auth/users?q=bo&active=true", headers=_auth(admin_tok))
    assert r.status_code == 200
    assert [u["username"] for u in r.json()] == ["bob"]

    bob_id = next(u["id"] for u in users if u["username"] == "bob")
    # invalid uuid -> 404
    r = client.patch("/api/v1/auth/users/not-a-uuid", json={"is_active": False}, headers=_auth(admin_tok))
    assert r.status_code == 404
    r = client.patch(f"/api/v1/auth/users/{bob_id}", json={"is_active": False}, headers=_auth(admin_tok))
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False
    assert (
        client.post("/api/v1/auth/login", json={"username": "bob", "password": "s3cretpass"}).status_code
        == 401
    )


def test_users_unknown_id_404(client):
    _register(client, username="root", email="root@x.io")
    _run(_make_admin("root"))
    tok = client.post("/api/v1/auth/login", json={"username": "root", "password": "s3cretpass"}).json()[
        "access_token"
    ]
    r = client.patch(f"/api/v1/auth/users/{uuid.uuid4()}", json={"is_admin": True}, headers=_auth(tok))
    assert r.status_code == 404
