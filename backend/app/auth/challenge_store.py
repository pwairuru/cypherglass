"""Single-use Nostr challenge store: Valkey when reachable, else in-memory.

Fail-closed: unexpected store errors raise ``ChallengeStoreError``
(callers map it to 503 and never issue a token without verification).
"""

import os
import time

CHALLENGE_TTL = int(os.getenv("NOSTR_CHALLENGE_TTL", "300"))

_KEY_PREFIX = "nostr:chal:"

_memory: dict[str, tuple[str, float]] = {}
_client = None
_client_failed = False
_client_failed_at: float = 0.0
_CLIENT_RETRY_AFTER = 30.0
_MAX_MEMORY = 10000


class ChallengeStoreError(RuntimeError):
    pass


# Atomic compare-and-delete: succeeds (returns 1) only on exact match,
# so a wrong guess never burns the pending challenge.
_LUA_CONSUME = (
    "if redis.call('GET', KEYS[1]) == ARGV[1] "
    "then return redis.call('DEL', KEYS[1]) else return 0 end"
)


def _valkey_consume_atomic(client, key: str, challenge: str) -> bool | None:
    """Lua compare-del. Returns True/False, or None when scripting is
    unavailable (caller falls back to GET+DELETE)."""
    try:
        deleted = client.eval(_LUA_CONSUME, 1, key, challenge)
        return bool(deleted)
    except Exception:
        return None


def _valkey_client():
    global _client, _client_failed, _client_failed_at
    if _client is not None:
        return _client
    if _client_failed and (time.time() - _client_failed_at) < _CLIENT_RETRY_AFTER:
        return None
    # Retry window expired -> try again.
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
        _client_failed_at = time.time()
        return None


def _mem_get(pubkey: str) -> str | None:
    item = _memory.get(pubkey)
    if item is None:
        return None
    chal, exp = item
    if time.time() > exp:
        _memory.pop(pubkey, None)
        return None
    return chal


def issue_challenge(pubkey: str, challenge: str) -> None:
    """Store (or overwrite) the pending challenge for pubkey. Re-issue
    implicitly invalidates the previous value (single active challenge)."""
    exp = time.time() + CHALLENGE_TTL
    client = _valkey_client()
    if client is not None:
        try:
            client.setex(_KEY_PREFIX + pubkey, CHALLENGE_TTL, challenge)
            return
        except Exception as exc:
            raise ChallengeStoreError("challenge store unavailable") from exc
    if len(_memory) >= _MAX_MEMORY:
        # Evict expired entries first to bound memory (challenge spam DoS).
        now = time.time()
        for k in [k for k, (_, e) in _memory.items() if e <= now][:1000]:
            _memory.pop(k, None)
    _memory[pubkey] = (challenge, exp)


def get_challenge(pubkey: str) -> str | None:
    """Return pending challenge or None (unknown/expired)."""
    client = _valkey_client()
    if client is not None:
        try:
            val = client.get(_KEY_PREFIX + pubkey)
            if val is None:
                return None
            return val.decode() if isinstance(val, bytes) else str(val)
        except ChallengeStoreError:
            raise
        except Exception as exc:
            raise ChallengeStoreError("challenge store unavailable") from exc
    return _mem_get(pubkey)


def consume_challenge(pubkey: str, challenge: str) -> bool:
    """Single-use compare-and-delete. True only on exact match."""
    client = _valkey_client()
    if client is not None:
        try:
            key = _KEY_PREFIX + pubkey
            atomic = _valkey_consume_atomic(client, key, challenge)
            if atomic is not None:
                return atomic
            # Fallback (no scripting): GET + conditional DELETE.
            val = client.get(key)
            if val is None:
                return False
            current = val.decode() if isinstance(val, bytes) else str(val)
            # Constant-time compare; delete only on match so a wrong
            # guess does not burn the legitimate pending challenge.
            import hmac

            if not hmac.compare_digest(current, challenge):
                return False
            client.delete(key)
            return True
        except ChallengeStoreError:
            raise
        except Exception as exc:
            raise ChallengeStoreError("challenge store unavailable") from exc
    import hmac

    current = _mem_get(pubkey)
    if current is None or not hmac.compare_digest(current, challenge):
        return False
    _memory.pop(pubkey, None)
    return True


def clear_all() -> None:
    """Test helper: wipe in-memory entries (Valkey entries keep TTL)."""
    _memory.clear()
