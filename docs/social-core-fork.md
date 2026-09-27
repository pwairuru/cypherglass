# social-core fork (Nostr backend)

Upstream: `python-social-auth/social-core` @ 5.x. Our fork adds one isolated
file — `social_core/backends/nostr.py` — with no core patches, so `master`
stays merge-clean.

## Fork steps

1. Clone upstream and cut a branch:
   ```bash
   git clone https://github.com/python-social-auth/social-core
   cd social-core
   git checkout -b nostr-backend
   ```
2. Copy the fork candidate verbatim:
   ```bash
   cp <cypherglass>/backend/app/auth/backends/nostr.py social_core/backends/nostr.py
   ```
   Then **inline** `verify_nostr_event` — replace
   `from app.auth.nostr_crypto import verify_nostr_event` with a copy of
   `backend/app/auth/nostr_crypto.py` (NIP-01 id recompute + BIP-340 Schnorr).
   The fork file must be self-contained; it must not import from the app.
3. Add the `secp256k1` extra to the fork's `pyproject.toml`:
   ```toml
   [project.optional-dependencies]
   nostr = ["secp256k1>=0.28"]
   ```
   (lib path uses `coincurve` when present, else the inlined pure-Python
   BIP-340 fallback.)
4. Add fork CI vectors: `social_core/tests/backends/test_nostr.py` with fixed
   vectors (key / pub / event / sig), including the NIP-98 header decode path
   (kind 27235, `u` == request URL, `method` == HTTP method, ±60s clock).
5. Tag and pin:
   ```bash
   git tag 5.x+nostr1 && git push origin nostr-backend 5.x+nostr1
   ```
   Backend dep (commit-hash pinned):
   ```
   social-auth-core @ git+https://github.com/<org>/social-core@<commit>#egg=social-auth-core
   ```

## Current backend state (pre-fork)

Until the fork repo exists, `backend` depends on upstream
`social-auth-core>=5.0` from PyPI plus a thin local adapter:

- `backend/app/auth/backends/nostr.py` — `NostrAuth(BaseAuth)`, `name="nostr"`,
  challenge flow (`auth_url` raises; `auth_complete(response=event)` verifies
  the Nostr event). Import falls back to a minimal `BaseAuth` shim when
  `social_core` is absent.
- `backend/app/auth/psa.py` — `get_oauth_url(provider)` (google/github only,
  unknown -> `ValueError`/HTTP 400), `complete_oauth(provider, code, state)`
  (httpx token exchange + userinfo, failures -> `OAuthError`/HTTP 502).
- Challenge/verify HTTP endpoints live in `backend/app/auth/router.py`
  (`POST /nostr/challenge|verify`); OAuth endpoints
  (`GET /oauth/{provider}/start|callback`) link-or-create `User` +
  `SocialAuth` rows. `associate_by_email` stays disabled (takeover risk).

## Upstream sync

Keep `nostr-backend` rebased on upstream `master`; the Nostr file is
isolated so merges stay trivial. Sync checklist: re-run fork vectors +
backend `tests/test_oauth.py` + `tests/test_nostr.py` after each rebase.
