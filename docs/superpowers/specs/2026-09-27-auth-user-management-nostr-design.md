# CypherGlass Auth: User Management + social-core Fork with Nostr — Design

Date: 2026-09-27
Status: approved design, awaiting spec review
Scope: registration + user management + PSA social-core fork (Nostr + Google + GitHub)

## 1. Context

Backend (`backend/app`): FastAPI + SQLModel + asyncpg. Existing auth minimal:
`User(id, username unique, password_hash, is_active)`, `POST /api/v1/auth/login`
with bcrypt + HS256 JWT (`sub=username`), `get_current_user` returns username
string. Dev seed fallback `admin/admin` when table empty. No registration,
no profile, no OAuth, no Nostr.

Frontend: `/login` + `/` dashboard behind `RequireAuth`, `AuthContext` holds JWT.

Requirement: proper user auth + management; all social logins via
`python-social-auth/social-core`; Nostr login requires own fork with added
Nostr backend; manage users (self-register + profile + admin).

Decisions from brainstorming:
- Nostr UX: NIP-07 extension primary + QR path (NostrConnect NIP-46, e.g. Amber mobile signer).
- Registration: public self-register + profile read/update + password change + admin list/disable.
- Integration: pip fork as package (`cypherglass/social-core`), plus Google auth and one more (GitHub).

## 2. Architecture

```
frontend (React)                    backend (FastAPI)                     fork
Login/Register/Profile/Admin  -->  /register /login /me /users      -->  n/a (local passwords)
  window.nostr / NostrConnect QR -> POST /nostr/challenge|verify     -->  social_core.backends.nostr.NostrAuth
  Google/GitHub buttons       -->  GET /oauth/{p}/start + callback  -->  social_core.backends.google/google-oauth2,
                                                                       github, + NostrAuth (same pipeline tail)
                                   PSA pipeline tail: social_details -> social_user ->
                                   get_username -> create_user -> associate_user ->
                                   load_extra_data -> user_details -> JWT issue
```

Why thin adapter (approach A): full `social-app-*` stacks assume Django ORM
and duplicate User models; local JWT already exists and metrics guard expects
Bearer. A ~200-line FastAPI strategy + SQLModel storage shim reuses
`social-core` backends + pipeline without Django baggage. Fork stays
mergeable with upstream.

Non-goals (v1): email verification mail, password reset mail, 2FA, roles
beyond `is_admin`, relay profile fetch (NIP-05/kind-0 optional later).

## 3. Data model

Extend `app/auth/models.py`:

```python
class User(SQLModel, table=True):
    id: UUID PK
    username: str unique index
    email: str | None unique index nullable
    display_name: str | None
    npub: str | None unique index nullable   # hex pubkey, bech32 derived client-side
    avatar_url: str | None
    password_hash: str = ""                   # empty for pure-social accounts
    is_active: bool = True
    is_admin: bool = False
    created_at / updated_at: datetime
```

New:

```python
class SocialAuth(SQLModel, table=True):
    id: UUID PK
    user_id: UUID FK -> User
    provider: str   # 'nostr' | 'google' | 'github'
    uid: str        # npub hex for nostr, provider sub/id otherwise
    extra_data: dict (JSON/SA JSONB)
    created_at
    UniqueConstraint(provider, uid)
```

Migration: Alembic revision (new `backend/alembic/` or SQLModel `create_all`
migration script — pick Alembic, repo already depends on it). Backfill: existing
rows get `is_admin=false`, nulls elsewhere. Seed admin via env preserved.

## 4. Fork: cypherglass/social-core + Nostr backend

- Fork `python-social-auth/social-core` @ 5.x to `github.com/<org>/social-core`,
  branch `nostr-backend`, tag `5.x+nostr1`.
- New file `social_core/backends/nostr.py`:

```python
class NostrAuth(BaseAuth):
    name = "nostr"
    def get_user_id(self, details, response): return response["pubkey"]
    def get_user_details(self, response): ...
    def auth_url(self): raise AuthException("challenge flow, no redirect")
    def auth_complete(self, *a, **kw): verify event, return user pipeline data
```

- Verification (server-side, no trust in client):
  - NIP-01: recompute event `id` = sha256(canonical serialize), BIP-340 Schnorr
    verify `sig` against `pubkey`. Dep: `secp256k1` (preferred) fallback `coincurve`.
  - Challenge flow (NIP-07 signing of app challenge): event kind 27235 or
    app-defined kind with `content=challenge`; `created_at` within ±300s;
    challenge matches Valkey entry, single-use.
  - NIP-98 path: kind MUST be 27235; `u` == exact request URL; `method` == HTTP
    method; `created_at` within 60s; optional `payload` sha256 check on POST.
- `pyproject.toml`: extra `nostr = ["secp256k1>=0.28"]`, unit tests
  `social_core/tests/backends/test_nostr.py` with fixed vectors (key/pub/event/sig).
- Upstream sync: keep `master` merge-clean; Nostr file isolated, no core patches.
- Backend dep change: `social-auth-core @ git+https://github.com/<org>/social-core@nostr-backend#egg=social-auth-core`
  pinned to commit hash in `pyproject.toml`.

## 5. Backend API

Prefix `/api/v1/auth` (existing `/login` kept backward-compat).

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/register` | public, rate-limited | {username,email,password} -> validate, bcrypt(12), create User, 201 + TokenOut |
| POST | `/login` | public | unchanged + email allowed as identifier |
| GET | `/me` | JWT | return profile incl. providers list |
| PATCH | `/me` | JWT | display_name, avatar_url, email |
| POST | `/change-password` | JWT (password users) | old+new, rehash |
| GET | `/users` | admin | paginated list, filter `?q=&active=` |
| PATCH | `/users/{id}` | admin | is_active, is_admin, display_name |
| GET | `/oauth/{provider}/start` | public | returns `{auth_url, state}`; providers `google`, `github` |
| GET | `/oauth/{provider}/callback` | public | code+state -> backend exchange via social-core -> pipeline -> JWT |
| POST | `/nostr/challenge` | public, rate-limited | {pubkey hex} -> {challenge, expires_in:300}; store Valkey `nostr:chal:{pubkey}` |
| POST | `/nostr/verify` | public | {event{id,pubkey,created_at,kind,tags,content,sig}} -> verify -> link-or-create User(npub)+SocialAuth -> JWT |
| POST | `/oauth/{provider}/unlink` | JWT | disconnect if password or another provider remains |

Pipeline (shared OAuth + Nostr tail): `social_details -> social_user ->
get_username -> create_user -> associate_user -> load_extra_data ->
user_details`. Implement `FastAPIStrategy` (settings bridge, session access)
and `SQLModelStorage` (`user.get_social_auth`, `create_social_auth`) in
`app/auth/psa.py` (~200 lines). `associate_by_email` stays DISABLED (takeover
risk); link only when JWT present or explicit verify.

JWT: keep HS256, `sub=username`, add `uid=str(user.id)` claim (backward-compat:
`get_current_user` accepts old tokens). Expiry `jwt_expire_min`.

Config env: `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
`OAUTH_REDIRECT_BASE`, `NOSTR_CHALLENGE_TTL=300`, `SOCIAL_CORE_VERSION_PIN`.

## 6. Frontend

- `/login`: tabs [Password | Nostr | Social]. Social buttons redirect to
  `oauth/{p}/start`. Nostr button: if `window.nostr` -> `getPublicKey()` ->
  fetch challenge -> `signEvent(challengeEvent)` -> `verify`. Else "QR / mobile"
  button opens modal with `nostrconnect://` URI (NIP-46 via `nostr-tools/nip46`
  + `qrcode.react`), Amber signs, same verify call.
- `/register`: username/email/password + "continue with Nostr/Google".
- `/profile`: display_name, avatar, email, linked providers + unlink, change password.
- `/admin/users`: table (username, email, npub short, providers, active, admin),
  disable/enable, grant admin. Guard by `is_admin` from `/me`.
- Deps: `nostr-tools`, `qrcode.react`. `AuthContext` extended: `{token, user, npub, providers}`.

## 7. Error handling

- Register: 409 username/email taken (generic message to avoid enumeration +
  rate limit). Validation 422 via Pydantic.
- OAuth: state mismatch -> 401; provider error -> 502 with `detail=provider_error`;
  `AuthForbidden` -> 403.
- Nostr verify: bad sig / expired challenge / reused challenge / clock skew ->
  401 `invalid_nostr_event`; challenge missing -> 404. Valkey failure -> 503,
  no fallback issuance (fail-closed).
- Admin endpoints: non-admin -> 403 (not 404, internal tool).
- Seed `admin/admin` fallback unchanged, only when table empty + non-prod.

## 8. Testing

- Backend pytest: register 201 + duplicate 409; login password + email;
  `/me` round-trip; change-password; admin list/patch + 403 for non-admin;
  Nostr verify with fixed test vector (known privkey -> event -> sig) + replay
  (second verify 401) + expired challenge 401; OAuth callback mocked
  (`auth_complete` patched) for google + github.
- Fork repo CI: `test_nostr.py` vectors incl. NIP-98 header decode path.
- Frontend: vitest for Nostr modal state machine (extension / QR / error);
  Playwright headed smoke: register -> login -> profile update.
- Perf: challenge endpoints p95 < 100ms local (Schnorr verify ~1ms); no relay calls server-side.

## 9. Rollout

1. Migration + User/SocialAuth models, register/me/admin endpoints, tests.
2. Fork repo + Nostr backend + vectors, pin dep.
3. Nostr challenge/verify + Valkey store + tests.
4. OAuth start/callback (google, github) + tests.
5. Frontend auth pages + Nostr modal + admin table.
6. Docs `.env.example` update, prod secret checklist.

## 10. Open items (explicit)

- Nostr account email optional; username auto `nostr_<npub[0:8]>`, user can rename.
- No relay writes/reads server-side v1.
- `is_admin` bootstrap: first user or `SEED_ADMIN_USER` env; later via DB flag.
