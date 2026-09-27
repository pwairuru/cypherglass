# Migrations

Plain-SQL, idempotent migrations. No Alembic scaffold (deferred until the
schema stabilizes).

## Run

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db \
  .venv/bin/python migrations/001_auth_user_social.py
```

Re-running is safe (`IF NOT EXISTS` everywhere).

## Prod gate

`001_auth_user_social` MUST be applied to prod BEFORE deploying the auth
branch. The app never auto-runs migrations on import or startup (keeps the
test suite green without a live database). Add the command above as an
explicit deploy step / CI gate.

## Adding a new migration

1. Copy `001_auth_user_social.py` to `00N_<name>.py`, replace `STATEMENTS`.
2. Keep every statement idempotent.
3. Document the prod-gate requirement here.
