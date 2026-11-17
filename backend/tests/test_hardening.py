"""Hardening regression tests for P0/P1 fixes (no live DB/CH required)."""

import os

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from app.auth import challenge_store
from app.auth.schemas import LoginIn, MeUpdate
from app.auth.service import _seed_allowed, _seed_user, create_token
from app.config import settings
from app.main import app
from app.workers import price as price_mod


@pytest.fixture(autouse=True)
def _clean_seed_env(monkeypatch):
    monkeypatch.delenv("ALLOW_SEED_FALLBACK", raising=False)
    monkeypatch.delenv("SEED_ADMIN_USER", raising=False)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    yield
    monkeypatch.delenv("ALLOW_SEED_FALLBACK", raising=False)


def test_seed_disabled_by_default():
    assert _seed_allowed() is False
    assert _seed_user("admin", "admin") is None


def test_seed_requires_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("ALLOW_SEED_FALLBACK", "1")
    # No SEED vars set -> still None (no hardcoded admin/admin).
    assert _seed_user("admin", "admin") is None
    monkeypatch.setenv("SEED_ADMIN_USER", "admin")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "s3cret")
    assert _seed_user("admin", "admin") is None
    assert _seed_user("admin", "s3cret") is not None


def test_jwt_has_issuer_and_jti():
    tok = create_token("alice", "uid-1")
    payload = pyjwt.decode(tok, settings.jwt_secret, algorithms=["HS256"], issuer="cypherglass")
    assert payload["iss"] == "cypherglass"
    assert payload["jti"]
    assert payload["sub"] == "alice"


def test_login_rejects_empty_strings():
    with pytest.raises(Exception):
        LoginIn(username="", password="x")
    with pytest.raises(Exception):
        LoginIn(username="x", password="")


def test_avatar_url_scheme_rejected():
    with pytest.raises(Exception):
        MeUpdate(avatar_url="javascript:alert(1)")
    with pytest.raises(Exception):
        MeUpdate(avatar_url="data:text/html,hi")
    assert MeUpdate(avatar_url="https://x/y.png").avatar_url == "https://x/y.png"
    assert MeUpdate(avatar_url="/local.png").avatar_url == "/local.png"


def test_like_escape():
    from app.auth.router import _escape_like

    assert _escape_like("a%b_c\\d") == "a\\%b\\_c\\\\d"


def test_metrics_range_validation():
    from fastapi import HTTPException

    from app.metrics import service

    with pytest.raises(HTTPException) as ei:
        service.get_series("price_close_daily", "2024-02-01", "2024-01-01")
    assert ei.value.status_code == 422
    with pytest.raises(HTTPException) as ei2:
        service.get_ohlc("daily", "2020-01-01", "2030-01-01")
    assert ei2.value.status_code == 422


def test_upsert_rows_parameterized():
    rows = [{"ts": 1, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 10.0}]
    out = price_mod.upsert_rows(rows, source="binance", symbol="BTCUSDT")
    assert out == [("binance", "BTCUSDT", 1, 1.0, 2.0, 0.5, 1.5, 10.0)]
    # Legacy SQL builder escapes quotes (injection-safe-ish).
    evil = [{"ts": 1, "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}]
    sql = price_mod.upsert_sql(evil, source="a'b", symbol="BTCUSDT")
    assert "a''b" in sql


def test_challenge_retry_after_failure(monkeypatch):
    challenge_store._client = None
    challenge_store._client_failed = True
    import time as _t

    challenge_store._client_failed_at = _t.time() - 100.0
    monkeypatch.delenv("VALKEY_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    # Retry window expired -> falls back to memory store, no 503.
    challenge_store.issue_challenge("ab" * 32, "chal")
    assert challenge_store.get_challenge("ab" * 32) == "chal"


def test_cors_not_wildcard():
    cors = [m for m in app.user_middleware]
    assert cors  # middleware present; origins come from settings allowlist
    assert "*" not in settings.cors_origin_list()


def test_jwt_strict_requires_exp_iss_sub_and_hs256():
    import jwt as _jwt

    from app.auth.service import ALGORITHM, decode_token

    assert ALGORITHM == "HS256"
    tok = create_token("alice", "uid-1")
    assert decode_token(tok)["sub"] == "alice"
    # alg=none rejected (no alg confusion)
    none_tok = _jwt.encode({"sub": "alice"}, "", algorithm="none")
    with pytest.raises(Exception):
        decode_token(none_tok)
    # missing exp rejected
    no_exp = pyjwt.encode(
        {"sub": "alice", "iss": "cypherglass"}, settings.jwt_secret, algorithm="HS256"
    )
    with pytest.raises(Exception):
        decode_token(no_exp)
    # wrong issuer rejected
    bad_iss = pyjwt.encode(
        {"sub": "alice", "iss": "evil"},
        settings.jwt_secret,
        algorithm="HS256",
        headers={"exp": 9999999999},
    )
    with pytest.raises(Exception):
        decode_token(bad_iss)
    # ver claim survives round-trip (password-change revocation binding)
    tok2 = create_token("bob", "uid-2", pwd_ver="abc123")
    assert decode_token(tok2)["ver"] == "abc123"


def test_challenge_roundtrip_over_password_authed_valkey(monkeypatch):
    """Regression: challenge store works through a password-gated Valkey
    client (mirrors prod requirepass wiring)."""

    class AuthedFakeValkey:
        def __init__(self, password):
            self._pw = password
            self._authed = False
            self.store = {}

        def auth(self, password):
            if password != self._pw:
                raise ValueError("WRONGPASS")
            self._authed = True

        def _need(self):
            if not self._authed:
                raise ValueError("NOAUTH Authentication required.")

        def ping(self):
            self._need()
            return True

        def setex(self, k, ttl, v):
            self._need()
            self.store[k] = v

        def get(self, k):
            self._need()
            return self.store.get(k)

        def delete(self, k):
            self._need()
            return self.store.pop(k, None) is not None

        def eval(self, *a):
            raise ValueError("NOSCRIPT")

    fake = AuthedFakeValkey("s3cret-valkey-pass")
    fake.auth("s3cret-valkey-pass")
    monkeypatch.setattr(challenge_store, "_valkey_client", lambda: fake)
    pk = "ab" * 32
    challenge_store.issue_challenge(pk, "chal-1")
    assert challenge_store.get_challenge(pk) == "chal-1"
    assert challenge_store.consume_challenge(pk, "chal-1") is True
    assert challenge_store.get_challenge(pk) is None
    # unauthenticated client cannot operate (mirrors requirepass)
    bad = AuthedFakeValkey("s3cret-valkey-pass")
    with pytest.raises(Exception):
        bad.ping()


def test_audit_middleware_logs_failed_login(caplog):
    import logging

    caplog.set_level(logging.INFO, logger="cypherglass.audit")
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"username": "nosuchuser", "password": "wrongpass123"})
    assert r.status_code in (401, 429)
    recs = [r for r in caplog.records if r.name == "cypherglass.audit" and "POST /api/v1/auth/login" in r.getMessage()]
    assert recs, "audit middleware must log auth attempts"
    assert str(r.status_code) in recs[0].getMessage()


def test_challenge_store_outage_maps_to_503_not_bypass(monkeypatch):
    """Failure injection: Valkey down AND memory path forced to fail ->
    /nostr/challenge must 503 (fail-closed), never 200 with a forged token."""
    import app.auth.router as router_mod
    from app.auth.challenge_store import ChallengeStoreError

    def _boom(*a, **k):
        raise ChallengeStoreError("store down")

    monkeypatch.setattr("app.auth.challenge_store.issue_challenge", _boom)
    # Router imports the symbol directly; patch the router's reference too.
    monkeypatch.setattr(router_mod.challenge_store, "issue_challenge", _boom, raising=False)
    c = TestClient(app)
    r = c.post(
        "/api/v1/auth/nostr/challenge",
        json={"pubkey": "a" * 64},
    )
    assert r.status_code == 503, r.text


def test_health_endpoint():
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
