"""Single-use OAuth state store: in-memory with TTL (Valkey-ready pattern).

Mirrors challenge_store semantics: single-use, TTL ~600s, forged/missing/
expired state consumes to False so callers map it to 400/401 (never 200).
"""

import time

OAUTH_STATE_TTL = 600

_memory: dict[str, float] = {}


def issue_state(state: str) -> None:
    _memory[state] = time.time() + OAUTH_STATE_TTL


def consume_state(state: str) -> bool:
    exp = _memory.get(state)
    if exp is None:
        return False
    if time.time() > exp:
        _memory.pop(state, None)
        return False
    _memory.pop(state, None)
    return True


def clear_all() -> None:
    _memory.clear()
