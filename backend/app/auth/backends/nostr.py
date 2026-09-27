# backend/app/auth/backends/nostr.py — VERBATIM fork candidate for
# cypherglass/social-core.
#
# FORK INSTRUCTIONS (to vendor into upstream `social-core`):
#   1. Clone https://github.com/python-social-auth/social-core, branch `nostr-backend`.
#   2. Copy THIS FILE to `social_core/backends/nostr.py` unchanged, except:
#      replace the import below with an INLINED copy of
#      `backend/app/auth/nostr_crypto.py::verify_nostr_event`
#      (NIP-01 id recompute + BIP-340 Schnorr; keep the file self-contained —
#      the fork must not import from the app package).
#   3. Add extra `nostr = ["secp256k1>=0.28"]` to the fork's pyproject.
#   4. Add `social_core/tests/backends/test_nostr.py` with fixed vectors.
#   5. Tag `5.x+nostr1`, pin backend dep to the commit hash.
# This file stays merge-clean: isolated, no core patches.
#
# NOTE: this module intentionally keeps working when `social_core` is not
# installed (tests import it without the fork present) by falling back to a
# minimal BaseAuth-compatible shim. With the real package installed the
# except-branch never runs.

try:
    from social_core.backends.base import BaseAuth
except ImportError:  # pragma: no cover - social-auth-core installed in backend env

    class BaseAuth:  # minimal shim mirroring the BaseAuth surface we use
        name = ""


from app.auth.nostr_crypto import verify_nostr_event  # fork version inlines this


class NostrAuth(BaseAuth):
    name = "nostr"

    def get_user_id(self, details, response):
        return response.get("pubkey")

    def get_user_details(self, response):
        pub = response.get("pubkey", "")
        return {"username": f"nostr_{pub[:8]}", "fullname": "", "email": ""}

    def auth_url(self):
        raise NotImplementedError("nostr uses challenge flow")

    def auth_complete(self, *args, **kwargs):
        response = kwargs.get("response", {})
        if not verify_nostr_event(response):
            raise ValueError("bad signature")
        return {"uid": response["pubkey"], "details": self.get_user_details(response)}
