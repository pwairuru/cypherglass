import os

# Force unpooled DB connections for the whole pytest process. Must run before
# any `app.*` import: TestClient creates a fresh event loop per test, and a
# shared pooled engine hands out asyncpg connections bound to a previous
# loop ("Future attached to a different loop" -> flaky 401s/errors).
# Prod never sets DB_POOLCLASS, so runtime pooling is untouched.
# Explicit opt-out for forensics: DB_POOLCLASS=pooled restores pooling
# (used to reproduce the cross-loop race deterministically).
os.environ.setdefault("DB_POOLCLASS", "nullpool")

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

MOCK_POINTS = [{"t": "2024-01-01", "v": 1.0}, {"t": "2024-01-02", "v": 2.0}]


@pytest.fixture(autouse=True)
def _seed_env(monkeypatch):
    # Explicit seed opt-in for legacy tests (no implicit admin/admin).
    monkeypatch.setenv("ALLOW_SEED_FALLBACK", "1")
    monkeypatch.setenv("SEED_ADMIN_USER", "admin")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "admin")
    # Clear in-memory rate limiter + challenge/state stores so tests are
    # isolated (rate limits are per-process and would otherwise leak).
    try:
        from app.auth import router as _auth_router

        if hasattr(_auth_router, "_RATE"):
            _auth_router._RATE.clear()
    except Exception:
        pass
    try:
        from app.auth import challenge_store as _cs

        _cs.clear_all()
        _cs._client = None
        _cs._client_failed = False
    except Exception:
        pass
    try:
        from app.auth import oauth_state_store as _oss

        _oss.clear_all()
        _oss._client = None
        _oss._client_failed = False
    except Exception:
        pass
    yield


@pytest.fixture
def client():
    with patch("app.ch.query_series", return_value=MOCK_POINTS):
        try:
            with patch("app.metrics.service.query_series", return_value=MOCK_POINTS):
                yield TestClient(app)
        except (ImportError, AttributeError):
            yield TestClient(app)


@pytest.fixture
def token(client):
    import uuid

    # Prefer seed login (no live DB needed); fall back to a fresh register
    # when a real DB is up (seed is fail-closed once users exist).
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin"})
    if r.status_code == 200:
        return r.json()["access_token"]
    uname = f"t_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/v1/auth/register",
        json={"username": uname, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]
