"""Task 7: time-mock expiry test for oauth_state_store TTL (Task 5 deferred)."""

from app.auth import oauth_state_store as store


def test_expired_state_rejected(monkeypatch):
    # Force memory path: Valkey enforces real TTL, but this test mocks time.
    monkeypatch.setattr(store, "_valkey_client", lambda: None)
    store.clear_all()
    t0 = store._now()
    monkeypatch.setattr(store, "_now", lambda: t0)
    store.issue_state("s-exp")
    # Advance past TTL: consume must fail and evict the entry.
    monkeypatch.setattr(store, "_now", lambda: t0 + store.OAUTH_STATE_TTL + 1)
    assert store.consume_state("s-exp") is False
    assert "s-exp" not in store._memory
    store.clear_all()
