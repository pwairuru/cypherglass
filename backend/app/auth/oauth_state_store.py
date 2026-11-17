"""Single-use OAuth state store: Valkey when reachable, else in-memory.

Mirrors challenge_store semantics: single-use, TTL ~600s, forged/missing/
expired state consumes to False so callers map it to 400/401 (never 200).
"""

import os
import time

OAUTH_STATE_TTL = 600

_memory: dict[str, float] = {}
_MAX_MEMORY = 10000
_client = None
_client_failed = False
_client_failed_at: float = 0.0
_KEY_PREFIX = "oauth:state:"


def _now() -> float:
    """Time source indirection so tests can monkeypatch expiry."""
    return time.time()


def _valkey_client():
    global _client, _client_failed, _client_failed_at
    if _client is not None:
        return _client
    if _client_failed and (_now() - _client_failed_at) < 30.0:
        return None
    _client_failed = False
    url = os.getenv("VALKEY_URL") or os.getenv("REDIS_URL")
    if not url:
        try:
            from app.config import settings

            url = settings.valkey_url
        except Exception:
            url = None
    if not url:
        return None
    try:
        import valkey

        c = valkey.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        c.ping()
        _client = c
        return _client
    except Exception:
        _client_failed = True
        _client_failed_at = _now()
        return None


def issue_state(state: str) -> None:
    client = _valkey_client()
    if client is not None:
        try:
            client.setex(_KEY_PREFIX + state, OAUTH_STATE_TTL, "1")
            return
        except Exception:
            pass
    if len(_memory) >= _MAX_MEMORY:
        now = _now()
        for k in [k for k, e in _memory.items() if e <= now][:1000]:
            _memory.pop(k, None)
    _memory[state] = _now() + OAUTH_STATE_TTL


def consume_state(state: str) -> bool:
    client = _valkey_client()
    if client is not None:
        try:
            deleted = client.delete(_KEY_PREFIX + state)
            return bool(deleted)
        except Exception:
            pass
    exp = _memory.get(state)
    if exp is None:
        return False
    if _now() > exp:
        _memory.pop(state, None)
        return False
    _memory.pop(state, None)
    return True


def clear_all() -> None:
    _memory.clear()
