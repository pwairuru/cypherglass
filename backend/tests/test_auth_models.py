from app.auth.models import User, SocialAuth
from app.auth.service import create_token, decode_token


def test_user_model_fields():
    u = User(username="alice", email="alice@x.io", npub="abc123")
    assert u.email == "alice@x.io"
    assert u.is_admin is False
    assert u.is_active is True


def test_social_auth_unique_pair():
    s = SocialAuth(
        user_id="00000000-0000-0000-0000-000000000000",
        provider="nostr",
        uid="abc123",
    )
    assert s.provider == "nostr"


def test_token_carries_uid():
    tok = create_token("alice", "user-id-1")
    payload = decode_token(tok)
    assert payload["sub"] == "alice"
    assert payload["uid"] == "user-id-1"
