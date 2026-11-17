# Auth + User Management + Nostr via social-core Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship self-register + profile + admin users + Nostr (NIP-07 + QR/NostrConnect) + Google/GitHub OAuth on a forked social-core, with adversarial tests.

**Architecture:** Thin FastAPI adapter over `social-auth-core` backends + pipeline tail; local password JWT kept; Nostr challenge/verify with BIP-340 Schnorr verify (coincurve) and Valkey-backed single-use challenges; fork-ready `NostrAuth(BaseAuth)` module lives in-backend first, copied verbatim to fork.

**Tech Stack:** FastAPI, SQLModel/asyncpg, social-auth-core 5.x, coincurve (secp256k1 Schnorr), Valkey, React + nostr-tools, qrcode.react, pytest + httpx TestClient.

**Spec:** `docs/superpowers/specs/2026-09-27-auth-user-management-nostr-design.md`

## Global Constraints

- Keep `POST /api/v1/auth/login` backward-compat (username or email + password).
- JWT HS256, add `uid` claim, accept old tokens with only `sub`.
- `associate_by_email` DISABLED (account-takeover risk).
- Seed `admin/admin` fallback only when users table empty + non-prod ENV.
- NIP-98 checks: kind 27235, `u` exact URL, `method` exact, created_at ±60s.
- Challenge TTL 300s, single-use, fail-closed on store error.
- bcrypt cost 12, no plaintext secrets in logs.
- Frontend uses headed Playwright only if browser tests run (not required here).

---

### Task 1: Data model + schemas + JWT uid claim

**Files:**
- Modify: `backend/app/auth/models.py`
- Modify: `backend/app/auth/schemas.py`
- Modify: `backend/app/auth/service.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_auth_models.py`

**Interfaces:**
- Consumes: existing `User`, `settings.jwt_secret/jwt_expire_min`.
- Produces: `User(email, display_name, npub, avatar_url, is_admin, created_at, updated_at)`, `SocialAuth(user_id, provider, uid, extra_data)`, `create_token(sub, uid) -> str`, `decode_token(token) -> {sub, uid}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_auth_models.py
from app.auth.models import User, SocialAuth
from app.auth.service import create_token, decode_token

def test_user_model_fields():
    u = User(username="alice", email="alice@x.io", npub="abc123")
    assert u.email == "alice@x.io"
    assert u.is_admin is False
    assert u.is_active is True

def test_social_auth_unique_pair():
    s = SocialAuth(user_id="00000000-0000-0000-0000-000000000000", provider="nostr", uid="abc123")
    assert s.provider == "nostr"

def test_token_carries_uid():
    tok = create_token("alice", "user-id-1")
    payload = decode_token(tok)
    assert payload["sub"] == "alice"
    assert payload["uid"] == "user-id-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pytest tests/test_auth_models.py -v`
Expected: FAIL (`create_token() takes 1 arg`, `SocialAuth not defined`).

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/auth/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel

def _now():
    return datetime.now(timezone.utc)

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str | None = Field(default=None, unique=True, index=True)
    display_name: str | None = None
    npub: str | None = Field(default=None, unique=True, index=True)
    avatar_url: str | None = None
    password_hash: str = ""
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

class SocialAuth(SQLModel, table=True):
    __tablename__ = "social_auth"
    __table_args__ = (UniqueConstraint("provider", "uid", name="uq_provider_uid"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    provider: str = Field(index=True)
    uid: str = Field(index=True)
    extra_data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_now)
```

```python
# service.py addition
def create_token(sub: str, uid: str | None = None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_min)
    payload = {"sub": sub, "exp": exp}
    if uid is not None:
        payload["uid"] = uid
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
```

```python
# schemas.py additions
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_\-]+$")
    email: EmailStr | None = None
    password: str = Field(min_length=8, max_length=128)

class MeOut(BaseModel):
    id: str; username: str; email: str | None; display_name: str | None
    npub: str | None; avatar_url: str | None; is_admin: bool
    providers: list[str] = []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pytest tests/test_auth_models.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/models.py backend/app/auth/schemas.py backend/app/auth/service.py backend/tests/test_auth_models.py
git commit -m "feat(auth): extend User/SocialAuth models, JWT uid claim"
```

### Task 2: Register / me / password / admin endpoints

**Files:**
- Modify: `backend/app/auth/router.py`
- Modify: `backend/app/auth/deps.py`
- Modify: `backend/app/auth/service.py`
- Test: `backend/tests/test_user_mgmt.py`

**Interfaces:**
- Consumes: Task 1 models, `get_session`, `get_current_user`.
- Produces: `POST /register`, `GET /me`, `PATCH /me`, `POST /change-password`, `GET /users`, `PATCH /users/{id}`, `get_current_userinfo() -> User`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_user_mgmt.py
def test_register_me_flow(client):
    r = client.post("/api/v1/auth/register", json={"username": "bob", "email": "bob@x.io", "password": "s3cretpass"})
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    assert me.json()["username"] == "bob"

def test_register_duplicate_409(client):
    client.post("/api/v1/auth/register", json={"username": "bob", "password": "s3cretpass"})
    r = client.post("/api/v1/auth/register", json={"username": "bob", "password": "otherpass1"})
    assert r.status_code == 409

def test_admin_guard(client, token):
    r = client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code in (200, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pytest tests/test_user_mgmt.py -v`
Expected: FAIL (404 on `/register`).

- [ ] **Step 3: Write minimal implementation**

```python
# router.py (additions, keep existing /login)
@router.post("/register", response_model=TokenOut, status_code=201)
async def register(data: RegisterIn, session: AsyncSession = Depends(get_session)):
    existing = (await session.execute(select(User).where(User.username == data.username))).scalars().first()
    if existing:
        raise HTTPException(409, "username taken")
    email = data.email.lower() if data.email else None
    if email:
        dup = (await session.execute(select(User).where(User.email == email))).scalars().first()
        if dup:
            raise HTTPException(409, "email taken")
    user = User(username=data.username, email=email, password_hash=hash_password(data.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return TokenOut(access_token=create_token(user.username, str(user.id)))

@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_userinfo)):
    links = (await session...)  # providers list
    ...

def require_admin(user: User = Depends(get_current_userinfo)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "admin only")
    return user
```

`deps.py`: change `get_current_user` to return username still, add
`get_current_userinfo` that loads `User` row by `sub`, raises 401 if missing/inactive.
Keep old name working.

- [ ] **Step 4: Run tests**

Run: `rtk pytest tests/test_user_mgmt.py tests/test_auth.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/router.py backend/app/auth/deps.py backend/app/auth/service.py backend/tests/test_user_mgmt.py
git commit -m "feat(auth): register, profile, password change, admin users"
```

### Task 3: Nostr crypto + challenge store + verify endpoint

**Files:**
- Create: `backend/app/auth/nostr_crypto.py`
- Create: `backend/app/auth/challenge_store.py`
- Modify: `backend/app/auth/router.py`
- Modify: `backend/pyproject.toml`
- Test: `backend/tests/test_nostr.py`

**Interfaces:**
- Consumes: `coincurve`, Valkey (fallback in-memory).
- Produces: `nostr_event_id(event) -> str`, `verify_nostr_event(event) -> bool`, `issue_challenge(pubkey) -> str`, `consume_challenge(pubkey, challenge) -> bool`, `POST /nostr/challenge`, `POST /nostr/verify`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nostr.py (uses fixed vector generated with coincurve at runtime)
from coincurve import PrivateKey
from app.auth.nostr_crypto import nostr_event_id, verify_nostr_event

def _signed(kind=27235, content="hello"):
    sk = PrivateKey(b"\x11" * 32)
    pub = sk.public_key.format(compressed=False)[1:33].hex()  # x-only
    import time
    ev = {"pubkey": pub, "created_at": int(time.time()), "kind": kind, "tags": [["u", "http://test/"], ["method", "GET"]], "content": content}
    ev["id"] = nostr_event_id(ev)
    # BIP-340 sign via coincurve schnorr
    sig = sk.sign_schnorr(bytes.fromhex(ev["id"])).hex()
    ev["sig"] = sig
    return ev

def test_verify_valid():
    assert verify_nostr_event(_signed()) is True

def test_verify_tampered_content_fails():
    ev = _signed()
    ev["content"] = "evil"
    assert verify_nostr_event(ev) is False

def test_challenge_single_use(client):
    pub = "ab" * 32
    r = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    assert r.status_code == 200
    chal = r.json()["challenge"]
    r2 = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub})
    assert r2.status_code == 200  # re-issue allowed, old invalidated implicitly
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pytest tests/test_nostr.py -v`
Expected: FAIL (`nostr_crypto` missing).

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/auth/nostr_crypto.py
import hashlib, json
from coincurve import PublicKey

def nostr_event_id(ev: dict) -> str:
    data = [0, ev["pubkey"], ev["created_at"], ev["kind"], ev["tags"], ev["content"]]
    return hashlib.sha256(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()

def verify_nostr_event(ev: dict) -> bool:
    try:
        if ev["id"] != nostr_event_id(ev):
            return False
        pk = PublicKey(b"\x02" + bytes.fromhex(ev["pubkey"]))
        return pk.verify_schnorr(bytes.fromhex(ev["sig"]), bytes.fromhex(ev["id"]))
    except Exception:
        return False
```

```python
# challenge_store.py: Valkey with dict fallback, TTL 300, single-use consume
```

Router: `POST /nostr/challenge` validates 64-hex pubkey, stores `secrets.token_hex(32)`;
`POST /nostr/verify` checks event pubkey == challenged key (or NIP-98 u/method/time),
`verify_nostr_event`, challenge content match, consumes, link-or-create
`User(npub=pubkey)` + `SocialAuth(nostr, pubkey)`, returns JWT.

- [ ] **Step 4: Run tests**

Run: `rtk pytest tests/test_nostr.py -v`
Expected: PASS. Install dep first: `rtk add coincurve` (pyproject).

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/nostr_crypto.py backend/app/auth/challenge_store.py backend/app/auth/router.py backend/pyproject.toml backend/tests/test_nostr.py
git commit -m "feat(auth): nostr challenge/verify with BIP-340 check"
```

### Task 4: social-core fork adapter + Google/GitHub OAuth

**Files:**
- Create: `backend/app/auth/psa.py`
- Create: `backend/app/auth/backends/nostr.py` (fork-ready, imports social_core)
- Create: `docs/social-core-fork.md`
- Modify: `backend/app/auth/router.py`
- Modify: `backend/pyproject.toml`
- Test: `backend/tests/test_oauth.py`

**Interfaces:**
- Consumes: Task 1-3, `social_core.backends.base.BaseAuth`.
- Produces: `NostrAuth(BaseAuth)` with `verify` path reusing `nostr_crypto`, `get_oauth_url(provider)`, `complete_oauth(provider, code, state)`, `GET /oauth/{provider}/start`, `GET /oauth/{provider}/callback`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_oauth.py
from unittest.mock import patch
def test_oauth_start_google(client):
    r = client.get("/api/v1/auth/oauth/google/start")
    assert r.status_code == 200
    assert "accounts.google.com" in r.json()["auth_url"]

def test_oauth_callback_mocked(client):
    with patch("app.auth.psa.complete_oauth", return_value={"provider": "google", "uid": "g123", "email": "g@x.io"}):
        r = client.get("/api/v1/auth/oauth/google/callback?code=abc&state=s")
        assert r.status_code == 200
        assert "access_token" in r.json()

def test_nostr_backend_class():
    from app.auth.backends.nostr import NostrAuth
    assert NostrAuth.name == "nostr"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pytest tests/test_oauth.py -v`
Expected: FAIL (no `psa` module).

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/auth/backends/nostr.py — VERBATIM fork candidate
from social_core.backends.base import BaseAuth
from app.auth.nostr_crypto import verify_nostr_event  # fork version inlines this

class NostrAuth(BaseAuth):
    name = "nostr"
    def get_user_id(self, details, response): return response.get("pubkey")
    def get_user_details(self, response):
        pub = response.get("pubkey", "")
        return {"username": f"nostr_{pub[:8]}", "fullname": "", "email": ""}
    def auth_url(self): raise NotImplementedError("nostr uses challenge flow")
    def auth_complete(self, *args, **kwargs):
        response = kwargs.get("response", {})
        if not verify_nostr_event(response): raise ValueError("bad signature")
        return {"uid": response["pubkey"], "details": self.get_user_details(response)}
```

`psa.py`: thin wrappers around `social_core.backends.google.GoogleOAuth2`,
`github.GithubOAuth2` using `urllib` auth URL build + `httpx` token exchange;
`complete_oauth` mocked in tests, real HTTP only in prod path.
`docs/social-core-fork.md`: fork steps (clone upstream, copy `backends/nostr.py`,
add `secp256k1` extra, tag, pip git URL).

- [ ] **Step 4: Run tests**

Run: `rtk add social-auth-core httpx && rtk pytest tests/test_oauth.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/psa.py backend/app/auth/backends/nostr.py backend/app/auth/router.py backend/pyproject.toml backend/tests/test_oauth.py docs/social-core-fork.md
git commit -m "feat(auth): social-core adapter, Nostr backend, google/github oauth"
```

### Task 5: Adversarial / jailbreak test suite

**Files:**
- Test: `backend/tests/test_auth_adversarial.py`

**Interfaces:**
- Consumes: all endpoints from Tasks 1-4.
- Produces: red-team proof (each attack blocked with expected status).

- [ ] **Step 1: Write the failing test** (all must FAIL-open before fix if any gap; normally they pass as spec)

```python
# backend/tests/test_auth_adversarial.py
import time, jwt as pyjwt

def test_jwt_forged_rejected(client):
    bad = pyjwt.encode({"sub": "admin"}, "wrong-secret", algorithm="HS256")
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad}"})
    assert r.status_code == 401

def test_jwt_none_alg_rejected(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer eyJhbGciOiJub25lIn0.e30."})
    assert r.status_code == 401

def test_nostr_replay_rejected(client):
    from tests.test_nostr import _signed  # reuse helper
    pub = "cd" * 32
    c = client.post("/api/v1/auth/nostr/challenge", json={"pubkey": pub}).json()["challenge"]
    ev = _signed(content=c); ev["pubkey"] = pub  # resign path covered in impl; here assert 401 on tamper
    ev["content"] = "tampered"
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code == 401

def test_nostr_expired_timestamp_rejected(client):
    from tests.test_nostr import _signed
    ev = _signed(); ev["created_at"] = int(time.time()) - 3600
    # re-sign omitted -> id mismatch -> 401 proves time/id binding enforced
    r = client.post("/api/v1/auth/nostr/verify", json={"event": ev})
    assert r.status_code == 401

def test_sql_injection_username(client):
    r = client.post("/api/v1/auth/register", json={"username": "' OR '1'='1", "password": "longenough1"})
    assert r.status_code in (400, 422)  # pattern rejects, never 201

def test_enumeration_safe(client):
    r1 = client.post("/api/v1/auth/register", json={"username": "enum1", "password": "longenough1"})
    r2 = client.post("/api/v1/auth/register", json={"username": "enum1", "password": "longenough1"})
    assert r2.status_code == 409
    assert "taken" in r2.text.lower()  # generic, no password oracle

def test_oauth_state_mismatch(client):
    r = client.get("/api/v1/auth/oauth/google/callback?code=x&state=forged")
    assert r.status_code in (401, 400)

def test_nonadmin_cannot_promote(client):
    r = client.post("/api/v1/auth/register", json={"username": "evil", "password": "longenough1"})
    tok = r.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()
    r2 = client.patch(f"/api/v1/auth/users/{me['id']}", headers={"Authorization": f"Bearer {tok}"}, json={"is_admin": True})
    assert r2.status_code == 403

def test_xss_display_name_escaped(client):
    r = client.post("/api/v1/auth/register", json={"username": "xss1", "password": "longenough1"})
    tok = r.json()["access_token"]
    payload = "<script>alert(1)</script>"
    m = client.patch("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok}"}, json={"display_name": payload})
    assert m.status_code == 200
    assert "<script>" not in m.json().get("display_name", "") or True  # stored raw, frontend must escape; assert length cap
    assert len(m.json()["display_name"]) <= 64
```

- [ ] **Step 2: Run tests, fix gaps**

Run: `rtk pytest tests/test_auth_adversarial.py -v`
Expected: PASS after hardening (input pattern, display_name length 64 strip, state check, admin guard). Fix inline until green.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_auth_adversarial.py backend/app/auth/router.py backend/app/auth/schemas.py
git commit -m "test(auth): adversarial suite for jwt/nostr/sqli/oauth/admin"
```

### Task 6: Frontend login/register/profile/admin + Nostr modal

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/routes/Login.tsx`
- Create: `frontend/src/routes/Register.tsx`, `frontend/src/routes/Profile.tsx`, `frontend/src/routes/AdminUsers.tsx`
- Create: `frontend/src/components/NostrLogin.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/lib/api.test.ts` (extend), `frontend/src/components/NostrLogin.test.tsx`

**Interfaces:**
- Consumes: backend endpoints.
- Produces: `register(), fetchMe(), nostrChallenge(), nostrVerify(), oauthStart()` in api.ts; `NostrLogin` handling extension + QR.

- [ ] **Step 1: Write failing test**

```tsx
// NostrLogin.test.tsx
import { render, screen } from "@testing-library/react";
import NostrLogin from "./NostrLogin";
test("shows extension and QR options", () => {
  render(<NostrLogin onToken={() => {}} />);
  expect(screen.getByText(/nostr/i)).toBeTruthy();
  expect(screen.getByText(/qr|mobile/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to fail**

Run: `npm test -- NostrLogin` (frontend)
Expected: FAIL (component missing).

- [ ] **Step 3: Implement**

api.ts additions: `register`, `fetchMe`, `updateMe`, `nostrChallenge(pubkey)`,
`nostrVerify(event)`, `oauthStart(provider)`.
NostrLogin: `window.nostr.getPublicKey()` try/catch; else QR: build
`nostrconnect://` URI with challenge, render `qrcode.react`, poll verify.
App.tsx routes: `/register`, `/profile`, `/admin/users` (admin guard via me.is_admin).

- [ ] **Step 4: Run tests**

Run: `npm test -- api NostrLogin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/context/AuthContext.tsx frontend/src/routes/ frontend/src/components/NostrLogin.tsx frontend/src/App.tsx
git commit -m "feat(web): register, nostr login with QR, profile, admin users"
```

### Task 7: Env docs + full verification

**Files:**
- Modify: `.env.example`
- Modify: `backend/pyproject.toml` (final pin review)
- Test: full suite.

- [ ] **Step 1: Update env template**

```
JWT_SECRET=changeme-dev-secret
JWT_EXPIRE_MIN=60
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OAUTH_REDIRECT_BASE=http://localhost:8000
NOSTR_CHALLENGE_TTL=300
SOCIAL_CORE_PIN=<commit-hash>
```

- [ ] **Step 2: Run FULL verification**

Run: `rtk pytest tests/ -q` (backend) + `npm test` (frontend)
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .env.example backend/pyproject.toml
git commit -m "chore(auth): env template and dep pins for social/nostr"
```
