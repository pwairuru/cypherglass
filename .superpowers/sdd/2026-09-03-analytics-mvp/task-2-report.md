# Task 2 Report — Auth JWT login-required

## Status: DONE

## TDD
- RED: wrote `backend/tests/test_auth.py`, ran
  `cd backend && .venv/bin/python -m pytest tests/test_auth.py -v` →
  `FAILED assert 404 == 200` on login (expected, no auth router yet).
- GREEN: implemented `backend/app/auth/*` + wired `main.py`, ran
  `cd backend && .venv/bin/python -m pytest tests -v` → **2 passed**
  (test_auth + test_health, Python 3.12.13).

## Files created / changed
- `backend/app/auth/__init__.py` (empty)
- `backend/app/auth/models.py` — `User` SQLModel (uuid PK, unique username,
  password_hash, is_active)
- `backend/app/auth/schemas.py` — `LoginIn`, `TokenOut`
  (access_token + token_type default "bearer")
- `backend/app/auth/service.py` — bcrypt `hash_password`/`verify_password`,
  `create_token(sub)` PyJWT HS256 + expiry, `authenticate()` with documented
  dev fallback: DB missing/empty/unreachable → accept `SEED_ADMIN_USER` /
  `SEED_ADMIN_PASSWORD` (default admin/admin); real users present → DB-only
  verify. Uses `os.getenv` so `config.py` untouched.
- `backend/app/auth/deps.py` — `HTTPBearer(auto_error=False)` +
  `get_current_user()` returning sub str, 401 on missing/invalid/expired token
  (403 avoided via auto_error=False)
- `backend/app/auth/router.py` — `POST /api/v1/auth/login`, 401 on bad creds
- `backend/app/main.py` — direct auth router import (guarded import replaced);
  metrics guarded import kept
- `backend/tests/test_auth.py` — brief test (see deviations)

## Verification
- `cd backend && .venv/bin/python -m pytest tests -v` → **2 passed**.
- Warnings only (pre-existing anyio/httpx deprecations + PyJWT
  InsecureKeyLengthWarning from short dev `jwt_secret`; deploy must override,
  as flagged in Task 1 report).
- Scope respected: no metrics/workers/frontend/config files touched.
- Self-review YAGNI: no extra endpoints/fields beyond brief + one placeholder
  below; cleaned stray `.pyc` from index before finalizing commit.

## Commits
- `82341d9` feat: jwt login-required auth (brief commit `eb3b6e6` amended to
  drop 6 committed `__pycache__/.pyc` files; content identical)

## Deviations from brief (deliberate, documented)
1. `git add` extended with `backend/app/main.py` — brief's add-list omitted it,
   but wiring lives there; without it login stays 404.
2. Test signature `def test_login_and_guard(client=None)` instead of `(client)` —
   no `client` fixture exists, so verbatim form errors at setup; default None
   keeps body verbatim (builds own TestClient).
3. `backend/app/main.py` holds a 4-line guarded `GET /api/v1/metrics`
   placeholder (`TASK3-REPLACE` comment) returning `[]` behind
   `get_current_user`. Reason: brief test asserts unauthed `/metrics` → 401,
   impossible with no metrics route (unknown path → 404 regardless of auth).
   No `metrics/` files touched. **Task 3 must delete this route** when adding
   the real router (first-registered route wins on duplicate paths).

## Concerns
- `authenticate()` catches broad `Exception` around the DB query so tests pass
  without Postgres; a transient DB failure with existing users would fall back
  to seed check (seed won't match real creds, so fail-closed unless attacker
  knows seed). Acceptable dev fallback; Task 3+ can narrow to
  `SQLAlchemyError` + connection errors.
- `get_current_user` returns username str, not a `User` row — sufficient for
  Task 3 guard; upgrade later if per-user DB lookups needed.
- `.gitignore` still missing `.venv/`, `__pycache__/`, `*.egg-info/`
  (Task 1 concern, still open); `docs/superpowers/plans/2026-09-03-analytics-mvp.md`
  untracked, left alone.

---

## Fix round 1/5 (review findings applied)

Findings (verbatim from `task-2-review.md`):
1. `service.py` full-table `select(User)`+python filter → use `where(username==)`.
2. broad `except`→seed fallback fail-open → narrow to table-missing/setup,
   fail-closed after users exist.
3. default seed `admin/admin` all envs → gate behind non-prod or
   `ALLOW_SEED_FALLBACK=1`.
4. `verify_password` malformed hash throws 500 → `try/except ValueError→False`.
5. `main.py` `TASK3-REPLACE` shadow risk — leave marker but ensure comment
   says Task3 MUST delete placeholder (no code change needed beyond comment
   if already clear).

Minors deferred (NOT fixed): `os.getenv` vs `settings`, `password_hash`
default, `TestClient` context.

### Changes
- `backend/app/auth/service.py`
  - (1) `authenticate()` queries
    `select(User).where(User.username == username)` + `scalars().first()`;
    emptiness check via `select(User.id).limit(1)`.
  - (2) narrowed seed fallback to `_SETUP_ERRORS =
    (SQLAlchemyError, OSError, ConnectionError, TimeoutError) +
    asyncpg (PostgresError, InterfaceError)`; any other `Exception` →
    `return None` (fail-closed). When username misses but table holds rows →
    `return None` (fail-closed); seed only when table empty/unreachable.
    Note: first run caught only `(SQLAlchemyError, OSError)` and broke login
    (401) because local failure surfaces as raw
    `asyncpg.exceptions.InvalidPasswordError`; widened to asyncpg errors.
  - (3) added `_seed_allowed()`: `ALLOW_SEED_FALLBACK==1` overrides; else
    `ENV`/`APP_ENV` (default `dev`) must not be `prod`/`production`.
    `_seed_user()` returns `None` when not allowed → prod fail-closed.
  - (4) `verify_password()` wraps `bcrypt.checkpw` in `try/except ValueError
    → False` (keeps `not password_hash → False`).
  - docstring updated to document gating + fail-closed.
- `backend/app/main.py`
  - (5) `TASK3-REPLACE` comment now reads "Task 3 MUST delete this route";
    placeholder code untouched.

### Tests
- Command: `cd backend && .venv/bin/python -m pytest
  tests/test_auth.py tests/test_health.py -v`
- Output: **2 passed** (`test_login_and_guard`, `test_health`;
  warnings only: starlette/anyio deprecations + PyJWT
  `InsecureKeyLengthWarning` short dev `jwt_secret`).
- Extra sanity: `verify_password('x','not-a-hash') → False`;
  `ENV=prod → _seed_allowed False, _seed_user None`;
  `ENV=prod + ALLOW_SEED_FALLBACK=1 → allowed, seed returned`.
